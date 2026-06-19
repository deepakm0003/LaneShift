"""
LaneShift — Module 6: Persistent Hotspot Escalation Engine
============================================================

SCOPE BOUNDARY:
  This module identifies locations where violations persist continuously over
  many weeks DESPITE ongoing enforcement, and flags them for ESCALATION.

  "Escalation" means two things, kept strictly separate:
    1. BTP-internal interim action (within traffic police mandate):
       signage requests, shifted patrol timing, enforcement-zone designation.
    2. Civic escalation (outside BTP mandate, routed to BBMP/Urban Planning):
       infrastructure review for the underlying structural cause.

  This module does NOT propose specific infrastructure solutions
  (new parking bays, road redesign, signal placement) — those decisions
  belong to civic authorities. It only identifies WHERE persistent
  enforcement failure is occurring and WHAT TYPE of escalation is warranted.

The real finding this module is built on:
  BTP051 - Safina Plaza Junction recorded violations in ALL 23 weeks of the
  dataset (Nov 2023–Apr 2024), never dropping below 147/week.
  Repeated ticketing has not reduced activity at this location across 5 months.
  This is the ground-truth case; the module generalises it across all locations.
"""

import logging
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import func
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH      = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/hotspots", tags=["persistent_hotspots"])

# ── Cache ──────────────────────────────────────────────────────────────────────
@dataclass
class _CacheEntry:
    data: Any
    ts: datetime

    def is_expired(self) -> bool:
        return (datetime.utcnow() - self.ts).total_seconds() > 600  # 10 min


_cache: Dict[str, _CacheEntry] = {}


def _cache_get(key: str) -> Optional[Any]:
    e = _cache.get(key)
    if e is None or e.is_expired():
        if e: del _cache[key]
        return None
    return e.data


def _cache_set(key: str, data: Any) -> None:
    _cache[key] = _CacheEntry(data=data, ts=datetime.utcnow())


# ─────────────────────────────────────────────────────────────────────────────
# Step 1: Load raw weekly violation counts per location
# ─────────────────────────────────────────────────────────────────────────────

def _load_weekly_counts(db_path: str) -> pd.DataFrame:
    """
    Return DataFrame with columns:
      location_key, location_name, police_station,
      week (ISO 'YYYY-WW'), weekly_count, primary_violation (top type that week)

    Locations are:
      - Named junctions: junction_name (excluding 'No Junction')
      - Mid-block: 'MIDBLOCK::' + police_station (grouped at station level)
    """
    engine  = get_engine(db_path)
    session = sessionmaker(bind=engine)()
    try:
        rows = session.query(
            Violation.junction_name,
            Violation.police_station,
            Violation.primary_violation,
            func.strftime('%Y-%W', Violation.created_ist).label('week'),
            func.count(Violation.id).label('cnt'),
        ).filter(
            Violation.created_ist.isnot(None),
        ).group_by(
            'junction_name', 'police_station', 'primary_violation', 'week'
        ).all()
    finally:
        session.close()

    if not rows:
        return pd.DataFrame()

    df = pd.DataFrame(rows, columns=[
        'junction_name', 'police_station', 'primary_violation', 'week', 'cnt'
    ])
    df['cnt'] = df['cnt'].astype(int)

    # Build location_key and location_name
    def _loc(row):
        jn = row['junction_name']
        ps = row['police_station'] or 'Unknown'
        if jn and jn != 'No Junction':
            return jn, jn
        else:
            key  = f'MIDBLOCK::{ps}'
            name = f'Mid-block aggregate — {ps} jurisdiction'
            return key, name

    df[['location_key', 'location_name']] = df.apply(
        lambda r: pd.Series(_loc(r)), axis=1
    )
    return df


# ─────────────────────────────────────────────────────────────────────────────
# Step 2: Compute persistence metrics per location
# ─────────────────────────────────────────────────────────────────────────────

