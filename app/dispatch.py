"""
Dispatch Ranking Layer for LaneShift.

This module owns the Phase 3 operational API:
- station rankings
- named-junction hotspot rankings
- mid-block grid-cell hotspots
- a unified live dispatch queue
- validation leak reporting
"""

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from sqlalchemy import desc, func
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine
from models import (
    JunctionRanking,
    LiveQueueResponse,
    MidblockHotspot,
    StationRanking,
    ValidationLeakItem,
)

logger = logging.getLogger(__name__)

# === Configuration Constants (Tunable) ===
DISPATCH_CACHE_TTL_SECONDS = 300
DISPATCH_PRIORITY_IMMEDIATE_PCT = 0.10
DISPATCH_PRIORITY_STANDARD_PCT = 0.40
MIDBLOCK_GRID_PRECISION = 3
DEFAULT_WINDOW_DAYS = 30
DEFAULT_RESULT_LIMIT = 20
LIVE_QUEUE_DEFAULT_LIMIT = 50

PENDING_VALIDATION_STATUSES = {"created1", "processing"}
SUBMITTED_VALIDATION_STATUSES = {
    "approved",
    "rejected",
    "created1",
    "processing",
    "duplicate",
}

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/dispatch", tags=["dispatch"])


@dataclass
class CacheEntry:
    data: Any
    created_at: datetime

    def is_expired(self, ttl_seconds: int) -> bool:
        return (datetime.utcnow() - self.created_at).total_seconds() > ttl_seconds


class DispatchCache:
    """Small process-local TTL cache for demo responsiveness."""

    def __init__(self) -> None:
        self._cache: Dict[str, CacheEntry] = {}

    def get(self, key: str, ttl_seconds: int = DISPATCH_CACHE_TTL_SECONDS) -> Optional[Any]:
        entry = self._cache.get(key)
        if entry is None:
            return None
        if entry.is_expired(ttl_seconds):
            del self._cache[key]
            return None
        return entry.data

    def set(self, key: str, data: Any) -> None:
        self._cache[key] = CacheEntry(data=data, created_at=datetime.utcnow())

    def clear(self) -> None:
        self._cache.clear()


_dispatch_cache = DispatchCache()


def _session(db_path: str = DB_PATH):
    engine = get_engine(db_path)
    Session = sessionmaker(bind=engine)
    return Session()


def _valid_limit(limit: int) -> int:
    return max(1, min(limit, 1000))


def _valid_window_days(window_days: int) -> int:
    return max(1, window_days)


def _empty_location_stats() -> Dict[str, Any]:
    return {
        "total_violations": 0,
        "aggregate_congestion_score": 0,
        "pending_validation_count": 0,
        "violation_types": {},
        "jurisdictions": {},
    }


def _add_location_record(
    stats: Dict[str, Any],
    score: int,
    station: Optional[str],
    violation_type: Optional[str],
    validation_status: Optional[str],
) -> None:
    stats["total_violations"] += 1
    stats["aggregate_congestion_score"] += score

    if validation_status in PENDING_VALIDATION_STATUSES:
        stats["pending_validation_count"] += 1

    clean_type = violation_type or "UNKNOWN"
    stats["violation_types"][clean_type] = stats["violation_types"].get(clean_type, 0) + 1

    if station:
        stats["jurisdictions"][station] = stats["jurisdictions"].get(station, 0) + 1


def _sorted_counts(counts: Dict[str, int]) -> List[Tuple[str, int]]:
    return sorted(counts.items(), key=lambda item: item[1], reverse=True)


def _top_key(counts: Dict[str, int], fallback: str = "UNKNOWN") -> str:
    ordered = _sorted_counts(counts)
    return ordered[0][0] if ordered else fallback


def _top_keys(counts: Dict[str, int], limit: int = 3) -> List[str]:
    return [key for key, _ in _sorted_counts(counts)[:limit]]


