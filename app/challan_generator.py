"""
LaneShift — Module 4: Auto-Challan Record Generator
=====================================================
Deployable version of the auto-validation module.

Takes violations already classified as auto_validatable=True by the
existing classify_auto_validatable() classifier and produces complete,
structured challan-ready records for handoff to BTP's existing SCITA pipeline.

SCOPE BOUNDARY:
  vehicle_number (a license plate) is a public registration number visible
  on the vehicle — it is NOT personal identity. This module correctly stops
  at the license plate and never resolves it to an owner name, phone, or address.
  That lookup lives entirely within BTP's existing authorized VAHAN/SCITA system,
  unchanged by LaneShift.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine
from auto_validation import classify_auto_validatable, LEAKED_STATUSES
from severity_weights import OFFENCE_CODE_SEVERITY, DEFAULT_SEVERITY

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH      = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/challan", tags=["challan"])

ROUTING_NOTE = (
    "This record is structured for handoff to BTP's existing SCITA/VAHAN-integrated "
    "challan and notification pipeline. LaneShift does not resolve vehicle owner "
    "identity or deliver notifications directly — that remains within BTP's existing "
    "authorized system, unchanged."
)

# ── Cache ──────────────────────────────────────────────────────────────────────
@dataclass
class _CacheEntry:
    data: Any
    ts: datetime
    def is_expired(self) -> bool:
        return (datetime.utcnow() - self.ts).total_seconds() > 300

_cache: Dict[str, _CacheEntry] = {}

def _cache_get(k):
    e = _cache.get(k)
    if e is None or e.is_expired():
        if e: del _cache[k]
        return None
    return e.data

def _cache_set(k, v):
    _cache[k] = _CacheEntry(data=v, ts=datetime.utcnow())


# ── Core record builder ────────────────────────────────────────────────────────

def _auto_validation_basis(violation_row: dict) -> str:
    """Human-readable string explaining WHY this record qualified."""
    parts = [
        "Single violation type (no multi-label ambiguity)",
        "Vehicle registration number uncontested (no downstream correction recorded)",
        "Passed upstream SCITA integration check",
        "Violation severity below mandatory human-review threshold (severity < 9)",
    ]
    vn = violation_row.get("vehicle_number", "")
    uvn = violation_row.get("updated_vehicle_number", "")
    if uvn and uvn.strip() == vn.strip():
        parts[1] = "Vehicle registration number confirmed (updated_vehicle_number matches original)"
    return " · ".join(parts)


def generate_challan_record(violation_row: dict) -> dict:
    """
    Produce a complete, structured challan-ready record from one violation.

    Args:
        violation_row: dict with keys from the Violation ORM model.

    Returns:
        dict matching the challan record schema.
    """
    vid      = violation_row.get("id", "UNKNOWN")
    challan_id = f"CH-{vid}"

    # Parse offence code for display
    raw = violation_row.get("offence_code", "[]")
    if isinstance(raw, str):
        try:
            codes = json.loads(raw)
        except Exception:
            codes = []
    else:
        codes = list(raw) if raw else []

    # Parse violation type list
    raw_vt = violation_row.get("violation_type", "[]")
    if isinstance(raw_vt, str):
        try:
            vt_list = json.loads(raw_vt)
        except Exception:
            vt_list = []
    else:
        vt_list = list(raw_vt) if raw_vt else []

    # Location: prefer named junction, fall back to location string
    jn       = violation_row.get("junction_name") or ""
    location = jn if jn and jn != "No Junction" else (violation_row.get("location") or "Unknown location")

    # Timestamp
    ts = violation_row.get("created_ist") or violation_row.get("created_datetime")
    ts_str = ts.isoformat() if hasattr(ts, "isoformat") else str(ts) if ts else None

    return {
        "challan_id":            challan_id,
        "source_violation_id":   vid,
        "vehicle_number":        violation_row.get("vehicle_number"),
        "vehicle_type":          violation_row.get("vehicle_type") or violation_row.get("updated_vehicle_type"),
        "violation_type":        violation_row.get("primary_violation") or (vt_list[0] if vt_list else "UNKNOWN"),
        "violation_type_full":   vt_list,
        "offence_code":          codes,
        "location":              location,
        "police_station_jurisdiction": violation_row.get("police_station"),
        "timestamp_ist":         ts_str,
        "congestion_cost_score": violation_row.get("congestion_cost_score"),
        "auto_validation_basis": _auto_validation_basis(violation_row),
        "status":                "READY_FOR_SCITA_SUBMISSION",
        "routing_note":          ROUTING_NOTE,
        "generated_at":          datetime.utcnow().isoformat(),
    }


def generate_challan_batch(
    db_path: str = DB_PATH,
    violation_ids: Optional[List[str]] = None,
    limit: int = 100,
) -> Dict[str, Any]:
    """
    Generate challan records for all auto_validatable=True violations.
    If violation_ids provided, restrict to those IDs.
    """
    cache_key = f"challan_batch:{','.join(sorted(violation_ids)) if violation_ids else 'all'}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    engine  = get_engine(db_path)
    session = sessionmaker(bind=engine)()
    try:
        q = session.query(Violation).filter(
            Violation.validation_status.in_(LEAKED_STATUSES)
        )
        if violation_ids:
            q = q.filter(Violation.id.in_(violation_ids))
        rows = q.limit(limit * 5).all()   # over-fetch then filter
    finally:
        session.close()

    records = []
    for row in rows:
        v = {
            "id": row.id,
            "violation_count":        row.violation_count,
            "vehicle_number":         row.vehicle_number,
            "updated_vehicle_number": row.updated_vehicle_number,
            "data_sent_to_scita":     row.data_sent_to_scita,
            "offence_code":           row.offence_code,
            "violation_type":         row.violation_type,
            "primary_violation":      row.primary_violation,
            "location":               row.location,
            "junction_name":          row.junction_name,
            "police_station":         row.police_station,
            "vehicle_type":           row.vehicle_type,
            "updated_vehicle_type":   row.updated_vehicle_type,
            "created_ist":            row.created_ist,
            "congestion_cost_score":  row.congestion_cost_score,
        }
        if classify_auto_validatable(v, OFFENCE_CODE_SEVERITY):
            records.append(generate_challan_record(v))
            if len(records) >= limit:
                break

    result = {
        "total_generated":  len(records),
        "limit_applied":    len(records) == limit,
        "generated_at":     datetime.utcnow().isoformat(),
        "routing_note":     ROUTING_NOTE,
        "records":          records,
    }
    _cache_set(cache_key, result)
    return result


def get_challans_ready_count(db_path: str = DB_PATH) -> int:
    """Fast count of records that would generate a challan — used by dashboard."""
    cached = _cache_get("challan_count")
    if cached is not None:
        return cached
    # Reuse the simulation report count which is already cached
    from auto_validation import run_simulation_report
    sim = run_simulation_report(db_path)
    count = sim.get("would_have_been_auto_validatable", 0)
    _cache_set("challan_count", count)
    return count


# ── In-memory challan store (for demo GET by ID) ──────────────────────────────
_challan_store: Dict[str, dict] = {}


def _ensure_store_populated(db_path: str):
    if _challan_store:
        return
    batch = generate_challan_batch(db_path, limit=200)
    for rec in batch["records"]:
        _challan_store[rec["challan_id"]] = rec


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post(
    "/generate-batch",
    summary="Generate auto-challan records for all qualifying violations",
)
async def generate_batch(violation_ids: Optional[List[str]] = None, limit: int = 50):
    """
    Generates challan records for auto_validatable=True violations.
    Pass violation_ids to restrict to specific records, or omit for all (up to limit).
    """
    try:
        limit = max(1, min(500, limit))
        result = generate_challan_batch(DB_PATH, violation_ids, limit)
        # Populate store for GET-by-ID
        for rec in result["records"]:
            _challan_store[rec["challan_id"]] = rec
        return result
    except Exception as exc:
        logger.exception("Error in /api/challan/generate-batch")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get(
    "/preview",
    summary="Preview 10 auto-challan records without generating the full batch",
)
async def preview_challans():
    """Returns 10 sample auto-challan records for the demo screen."""
    try:
        result = generate_challan_batch(DB_PATH, limit=10)
        for rec in result["records"]:
            _challan_store[rec["challan_id"]] = rec
        return result
    except Exception as exc:
        logger.exception("Error in /api/challan/preview")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get(
    "/{challan_id}",
    summary="Retrieve a single generated challan record by ID",
)
async def get_challan(challan_id: str):
    try:
        _ensure_store_populated(DB_PATH)
        rec = _challan_store.get(challan_id)
        if not rec:
            return JSONResponse(status_code=404, content={"error": f"Challan {challan_id} not found."})
        return rec
    except Exception as exc:
        logger.exception("Error in /api/challan/%s", challan_id)
        return JSONResponse(status_code=500, content={"error": str(exc)})