def compute_weekly_persistence(db_path: str) -> pd.DataFrame:
    """
    Groups violations by location and ISO week, then computes:
      - total_weeks_present    : how many weeks had ≥1 violation
      - total_weeks_in_dataset : denominator (currently 23)
      - persistence_ratio      : total_weeks_present / total_weeks_in_dataset
      - average_weekly_count
      - min_weekly_count
      - max_weekly_count
      - trend_direction        : 'worsening' | 'improving' | 'stable'
      - dominant_violation_type: top primary_violation by count at this location
    """
    raw = _load_weekly_counts(db_path)
    if raw.empty:
        return pd.DataFrame()

    # Total distinct weeks in the dataset (ground truth = 23)
    total_weeks = raw['week'].nunique()

    records = []
    for loc_key, grp in raw.groupby('location_key'):
        # Weekly aggregates
        weekly = grp.groupby('week')['cnt'].sum()
        weeks_present = len(weekly)
        avg_count     = float(weekly.mean())
        min_count     = int(weekly.min())
        max_count     = int(weekly.max())

        # Trend: compare first 4 weeks vs last 4 weeks
        sorted_wks = weekly.sort_index()
        if len(sorted_wks) >= 8:
            first4_avg = float(sorted_wks.iloc[:4].mean())
            last4_avg  = float(sorted_wks.iloc[-4:].mean())
            if last4_avg > first4_avg * 1.10:
                trend = 'worsening'
            elif last4_avg < first4_avg * 0.90:
                trend = 'improving'
            else:
                trend = 'stable'
        else:
            trend = 'stable'  # not enough data to determine trend

        # Dominant violation type at this location
        viol_counts = grp.groupby('primary_violation')['cnt'].sum()
        dominant_viol = viol_counts.idxmax() if not viol_counts.empty else 'UNKNOWN'

        # Police station (take most common)
        ps = grp['police_station'].mode()
        ps = ps.iloc[0] if not ps.empty else 'Unknown'

        loc_name = grp['location_name'].iloc[0]

        records.append({
            'location_key':           loc_key,
            'location_name':          loc_name,
            'police_station':         ps,
            'weeks_present':          weeks_present,
            'weeks_in_dataset':       total_weeks,
            'persistence_ratio':      round(weeks_present / total_weeks, 4),
            'average_weekly_count':   round(avg_count, 1),
            'min_weekly_count':       min_count,
            'max_weekly_count':       max_count,
            'trend_direction':        trend,
            'dominant_violation_type': dominant_viol,
            '_viol_counts':           viol_counts.to_dict(),  # used for escalation typing
        })

    return pd.DataFrame(records)


# ─────────────────────────────────────────────────────────────────────────────
# Step 3: Classify escalation tier
# ─────────────────────────────────────────────────────────────────────────────

def classify_escalation_tier(row: dict) -> str:
    """
    TIER 1 — ESCALATE TO CIVIC AUTHORITY:
      persistence_ratio >= 0.85 AND trend NOT improving.
      Near-continuous violations for 5 months with no sign of self-correction.

    TIER 2 — ADJUST ENFORCEMENT APPROACH:
      0.60 <= persistence_ratio < 0.85, OR
      (persistence_ratio >= 0.85 AND trend IS improving).
      Recurring but either responding to enforcement or not yet chronic.

    TIER 3 — STANDARD MONITORING:
      persistence_ratio < 0.60.
    """
    ratio = row['persistence_ratio']
    trend = row['trend_direction']

    if ratio >= 0.85 and trend != 'improving':
        return 'TIER 1 - ESCALATE TO CIVIC AUTHORITY'
    elif ratio >= 0.60 or (ratio >= 0.85 and trend == 'improving'):
        return 'TIER 2 - ADJUST ENFORCEMENT APPROACH'
    else:
        return 'TIER 3 - STANDARD MONITORING'


# ─────────────────────────────────────────────────────────────────────────────
# Step 4: Suggest escalation — scaled by severity (volume + trend + ratio)
# ─────────────────────────────────────────────────────────────────────────────