def get_dataset_date_range(db_path: str = DB_PATH) -> Tuple[Optional[datetime], Optional[datetime]]:
    """Return min and max created_datetime from the dataset."""
    cache_key = "dataset_date_range"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    session = _session(db_path)
    try:
        result = session.query(
            func.min(Violation.created_datetime),
            func.max(Violation.created_datetime),
        ).first()
        date_range = (result[0], result[1]) if result else (None, None)
        _dispatch_cache.set(cache_key, date_range)
        return date_range
    finally:
        session.close()


def get_violations_in_window(
    db_path: str = DB_PATH,
    window_days: int = DEFAULT_WINDOW_DAYS,
) -> Tuple[datetime, datetime]:
    """
    Compute a rolling window relative to MAX created_datetime in the dataset.
    This keeps historical Nov 2023-Apr 2024 data usable in live demos.
    """
    window_days = _valid_window_days(window_days)
    _, max_date = get_dataset_date_range(db_path)
    window_end = max_date or datetime.utcnow()
    return window_end - timedelta(days=window_days), window_end


def _window_aggregates(db_path: str = DB_PATH, window_days: int = DEFAULT_WINDOW_DAYS) -> Dict[str, Any]:
    """
    Build all dispatch aggregates with one window scan.
    Cached endpoints then sort/slice this structure instead of issuing N follow-up queries.
    """
    window_days = _valid_window_days(window_days)
    cache_key = f"window_aggregates:{window_days}"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    session = _session(db_path)
    try:
        window_start, window_end = get_violations_in_window(db_path, window_days)
        rows = (
            session.query(
                Violation.police_station,
                Violation.junction_name,
                Violation.primary_violation,
                Violation.latitude,
                Violation.longitude,
                Violation.congestion_cost_score,
                Violation.validation_status,
            )
            .filter(
                Violation.created_datetime >= window_start,
                Violation.created_datetime <= window_end,
            )
            .all()
        )

        stations: Dict[str, Dict[str, Any]] = {}
        junctions: Dict[str, Dict[str, Any]] = {}
        midblocks: Dict[Tuple[float, float], Dict[str, Any]] = {}

        for row in rows:
            station = row.police_station if row.police_station else None
            junction = row.junction_name if row.junction_name else None
            score = int(row.congestion_cost_score or 0)

            if station:
                station_stats = stations.setdefault(station, _empty_location_stats())
                _add_location_record(
                    station_stats,
                    score,
                    station,
                    row.primary_violation,
                    row.validation_status,
                )

            if junction and junction != "No Junction":
                junction_stats = junctions.setdefault(junction, _empty_location_stats())
                _add_location_record(
                    junction_stats,
                    score,
                    station,
                    row.primary_violation,
                    row.validation_status,
                )

            if junction == "No Junction" and row.latitude is not None and row.longitude is not None:
                grid_key = (
                    round(float(row.latitude), MIDBLOCK_GRID_PRECISION),
                    round(float(row.longitude), MIDBLOCK_GRID_PRECISION),
                )
                grid_stats = midblocks.setdefault(grid_key, _empty_location_stats())
                _add_location_record(
                    grid_stats,
                    score,
                    station,
                    row.primary_violation,
                    row.validation_status,
                )

        aggregates = {
            "window_start": window_start,
            "window_end": window_end,
            # window_reference_date is the MAX created_datetime in the dataset
            # (Apr 2024), NOT today's real date. All windowed endpoints include
            # this in their response so consumers can't mistake the window for
            # a real-time rolling window.
            "window_reference_date": window_end.isoformat() if window_end else None,
            "stations": stations,
            "junctions": junctions,
            "midblocks": midblocks,
        }
        _dispatch_cache.set(cache_key, aggregates)
        return aggregates
    finally:
        session.close()


