"""
LaneShift — Geo / Map Endpoints
=================================
GeoJSON-shaped endpoints for direct Mapbox consumption.

Three endpoints:
  GET /api/geo/violation-points?month=YYYY-MM&limit=2000
      Returns violations for one month as a GeoJSON FeatureCollection.
      Coordinate order: [longitude, latitude] — GeoJSON standard.
      Capped at `limit` with honest "total_available"/"returned" metadata.

  GET /api/geo/monthly-summary
      One row per month: total violations, avg congestion score, top type.
      Powers the time-scrub slider without re-querying the point layer.

  GET /api/geo/station-boundaries-approx
      Per-station approximate convex hull from violation point spread.
      Clearly labeled as approximate — NOT official jurisdiction polygons.

GeoJSON coordinate order NOTE:
  GeoJSON requires [longitude, latitude] — this is the opposite of the
  [lat, lon] convention used in most databases and Python code.
  A coordinate-order swap silently places all points in the wrong location
  (often in the ocean) with no error. Every geometry in this file uses
  a named helper _coords(lat, lon) that enforces [lon, lat] order explicitly.
"""

import logging
import random
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import JSONResponse
from sqlalchemy import func, extract
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/geo", tags=["geo"])

# ── Dataset date bounds (hard-coded from verified dataset) ────────────────────
VALID_MONTHS = {
    "2023-11", "2023-12",
    "2024-01", "2024-02", "2024-03", "2024-04",
}

# ── GeoJSON helper — enforces [longitude, latitude] order ────────────────────

def _coords(lat: float, lon: float) -> List[float]:
    """
    Return GeoJSON coordinates in the REQUIRED [longitude, latitude] order.
    NEVER call this as _coords(lon, lat) — parameter names are intentional.
    """
    return [lon, lat]   # GeoJSON: [longitude, latitude]


# ── Cache ─────────────────────────────────────────────────────────────────────
_CACHE_TTL = 600  # 10 minutes

class _CacheEntry:
    def __init__(self, data: Any):
        self.data = data
        self.ts   = datetime.utcnow()

    def is_expired(self) -> bool:
        return (datetime.utcnow() - self.ts).total_seconds() > _CACHE_TTL


_cache: Dict[str, _CacheEntry] = {}