def suggest_escalation_type(viol_counts: dict, row: dict = None) -> str:
    """
    Produces a DIFFERENTIATED escalation recommendation scaled by:
      - Violation type profile (what kind of problem)
      - average_weekly_count  (how severe — high vs low volume)
      - persistence_ratio     (how chronic — 100% vs 60%)
      - trend_direction       (worsening / stable / improving)

    Every message separates:
      BTP-NOW:  what traffic police can do immediately (within their mandate)
      ESCALATE: what needs to go to civic authority (BBMP/Urban Planning)
    """
    # Pull context from row if available
    avg_weekly  = float(row.get('average_weekly_count', 0)) if row else 0.0
    ratio       = float(row.get('persistence_ratio', 0))   if row else 0.0
    trend       = str(row.get('trend_direction', 'stable')) if row else 'stable'

    # Compute a severity score 0–10 for scaling language
    # High avg + high ratio + worsening = 10, Low avg + low ratio + improving = 1
    volume_score = min(10.0, avg_weekly / 50.0)   # 500/wk → 10, 50/wk → 1
    ratio_score  = ratio * 10                      # 1.0 → 10, 0.6 → 6
    trend_mod    = 2.0 if trend == 'worsening' else (-1.0 if trend == 'improving' else 0.0)
    severity     = min(10.0, (volume_score * 0.4 + ratio_score * 0.4 + trend_mod * 0.2))

    if not viol_counts:
        return _scaled_mixed(severity, avg_weekly, trend)

    total = sum(viol_counts.values())
    if total == 0:
        return _scaled_mixed(severity, avg_weekly, trend)

    shares    = {v: c / total for v, c in viol_counts.items()}
    top_type  = max(shares, key=shares.get)
    top_share = shares[top_type]

    HIGH_VOLUME = {'WRONG PARKING', 'NO PARKING'}
    SAFETY      = {'PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC', 'PARKING NEAR ROAD CROSSING',
                   'PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS'}
    CARRIAGEWAY = {'PARKING IN A MAIN ROAD', 'DOUBLE PARKING'}

    if top_share >= 0.55:
        if top_type in HIGH_VOLUME:
            return _scaled_high_volume(top_type, severity, avg_weekly, ratio, trend)
        elif top_type in SAFETY:
            return _scaled_safety(top_type, severity, avg_weekly, ratio, trend)
        elif top_type in CARRIAGEWAY:
            return _scaled_carriageway(top_type, severity, avg_weekly, ratio, trend)

    safety_share = sum(shares.get(v, 0) for v in SAFETY)
    if safety_share >= 0.25:
        return _scaled_safety_mixed(severity, avg_weekly, trend)

    return _scaled_mixed(severity, avg_weekly, trend)


def _urgency(severity: float) -> str:
    if severity >= 8: return "CRITICAL"
    if severity >= 6: return "HIGH"
    if severity >= 4: return "MODERATE"
    return "LOW"


def _scaled_high_volume(vtype: str, sev: float, avg: float, ratio: float, trend: str) -> str:
    urgency = _urgency(sev)
    weeks_pct = f"{round(ratio * 100)}%"

    if sev >= 8:
        return (
            f"HIGH-VOLUME ROUTINE VIOLATION — CRITICAL PERSISTENCE ({urgency}). "
            f"~{round(avg)} violations/week across {weeks_pct} of the 23-week dataset, "
            f"trend {trend}. "
            f"BTP immediate action: deploy fixed deterrent + static enforcement presence; "
            f"issue formal 'no-parking zone' marking request to jurisdictional authority. "
            f"Civic escalation (URGENT): route to BBMP/Urban Planning with violation count "
            f"evidence — {round(avg * 23):,} total violations at this location over 5 months. "
            f"Request infrastructure review for designated legal parking or physical barrier."
        )
    elif sev >= 6:
        return (
            f"HIGH-VOLUME ROUTINE VIOLATION — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week across {weeks_pct} of observed weeks, "
            f"trend {trend}. "
            f"BTP action: request additional fixed signage and consider staggered patrol timing "
            f"at peak enforcement hours to break recurring pattern. "
            f"Civic escalation: route to BBMP/Urban Planning for assessment of parking "
            f"provision — current signage alone has not resolved the pattern."
        )
    elif sev >= 4:
        return (
            f"RECURRING ROUTINE VIOLATION — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: shift patrol schedule to cover peak hours more consistently; "
            f"request improved signage clarity at this location. "
            f"Civic note: standard escalation to civic authority if pattern persists "
            f"after enforcement adjustment."
        )
    else:
        return (
            f"LOW-FREQUENCY ROUTINE VIOLATION — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: standard patrol monitoring — no immediate escalation required. "
            f"Flag for review if frequency increases over the next 4 weeks."
        )