def get_station_rankings(
    db_path: str = DB_PATH,
    window_days: int = DEFAULT_WINDOW_DAYS,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Rank police stations by aggregate congestion-cost score."""
    window_days = _valid_window_days(window_days)
    limit = _valid_limit(limit)
    cache_key = f"station_rankings:{window_days}:{limit}"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    aggregates = _window_aggregates(db_path, window_days)
    ranked = sorted(
        aggregates["stations"].items(),
        key=lambda item: item[1]["aggregate_congestion_score"],
        reverse=True,
    )[:limit]

    output: List[Dict[str, Any]] = []
    for rank, (station, stats) in enumerate(ranked, 1):
        total = stats["total_violations"]
        output.append(
            {
                "police_station": station,
                "total_violations": total,
                "aggregate_congestion_score": int(stats["aggregate_congestion_score"]),
                "average_congestion_score": round(
                    stats["aggregate_congestion_score"] / total if total else 0,
                    2,
                ),
                "dispatch_priority_rank": rank,
                "top_violation_type": _top_key(stats["violation_types"]),
                "pending_validation_count": int(stats["pending_validation_count"]),
            }
        )

    _dispatch_cache.set(cache_key, output)
    return output


def get_junction_rankings(
    db_path: str = DB_PATH,
    window_days: int = DEFAULT_WINDOW_DAYS,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Rank named junctions by aggregate congestion-cost score."""
    window_days = _valid_window_days(window_days)
    limit = _valid_limit(limit)
    cache_key = f"junction_rankings:{window_days}:{limit}"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    aggregates = _window_aggregates(db_path, window_days)
    ranked = sorted(
        aggregates["junctions"].items(),
        key=lambda item: item[1]["aggregate_congestion_score"],
        reverse=True,
    )[:limit]

    output: List[Dict[str, Any]] = []
    for rank, (junction, stats) in enumerate(ranked, 1):
        total = stats["total_violations"]
        output.append(
            {
                "junction_name": junction,
                "police_station": _top_key(stats["jurisdictions"]),
                "total_violations": total,
                "aggregate_congestion_score": int(stats["aggregate_congestion_score"]),
                "average_congestion_score": round(
                    stats["aggregate_congestion_score"] / total if total else 0,
                    2,
                ),
                "dispatch_priority_rank": rank,
                "top_violation_types": _top_keys(stats["violation_types"], 3),
                "pending_validation_count": int(stats["pending_validation_count"]),
            }
        )

    _dispatch_cache.set(cache_key, output)
    return output


def get_midblock_hotspots(
    db_path: str = DB_PATH,
    window_days: int = DEFAULT_WINDOW_DAYS,
    limit: int = DEFAULT_RESULT_LIMIT,
) -> List[Dict[str, Any]]:
    """Cluster 'No Junction' violations into rounded lat/lon grid cells."""
    window_days = _valid_window_days(window_days)
    limit = _valid_limit(limit)
    cache_key = f"midblock_hotspots:{window_days}:{limit}"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    aggregates = _window_aggregates(db_path, window_days)
    ranked = sorted(
        aggregates["midblocks"].items(),
        key=lambda item: item[1]["aggregate_congestion_score"],
        reverse=True,
    )[:limit]

    output: List[Dict[str, Any]] = []
    for rank, ((grid_lat, grid_lon), stats) in enumerate(ranked, 1):
        output.append(
            {
                "grid_cell_lat": grid_lat,
                "grid_cell_lon": grid_lon,
                "violation_count": int(stats["total_violations"]),
                "aggregate_congestion_score": int(stats["aggregate_congestion_score"]),
                "jurisdictions": _top_keys(stats["jurisdictions"], 3),
                "pending_validation_count": int(stats["pending_validation_count"]),
                "hotspot_rank": rank,
            }
        )

    _dispatch_cache.set(cache_key, output)
    return output


def _recommend_actions(queue: List[Dict[str, Any]]) -> None:
    if not queue:
        return

    immediate_count = max(1, math.ceil(len(queue) * DISPATCH_PRIORITY_IMMEDIATE_PCT))
    standard_count = max(
        immediate_count,
        math.ceil(len(queue) * DISPATCH_PRIORITY_STANDARD_PCT),
    )

    for index, item in enumerate(queue, 1):
        if index <= immediate_count:
            item["recommended_action"] = "Dispatch immediately"
        elif index <= standard_count:
            item["recommended_action"] = "Route on standard patrol"
        else:
            item["recommended_action"] = "Monitor"


def get_live_queue(
    db_path: str = DB_PATH,
    window_days: int = DEFAULT_WINDOW_DAYS,
    limit: int = LIVE_QUEUE_DEFAULT_LIMIT,
) -> Dict[str, Any]:
    """Build one ranked dispatcher queue from junction and mid-block hotspots."""
    window_days = _valid_window_days(window_days)
    limit = _valid_limit(limit)
    cache_key = f"live_queue:{window_days}:{limit}"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    junctions = get_junction_rankings(db_path, window_days, limit=1000)
    midblocks = get_midblock_hotspots(db_path, window_days, limit=1000)
    aggregates = _window_aggregates(db_path, window_days)  # already cached

    queue: List[Dict[str, Any]] = []
    for junction in junctions:
        queue.append(
            {
                "location_type": "junction",
                "location_name": junction["junction_name"],
                "police_station_jurisdiction": junction["police_station"],
                "aggregate_congestion_score": junction["aggregate_congestion_score"],
                "violation_count": junction["total_violations"],
                "pending_validations": junction["pending_validation_count"],
            }
        )

    for cluster in midblocks:
        jurisdiction = cluster["jurisdictions"][0] if cluster["jurisdictions"] else "Unknown"
        queue.append(
            {
                "location_type": "midblock_cluster",
                "location_name": (
                    f"Grid cell near {cluster['grid_cell_lat']:.3f}, "
                    f"{cluster['grid_cell_lon']:.3f}"
                ),
                "police_station_jurisdiction": jurisdiction,
                "aggregate_congestion_score": cluster["aggregate_congestion_score"],
                "violation_count": cluster["violation_count"],
                "pending_validations": cluster["pending_validation_count"],
            }
        )

    queue = sorted(
        queue,
        key=lambda item: item["aggregate_congestion_score"],
        reverse=True,
    )[:limit]

    for rank, item in enumerate(queue, 1):
        item["rank"] = rank

    _recommend_actions(queue)

    result = {
        "generated_at": datetime.utcnow().isoformat(timespec="seconds") + "Z",
        "window_days": window_days,
        "window_reference_date": (
            aggregates["window_end"].isoformat()
            if isinstance(aggregates.get("window_end"), datetime)
            else str(aggregates.get("window_reference_date", ""))
        ),
        "window_note": (
            "window_reference_date is MAX created_datetime in dataset (Apr 2024), "
            "NOT today's real date — this is historical data"
        ),
        "queue": queue,
    }
    _dispatch_cache.set(cache_key, result)
    return result


def get_validation_leak_report(db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    """Return per-station validation pipeline metrics from explicit status values."""
    cache_key = "validation_leak_report"
    cached = _dispatch_cache.get(cache_key)
    if cached is not None:
        return cached

    session = _session(db_path)
    try:
        rows = (
            session.query(
                Violation.police_station,
                Violation.validation_status,
                func.count(Violation.id).label("status_count"),
            )
            .filter(
                Violation.police_station.isnot(None),
                Violation.police_station != "",
                Violation.validation_status.in_(SUBMITTED_VALIDATION_STATUSES),
            )
            .group_by(Violation.police_station, Violation.validation_status)
            .order_by(desc("status_count"))
            .all()
        )

        by_station: Dict[str, Dict[str, int]] = {}
        for station, status, count in rows:
            stats = by_station.setdefault(
                station,
                {
                    "approved": 0,
                    "rejected": 0,
                    "created1": 0,
                    "processing": 0,
                    "duplicate": 0,
                },
            )
            stats[status] = int(count)

        output: List[Dict[str, Any]] = []
        for station, stats in by_station.items():
            stuck = stats["created1"] + stats["processing"]
            total = sum(stats.values())
            approval_rate = (stats["approved"] / total * 100) if total else 0
            rejection_rate = (stats["rejected"] / total * 100) if total else 0
            output.append(
                {
                    "police_station": station,
                    "total_submitted": total,
                    "approved_count": stats["approved"],
                    "rejected_count": stats["rejected"],
                    "stuck_count": stuck,
                    "approval_rate_pct": round(approval_rate, 1),
                    "rejection_rate_pct": round(rejection_rate, 1),
                }
            )

        output = sorted(
            output,
            key=lambda item: item["rejection_rate_pct"],
            reverse=True,
        )
        _dispatch_cache.set(cache_key, output)
        return output
    finally:
        session.close()


def clear_dispatch_cache() -> None:
    _dispatch_cache.clear()


@router.get("/by-station", response_model=list[StationRanking])
async def dispatch_by_station(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=1),
    limit: int = Query(DEFAULT_RESULT_LIMIT, ge=1, le=1000),
):
    try:
        data = get_station_rankings(DB_PATH, window_days, limit)
        aggregates = _window_aggregates(DB_PATH, window_days)
        return JSONResponse(content={
            "window_days": window_days,
            "window_reference_date": aggregates.get("window_reference_date"),
            "note": "window is relative to MAX created_datetime in dataset (Apr 2024), NOT today's real date",
            "stations": data,
        })
    except Exception as exc:
        logger.exception("Error in /api/dispatch/by-station")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get("/by-junction", response_model=list[JunctionRanking])
async def dispatch_by_junction(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=1),
    limit: int = Query(DEFAULT_RESULT_LIMIT, ge=1, le=1000),
):
    try:
        data = get_junction_rankings(DB_PATH, window_days, limit)
        aggregates = _window_aggregates(DB_PATH, window_days)
        return JSONResponse(content={
            "window_days": window_days,
            "window_reference_date": aggregates.get("window_reference_date"),
            "note": "window is relative to MAX created_datetime in dataset (Apr 2024), NOT today's real date",
            "junctions": data,
        })
    except Exception as exc:
        logger.exception("Error in /api/dispatch/by-junction")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get("/hotspot-zones", response_model=list[MidblockHotspot])
