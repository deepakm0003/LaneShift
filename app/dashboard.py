"""
Dashboard Summary Endpoint — LaneShift
=======================================
Single endpoint that powers the main demo screen.

Returns everything needed for the primary view in one HTTP call so the frontend
never has to fan out 5 separate requests on load.

Internally calls the already-built functions from dispatch.py and
auto_validation.py — no logic is duplicated here.  The result is cached with
the same 5-minute TTL used across the rest of the backend.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine
from dispatch import (
    get_live_queue,
    get_validation_leak_report,
    get_dataset_date_range,
)
from auto_validation import run_simulation_report, project_full_pipeline_outcome
from persistent_hotspots import get_tier1_count
from challan_generator import get_challans_ready_count

logger = logging.getLogger(__name__)

# ── Cache (same pattern as dispatch / auto_validation) ────────────────────────

_CACHE_TTL_SECONDS = 300

@dataclass
class _CacheEntry:
    data: Any
    created_at: datetime

    def is_expired(self) -> bool:
        return (datetime.utcnow() - self.created_at).total_seconds() > _CACHE_TTL_SECONDS


_cache: Dict[str, _CacheEntry] = {}


def _cache_get(key: str) -> Optional[Any]:
    entry = _cache.get(key)
    if entry is None:
        return None
    if entry.is_expired():
        del _cache[key]
        return None
    return entry.data


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = _CacheEntry(data=data, created_at=datetime.utcnow())


# ── Config ────────────────────────────────────────────────────────────────────

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _top_violation_types(db_path: str, top_n: int = 5) -> List[Dict[str, Any]]:
    """Return the top N primary_violation types by count across the full dataset."""
    engine = get_engine(db_path)
    session = sessionmaker(bind=engine)()
    try:
        rows = (
            session.query(
                Violation.primary_violation,
                func.count(Violation.id).label("cnt"),
            )
            .filter(Violation.primary_violation.isnot(None))
            .group_by(Violation.primary_violation)
            .order_by(func.count(Violation.id).desc())
            .limit(top_n)
            .all()
        )
        return [{"type": r.primary_violation, "count": int(r.cnt)} for r in rows]
    finally:
        session.close()


def _midblock_share(db_path: str) -> float:
    """Percentage of all violations where junction_name == 'No Junction'."""
    engine = get_engine(db_path)
    session = sessionmaker(bind=engine)()
    try:
        total = session.query(func.count(Violation.id)).scalar() or 0
        no_junction = (
            session.query(func.count(Violation.id))
            .filter(Violation.junction_name == "No Junction")
            .scalar()
            or 0
        )
        if total == 0:
            return 0.0
        return round((no_junction / total) * 100, 2)
    finally:
        session.close()


# ── Core business logic ───────────────────────────────────────────────────────

def build_dashboard_summary(db_path: str = DB_PATH) -> Dict[str, Any]:
    """
    Assemble the full dashboard payload.

    Delegates to:
      - dispatch.get_live_queue()               → live_dispatch_queue_top_10
      - dispatch.get_validation_leak_report()   → stations_requiring_attention
      - dispatch.get_dataset_date_range()       → date_range
      - auto_validation.run_simulation_report() → validation_leak_summary
      - Local DB queries                        → top_violation_types, midblock share
    """
    cache_key = "dashboard_summary"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    # ── Date range ────────────────────────────────────────────────────────────
    min_dt, max_dt = get_dataset_date_range(db_path)
    date_range = {
        "start": min_dt.isoformat() if min_dt else None,
        "end": max_dt.isoformat() if max_dt else None,
    }

    # ── Total violations ──────────────────────────────────────────────────────
    engine = get_engine(db_path)
    session = sessionmaker(bind=engine)()
    try:
        total = session.query(func.count(Violation.id)).scalar() or 0
    finally:
        session.close()

    # ── Top violation types ───────────────────────────────────────────────────
    top_violation_types = _top_violation_types(db_path, top_n=5)

    # ── Validation leak summary (from Module 4 + direct null-status count) ───
    sim = run_simulation_report(db_path)

    # Count records with null validation_status (never entered the pipeline)
    engine2 = get_engine(db_path)
    session2 = sessionmaker(bind=engine2)()
    try:
        null_status_count = (
            session2.query(func.count(Violation.id))
            .filter(Violation.validation_status.is_(None))
            .scalar()
            or 0
        )
    finally:
        session2.close()

    records_with_status = total - null_status_count
    rejected_or_stuck = sim["currently_rejected_or_stuck"]
    # "leak" framing A: among the 173K records that got a status
    leak_rate_of_processed = round(
        (rejected_or_stuck / records_with_status * 100) if records_with_status else 0, 2
    )
    # "leak" framing B: among ALL 298K records (includes never-processed)
    total_unresolved = rejected_or_stuck + null_status_count
    overall_leak_rate = round(
        (total_unresolved / total * 100) if total else 0, 2
    )

    validation_leak_summary = {
        "total_records": total,
        "records_with_validation_status": int(records_with_status),
        "records_with_null_status": int(null_status_count),
        "null_status_pct": round((null_status_count / total * 100) if total else 0, 2),
        "of_processed_records": {
            "total_rejected_or_stuck": rejected_or_stuck,
            "leak_rate_pct": leak_rate_of_processed,
        },
        "of_all_records": {
            "total_rejected_stuck_or_unprocessed": int(total_unresolved),
            "overall_leak_rate_pct": overall_leak_rate,
        },
        "potential_recovery_via_auto_validation_pct": sim["potential_leak_recovery_pct"],
    }

    # ── Full pipeline projection — the hero number for the frontend ───────────
    projection = project_full_pipeline_outcome(db_path)
    void_recovery_pct = projection["headline_recovery_number"][
        "records_recovered_from_void_pct_of_total"
    ]
    # Inject into the leak summary so the frontend needs only one field
    validation_leak_summary["projected_void_recovery_pct"] = void_recovery_pct

    # ── Live dispatch queue top 10 (from Module 3) ────────────────────────────
    live_queue_data = get_live_queue(db_path, limit=1000)
    live_dispatch_queue_top_10 = live_queue_data["queue"][:10]

    # ── Stations requiring attention — top 5 by rejection rate ───────────────
    leak_report = get_validation_leak_report(db_path)
    stations_requiring_attention = leak_report[:5]

    # ── Mid-block violation share ─────────────────────────────────────────────
    midblock_violation_share_pct = _midblock_share(db_path)

    # ── Module 6: Tier-1 persistent hotspot count ─────────────────────────────
    try:
        tier_1_escalation_count = get_tier1_count(db_path)
    except Exception as _e:
        logger.warning("Could not compute tier_1_escalation_count: %s", _e)
        tier_1_escalation_count = 0

    # ── Module 4: Challans ready for submission ────────────────────────────────
    try:
        challans_ready_count = get_challans_ready_count(db_path)
    except Exception as _e:
        logger.warning("Could not compute challans_ready_count: %s", _e)
        challans_ready_count = 0

    result: Dict[str, Any] = {
        "total_violations_analyzed": total,
        "date_range": date_range,
        "top_violation_types": top_violation_types,
        "validation_leak_summary": validation_leak_summary,
        "live_dispatch_queue_top_10": live_dispatch_queue_top_10,
        "stations_requiring_attention": stations_requiring_attention,
        "midblock_violation_share_pct": midblock_violation_share_pct,
        "tier_1_escalation_count": tier_1_escalation_count,
        "challans_ready_for_submission_count": challans_ready_count,
    }

    _cache_set(cache_key, result)
    return result


# ── Pydantic response models ──────────────────────────────────────────────────

class ViolationTypeStat(BaseModel):
    type: str
    count: int


class DateRange(BaseModel):
    start: Optional[str]
    end: Optional[str]


class ValidationLeakSummary(BaseModel):
    total_records: int
    records_with_validation_status: int
    records_with_null_status: int
    null_status_pct: float
    of_processed_records: Dict[str, Any]
    of_all_records: Dict[str, Any]
    potential_recovery_via_auto_validation_pct: float
    projected_void_recovery_pct: float


class DashboardSummary(BaseModel):
    total_violations_analyzed: int
    date_range: DateRange
    top_violation_types: List[ViolationTypeStat]
    validation_leak_summary: ValidationLeakSummary
    live_dispatch_queue_top_10: List[Dict[str, Any]]
    stations_requiring_attention: List[Dict[str, Any]]
    midblock_violation_share_pct: float
    tier_1_escalation_count: int = 0
    challans_ready_for_submission_count: int = 0


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.get(
    "/summary",
    response_model=DashboardSummary,
    summary="Full dashboard summary (single-call demo endpoint)",
    description=(
        "Returns everything needed to render the primary demo screen in one request. "
        "Cached for 5 minutes."
    ),
)
async def dashboard_summary():
    try:
        return build_dashboard_summary(DB_PATH)
    except Exception as exc:
        logger.exception("Error in /api/dashboard/summary")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get(
    "/null-status-breakdown",
    summary="Where null-status records come from — by station and violation type",
    description=(
        "Shows the 125,254 records with no validation_status broken down by "
        "police_station (top 15) and primary_violation (top 10). "
        "These records were flagged by cameras but never entered the review pipeline. "
        "Sorted by count descending."
    ),
)
async def null_status_breakdown():
    try:
        cache_key = "null_status_breakdown"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached

        engine = get_engine(DB_PATH)
        session = sessionmaker(bind=engine)()
        try:
            # Total null-status records
            null_total = (
                session.query(func.count(Violation.id))
                .filter(Violation.validation_status.is_(None))
                .scalar()
                or 0
            )

            # By police_station — top 15
            by_station_rows = (
                session.query(
                    Violation.police_station,
                    func.count(Violation.id).label("cnt"),
                )
                .filter(Violation.validation_status.is_(None))
                .group_by(Violation.police_station)
                .order_by(func.count(Violation.id).desc())
                .limit(15)
                .all()
            )

            # By primary_violation — top 10
            by_violation_rows = (
                session.query(
                    Violation.primary_violation,
                    func.count(Violation.id).label("cnt"),
                )
                .filter(Violation.validation_status.is_(None))
                .group_by(Violation.primary_violation)
                .order_by(func.count(Violation.id).desc())
                .limit(10)
                .all()
            )
        finally:
            session.close()

        result = {
            "total_null_status_records": int(null_total),
            "note": (
                "These records have validation_status = NULL, meaning they were "
                "flagged by camera devices but never assigned a review status in "
                "the pipeline. This is distinct from rejected/stuck records which "
                "DID enter the pipeline but had a bad outcome."
            ),
            "top_15_stations": [
                {
                    "police_station": r.police_station or "Unknown",
                    "null_status_count": int(r.cnt),
                    "pct_of_null_total": round(r.cnt / null_total * 100, 2) if null_total else 0,
                }
                for r in by_station_rows
            ],
            "top_10_violation_types": [
                {
                    "primary_violation": r.primary_violation or "UNKNOWN",
                    "null_status_count": int(r.cnt),
                    "pct_of_null_total": round(r.cnt / null_total * 100, 2) if null_total else 0,
                }
                for r in by_violation_rows
            ],
        }
        _cache_set(cache_key, result)
        return result

    except Exception as exc:
        logger.exception("Error in /api/dashboard/null-status-breakdown")
        return JSONResponse(status_code=500, content={"error": str(exc)})