def _scaled_safety(vtype: str, sev: float, avg: float, ratio: float, trend: str) -> str:
    urgency = _urgency(sev)
    weeks_pct = f"{round(ratio * 100)}%"

    if sev >= 7:
        return (
            f"SAFETY-RELEVANT PERSISTENT VIOLATION — {urgency} PRIORITY. "
            f"~{round(avg)} violations/week at {weeks_pct} of weeks near "
            f"pedestrian-critical infrastructure, trend {trend}. "
            f"BTP immediate action: increase dedicated patrol at this location during "
            f"school/hospital/peak pedestrian hours — do not defer. "
            f"Civic escalation (PRIORITY): route to BBMP with pedestrian-safety framing; "
            f"request physical safety infrastructure review — barrier, markings, or signage "
            f"upgrade pending civic decision."
        )
    elif sev >= 4:
        return (
            f"SAFETY-RELEVANT VIOLATION — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: increase patrol frequency at high-risk hours (school/hospital peak). "
            f"Civic escalation: standard route to civic authority flagging safety relevance; "
            f"prioritise above routine parking complaints in BBMP queue."
        )
    else:
        return (
            f"SAFETY-RELEVANT VIOLATION — LOW FREQUENCY. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: standard monitoring with awareness of pedestrian risk context. "
            f"Escalate to civic authority if frequency increases."
        )


def _scaled_carriageway(vtype: str, sev: float, avg: float, ratio: float, trend: str) -> str:
    urgency = _urgency(sev)
    weeks_pct = f"{round(ratio * 100)}%"

    if sev >= 7:
        return (
            f"CARRIAGEWAY-BLOCKING PERSISTENT VIOLATION — {urgency} IMPACT. "
            f"~{round(avg)} violations/week ({vtype}) at {weeks_pct} of weeks, "
            f"trend {trend}. "
            f"BTP immediate action: evaluate formal no-stopping zone with physical "
            f"markings — within traffic police authority for carriageway management. "
            f"Civic escalation (URGENT): route to BBMP for infrastructure review; "
            f"note that {round(avg * 23):,} carriageway-blocking events over 5 months "
            f"indicate a structural parking deficit, not just a compliance problem."
        )
    elif sev >= 4:
        return (
            f"CARRIAGEWAY-BLOCKING VIOLATION — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: consider clearer no-stopping markings as interim measure. "
            f"Civic escalation: route to BBMP for carriageway review when next "
            f"infrastructure assessment is scheduled."
        )
    else:
        return (
            f"CARRIAGEWAY-BLOCKING VIOLATION — LOW FREQUENCY. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: standard patrol monitoring. "
            f"No immediate civic escalation required."
        )


def _scaled_safety_mixed(sev: float, avg: float, trend: str) -> str:
    urgency = _urgency(sev)
    return (
        f"MIXED VIOLATION PROFILE WITH SAFETY COMPONENT — {urgency} PERSISTENCE. "
        f"~{round(avg)} violations/week, trend {trend}. "
        f"BTP action: increase monitoring at pedestrian-relevant hours given safety component. "
        f"Civic escalation: standard route to civic authority; flag safety-relevant share "
        f"when submitting escalation request."
    )


def _scaled_mixed(sev: float, avg: float, trend: str) -> str:
    urgency = _urgency(sev)
    if sev >= 6:
        return (
            f"MIXED VIOLATION PROFILE — {urgency} PERSISTENCE. "
            f"~{round(avg)} violations/week, trend {trend}. "
            f"BTP action: review patrol timing and coverage at this location; "
            f"no single dominant violation pattern suggests a systemic root cause. "
            f"Civic escalation: route for general review — note volume and persistence data."
        )
    return (
        f"MIXED VIOLATION PROFILE — {urgency} PERSISTENCE. "
        f"~{round(avg)} violations/week, trend {trend}. "
        f"BTP action: standard monitoring. Escalate to civic authority if "
        f"volume or persistence increases over the next 4–6 weeks."
    )