async def dispatch_hotspot_zones(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=1),
    limit: int = Query(DEFAULT_RESULT_LIMIT, ge=1, le=1000),
):
    try:
        data = get_midblock_hotspots(DB_PATH, window_days, limit)
        aggregates = _window_aggregates(DB_PATH, window_days)
        return JSONResponse(content={
            "window_days": window_days,
            "window_reference_date": aggregates.get("window_reference_date"),
            "note": "window is relative to MAX created_datetime in dataset (Apr 2024), NOT today's real date",
            "hotspot_zones": data,
        })
    except Exception as exc:
        logger.exception("Error in /api/dispatch/hotspot-zones")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get("/live-queue")
async def dispatch_live_queue(
    window_days: int = Query(DEFAULT_WINDOW_DAYS, ge=1),
    limit: int = Query(LIVE_QUEUE_DEFAULT_LIMIT, ge=1, le=1000),
):
    try:
        return get_live_queue(DB_PATH, window_days, limit)
    except Exception as exc:
        logger.exception("Error in /api/dispatch/live-queue")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.get("/validation-leak-report", response_model=list[ValidationLeakItem])
async def dispatch_validation_leak_report():
    try:
        return get_validation_leak_report(DB_PATH)
    except Exception as exc:
        logger.exception("Error in /api/dispatch/validation-leak-report")
        return JSONResponse(status_code=500, content={"error": str(exc)})


@router.post("/clear-cache")
async def dispatch_clear_cache():
    try:
        clear_dispatch_cache()
        return {"status": "ok", "message": "Dispatch cache cleared"}
    except Exception as exc:
        logger.exception("Error clearing dispatch cache")
        return JSONResponse(status_code=500, content={"error": str(exc)})