def _cache_get(key: str) -> Optional[Any]:
    e = _cache.get(key)
    if e is None or e.is_expired():
        if e is not None: del _cache[key]
        return None
    return e.data


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = _CacheEntry(data)


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 1 — violation-points
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/violation-points",
    summary="GeoJSON FeatureCollection of violations for one month",
    description=(
        "Returns violations for a given month (YYYY-MM, range Nov 2023–Apr 2024) "
        "as a GeoJSON FeatureCollection ready for Mapbox. "
        "Coordinate order is [longitude, latitude] per GeoJSON spec. "
        "Capped at `limit` with honest total_available/returned metadata."
    ),
)
async def violation_points(
    month: str = Query(..., description="YYYY-MM format, e.g. 2024-01"),
    limit: int = Query(2000, ge=1, le=5000, description="Max points to return"),
):
    # Validate month
    month = month.strip()
    if month not in VALID_MONTHS:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Month '{month}' is outside the dataset range. "
                f"Valid values: {sorted(VALID_MONTHS)}. "
                f"This dataset covers Nov 2023 – Apr 2024 only."
            ),
        )

    cache_key = f"geo_points:{month}:{limit}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    year_int  = int(month[:4])
    month_int = int(month[5:])

    engine  = get_engine(DB_PATH)
    session = sessionmaker(bind=engine)()

    try:
        # Total count for this month (for the metadata field)
        total_available = (
            session.query(func.count(Violation.id))
            .filter(
                Violation.latitude.isnot(None),
                Violation.longitude.isnot(None),
                extract("year",  Violation.created_ist) == year_int,
                extract("month", Violation.created_ist) == month_int,
            )
            .scalar()
            or 0
        )

        # Fetch all qualifying rows — then sample in Python if needed
        # (SQLite doesn't have efficient random sampling)
        rows = (
            session.query(
                Violation.id,
                Violation.latitude,
                Violation.longitude,
                Violation.primary_violation,
                Violation.congestion_cost_score,
                Violation.police_station,
                Violation.created_ist,
            )
            .filter(
                Violation.latitude.isnot(None),
                Violation.longitude.isnot(None),
                extract("year",  Violation.created_ist) == year_int,
                extract("month", Violation.created_ist) == month_int,
            )
            .all()
        )
    finally:
        session.close()

    # Sample if over limit
    if len(rows) > limit:
        rows = random.sample(rows, limit)

    features = []
    for row in rows:
        features.append({
            "type": "Feature",
            "geometry": {
                "type":        "Point",
                # ⚠ GeoJSON = [longitude, latitude] — enforced via _coords()
                "coordinates": _coords(float(row.latitude), float(row.longitude)),
            },
            "properties": {
                "id":                   row.id,
                "primary_violation":    row.primary_violation or "UNKNOWN",
                "congestion_cost_score": row.congestion_cost_score,
                "police_station":       row.police_station or "Unknown",
                "date": (
                    row.created_ist.strftime("%Y-%m-%d")
                    if row.created_ist else None
                ),
            },
        })

    result = {
        "type":            "FeatureCollection",
        "month":           month,
        "total_available": int(total_available),
        "returned":        len(features),
        "limit_applied":   len(features) < int(total_available),
        "coordinate_order_note": "[longitude, latitude] — GeoJSON standard",
        "features":        features,
    }

    _cache_set(cache_key, result)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 2 — monthly-summary
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/monthly-summary",
    summary="Per-month violation counts and context (powers time-scrub slider)",
    description=(
        "Returns one row per month (Nov 2023 – Apr 2024) with total violations, "
        "average congestion score, and top violation type. "
        "Use for the time-scrub slider labels without re-querying point data."
    ),
)
async def monthly_summary():
    cache_key = "geo_monthly_summary"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    engine  = get_engine(DB_PATH)
    session = sessionmaker(bind=engine)()

    try:
        # Aggregate by year+month
        rows = (
            session.query(
                extract("year",  Violation.created_ist).label("year"),
                extract("month", Violation.created_ist).label("month"),
                func.count(Violation.id).label("total_violations"),
                func.avg(Violation.congestion_cost_score).label("avg_score"),
            )
            .filter(Violation.created_ist.isnot(None))
            .group_by("year", "month")
            .order_by("year", "month")
            .all()
        )

        # Top violation type per month
        top_type_rows = (
            session.query(
                extract("year",  Violation.created_ist).label("year"),
                extract("month", Violation.created_ist).label("month"),
                Violation.primary_violation,
                func.count(Violation.id).label("cnt"),
            )
            .filter(
                Violation.created_ist.isnot(None),
                Violation.primary_violation.isnot(None),
            )
            .group_by("year", "month", Violation.primary_violation)
            .all()
        )
    finally:
        session.close()

    # Build top-type lookup: (year, month) -> top violation type
    top_by_month: Dict[tuple, tuple] = {}
    for r in top_type_rows:
        key = (int(r.year), int(r.month))
        if key not in top_by_month or r.cnt > top_by_month[key][1]:
            top_by_month[key] = (r.primary_violation, r.cnt)

    months = []
    for row in rows:
        y, m = int(row.year), int(row.month)
        key = (y, m)
        months.append({
            "month":           f"{y}-{m:02d}",
            "label":           datetime(y, m, 1).strftime("%b %Y"),
            "total_violations": int(row.total_violations),
            "avg_congestion_score": (
                round(float(row.avg_score), 1) if row.avg_score else None
            ),
            "top_violation_type": (
                top_by_month[key][0] if key in top_by_month else None
            ),
        })

    result = {"months": months}
    _cache_set(cache_key, result)
    return result


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint 3 — station-boundaries-approx
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    "/station-boundaries-approx",
    summary="Approximate station boundaries (convex hull from violation points)",
    description=(
        "Returns per-station approximate GeoJSON Polygon boundaries computed "
        "as convex hulls of that station's violation point spread. "
        "NOT official jurisdiction polygons — clearly labeled as approximate."
    ),
)
async def station_boundaries_approx():
    cache_key = "geo_station_boundaries"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        from scipy.spatial import ConvexHull
        import numpy as np
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="scipy not installed. Run: pip install scipy",
        )

    engine  = get_engine(DB_PATH)
    session = sessionmaker(bind=engine)()

    try:
        rows = (
            session.query(
                Violation.police_station,
                Violation.latitude,
                Violation.longitude,
            )
            .filter(
                Violation.police_station.isnot(None),
                Violation.latitude.isnot(None),
                Violation.longitude.isnot(None),
            )
            .all()
        )
    finally:
        session.close()

    # Group points by station
    from collections import defaultdict
    station_points: Dict[str, List[List[float]]] = defaultdict(list)
    for row in rows:
        station_points[row.police_station].append(
            [float(row.longitude), float(row.latitude)]  # [lon, lat] GeoJSON order
        )

    features = []
    for station, points in station_points.items():
        pts = np.array(points)
        if len(pts) < 4:
            # Not enough points for a hull — use bounding box
            lon_min, lat_min = pts[:, 0].min(), pts[:, 1].min()
            lon_max, lat_max = pts[:, 0].max(), pts[:, 1].max()
            hull_coords = [
                [lon_min, lat_min], [lon_max, lat_min],
                [lon_max, lat_max], [lon_min, lat_max],
                [lon_min, lat_min],
            ]
            hull_type = "bounding_box_insufficient_points"
        else:
            try:
                hull = ConvexHull(pts)
                hull_vertices = pts[hull.vertices]
                # Close the polygon
                hull_coords = hull_vertices.tolist()
                hull_coords.append(hull_coords[0])
                hull_type = "convex_hull"
            except Exception:
                continue

        features.append({
            "type": "Feature",
            "geometry": {
                "type":        "Polygon",
                "coordinates": [hull_coords],  # GeoJSON Polygon: array of rings
            },
            "properties": {
                "police_station": station,
                "point_count":    len(pts),
                "boundary_type":  hull_type,
                "disclaimer": (
                    "Approximate boundary derived from violation point spread, "
                    "NOT an official jurisdiction polygon. "
                    "Do not use for legal or administrative purposes."
                ),
            },
        })

    result = {
        "type":            "FeatureCollection",
        "boundary_type":   "approximate_convex_hull_from_violation_points",
        "disclaimer": (
            "All boundaries are approximate convex hulls computed from the "
            "geographic spread of violation points for each station. "
            "They are NOT official Bengaluru Traffic Police jurisdiction polygons. "
            "Present as 'approximate coverage areas' not 'official boundaries'."
        ),
        "coordinate_order_note": "[longitude, latitude] — GeoJSON standard",
        "features": features,
    }

    _cache_set(cache_key, result)
    return result