# ─────────────────────────────────────────────────────────────────────────────
# Core report builder (cached)
# ─────────────────────────────────────────────────────────────────────────────

def build_escalation_report(db_path: str = DB_PATH) -> List[Dict[str, Any]]:
    """
    Returns ALL locations (TIER 1, 2, and 3) sorted by persistence_ratio desc.
    Cached 10 minutes.
    """
    cache_key = 'escalation_report_v3'
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    df = compute_weekly_persistence(db_path)
    if df.empty:
        return []

    results = []
    for _, row in df.iterrows():
        tier = classify_escalation_tier(row)
        row_dict = row.to_dict()
        escalation_rec = suggest_escalation_type(row['_viol_counts'], row_dict)

        # Compute a 0–10 severity score for frontend visualisation
        vol_score   = min(10.0, row['average_weekly_count'] / 50.0)
        ratio_score = row['persistence_ratio'] * 10
        trend_mod   = 2.0 if row['trend_direction'] == 'worsening' else (-1.0 if row['trend_direction'] == 'improving' else 0.0)
        severity_score = round(min(10.0, vol_score * 0.4 + ratio_score * 0.4 + trend_mod * 0.2), 1)

        results.append({
            'location_name':          row['location_name'],
            'police_station':         row['police_station'],
            'persistence_ratio':      row['persistence_ratio'],
            'weeks_present':          int(row['weeks_present']),
            'weeks_in_dataset':       int(row['weeks_in_dataset']),
            'trend_direction':        row['trend_direction'],
            'escalation_tier':        tier,
            'escalation_recommendation': escalation_rec,
            'severity_score':         severity_score,
            'average_weekly_violations': row['average_weekly_count'],
            'min_weekly_violations':  row['min_weekly_count'],
            'max_weekly_violations':  row['max_weekly_count'],
            'dominant_violation_type': row['dominant_violation_type'],
        })

    # Sort: Tier 1 first, then Tier 2, then Tier 3, within each by persistence_ratio desc
    tier_order = {
        'TIER 1 - ESCALATE TO CIVIC AUTHORITY':  0,
        'TIER 2 - ADJUST ENFORCEMENT APPROACH':  1,
        'TIER 3 - STANDARD MONITORING':          2,
    }

    results.sort(key=lambda r: (tier_order.get(r['escalation_tier'], 9), -r['persistence_ratio']))
    _cache_set(cache_key, results)
    return results


def get_tier1_count(db_path: str = DB_PATH) -> int:
    """Returns count of TIER 1 locations — used by dashboard summary."""
    report = build_escalation_report(db_path)
    return sum(1 for r in report if r['escalation_tier'] == 'TIER 1 - ESCALATE TO CIVIC AUTHORITY')


# ─────────────────────────────────────────────────────────────────────────────
# Endpoint
# ─────────────────────────────────────────────────────────────────────────────

@router.get(
    '/persistent-escalation-report',
    summary='Module 6: Full persistent hotspot escalation report — all tiers',
)
async def persistent_escalation_report():
    """Returns ALL locations across all tiers, sorted Tier 1 → 2 → 3, then persistence_ratio desc."""
    try:
        report = build_escalation_report(DB_PATH)
        t1 = [r for r in report if 'TIER 1' in r['escalation_tier']]
        t2 = [r for r in report if 'TIER 2' in r['escalation_tier']]
        t3 = [r for r in report if 'TIER 3' in r['escalation_tier']]
        return {
            'generated_at':    datetime.utcnow().isoformat(),
            'dataset_weeks':   23,
            'total_locations': len(report),
            'tier_1_count':    len(t1),
            'tier_2_count':    len(t2),
            'tier_3_count':    len(t3),
            'scope_note': (
                'Tier 1 = present ≥85% of weeks, not improving — warrants civic escalation. '
                'Tier 2 = present ≥60% of weeks — warrants enforcement adjustment. '
                'Tier 3 = present <60% of weeks — standard monitoring.'
            ),
            'locations': report,
        }
    except Exception as exc:
        logger.exception('Error in /api/hotspots/persistent-escalation-report')
        return JSONResponse(status_code=500, content={'error': str(exc)})
