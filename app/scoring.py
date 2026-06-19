"""
Congestion Cost Scoring Engine for LaneShift

Core formula: Combines four weighted factors into a 0-1000 score:
  - time_of_day_weight (35%): Higher during peak hours
  - junction_density_weight (30%): Higher at frequently-violated junctions
  - severity_weight (25%): Based on violation type's carriageway obstruction impact
  - stacking_multiplier (10%): Bonus for multi-violation records

The stacking_multiplier is applied as a post-combination amplifier, not an additive component.
"""

import json
import logging
from typing import Dict, List, Optional, Tuple
from datetime import datetime
import time

from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from severity_weights import OFFENCE_CODE_SEVERITY, DEFAULT_SEVERITY
from database import get_engine, Violation

logger = logging.getLogger(__name__)


def get_stacking_multiplier(violation_count: int) -> float:
    """
    Multi-violation stacking multiplier.
    One vehicle cited for multiple simultaneous violations has compounding impact.
    
    Args:
        violation_count: Number of violations cited on this record
        
    Returns:
        Multiplier: 1.0x for 1, 1.15x for 2, 1.3x for 3, 1.5x for 4+
    """
    if violation_count <= 1:
        return 1.0
    elif violation_count == 2:
        return 1.15
    elif violation_count == 3:
        return 1.3
    else:  # 4+
        return 1.5


def build_hourly_weight_lookup(db_path: str) -> Dict[int, float]:
    """
    Build hourly weight lookup from actual historical data.
    
    Computes the distribution of violations by hour_ist across the entire dataset,
    then normalizes to 0-100 where the peak hour(s) = 100.
    
    This ensures peak-hour violations get significantly higher weight.
    
    Returns:
        Dict mapping hour (0-23) to normalized weight (0-100)
    """
    engine = get_engine(db_path)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Query: count violations by hour_ist
        result = session.query(
            Violation.hour_ist,
            text("COUNT(*) as count")
        ).group_by(Violation.hour_ist).all()
        
        hourly_counts = {}
        for hour, count in result:
            if hour is not None:  # Skip NULL hours
                hourly_counts[int(hour)] = count
        
        # Find peak hour count
        if not hourly_counts:
            logger.warning("No hourly data found; using flat weights")
            return {h: 50 for h in range(24)}
        
        max_count = max(hourly_counts.values())
        
        # Normalize to 0-100, with peak = 100
        hourly_weights = {}
        for hour in range(24):
            if hour in hourly_counts:
                hourly_weights[hour] = (hourly_counts[hour] / max_count) * 100
            else:
                hourly_weights[hour] = 0  # No violations recorded at this hour
        
        logger.info(f"Hourly weight lookup built. Peak hour(s): {[h for h, w in hourly_weights.items() if w == 100]}")
        return hourly_weights
        
    finally:
        session.close()


def build_junction_density_lookup(db_path: str) -> Dict[str, float]:
    """
    Build junction density lookup from actual historical data.
    
    For each named junction, counts violations at that location.
    Normalizes to 0-100 where the highest-violation junction = 100.
    Returns a special key "no_junction" with a moderate flat weight (40).
    
    Why flat 40 for "No Junction"? Mid-block spillover violations are NOT all equally low-risk:
    some occur on wide arterials (low impact), others in narrow commercial lanes (high impact).
    Without geospatial granularity, a moderate weight represents aggregate risk.
    
    Returns:
        Dict mapping junction_name to normalized weight (0-100), plus "no_junction": 40
    """
    engine = get_engine(db_path)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Query: count violations by junction_name (excluding "No Junction")
        result = session.query(
            Violation.junction_name,
            text("COUNT(*) as count")
        ).filter(
            Violation.junction_name != "No Junction",
            Violation.junction_name.isnot(None)
        ).group_by(Violation.junction_name).all()
        
        junction_counts = {}
        for junction_name, count in result:
            junction_counts[junction_name] = count
        
        # Find peak junction count
        if not junction_counts:
            logger.warning("No named junction data found")
            return {"no_junction": 40}
        
        max_count = max(junction_counts.values())
        
        # Normalize to 0-100, with peak = 100
        junction_weights = {}
        for junction_name, count in junction_counts.items():
            junction_weights[junction_name] = (count / max_count) * 100
        
        # Special entry for mid-block violations
        junction_weights["no_junction"] = 40
        
        logger.info(f"Junction density lookup built. {len(junction_counts)} named junctions. "
                    f"Top junction: {max(junction_counts, key=junction_counts.get)} "
                    f"({max(junction_counts.values())} violations)")
        return junction_weights
        
    finally:
        session.close()


def compute_congestion_cost_score(
    violation: dict,
    junction_density_lookup: Dict[str, float],
    hourly_weight_lookup: Dict[int, float]
) -> int:
    """
    Compute congestion cost score for a single violation record.
    
    Args:
        violation: Dict with keys:
            - hour_ist: int, 0-23
            - junction_name: str or None
            - is_named_junction: bool
            - offence_code: list of ints or JSON string
            - violation_count: int
        
        junction_density_lookup: Dict mapping junction_name → weight (0-100)
        hourly_weight_lookup: Dict mapping hour (0-23) → weight (0-100)
    
    Returns:
        int: Congestion cost score, 0-1000
    """
    
    # === Component 1: Time-of-Day Weight (0-100) ===
    hour = violation.get("hour_ist")
    if hour is None or hour < 0 or hour > 23:
        time_of_day_weight = 50  # Default to moderate
    else:
        time_of_day_weight = hourly_weight_lookup.get(int(hour), 50)
    
    # === Component 2: Junction Density Weight (0-100) ===
    if violation.get("is_named_junction"):
        junction_name = violation.get("junction_name")
        junction_density_weight = junction_density_lookup.get(junction_name, 40)
    else:
        # Mid-block violation
        junction_density_weight = junction_density_lookup.get("no_junction", 40)
    
    # === Component 3: Severity Weight (0-100) ===
    # Parse offence_code list (may be JSON string or Python list)
    offence_codes = violation.get("offence_code", [])
    if isinstance(offence_codes, str):
        try:
            offence_codes = json.loads(offence_codes)
        except (json.JSONDecodeError, TypeError):
            offence_codes = []
    
    if not offence_codes or len(offence_codes) == 0:
        # No offence codes; use default
        average_severity = DEFAULT_SEVERITY
    else:
        # Average severity across all offence codes for this violation
        severities = [
            OFFENCE_CODE_SEVERITY.get(int(code), DEFAULT_SEVERITY)
            for code in offence_codes
        ]
        average_severity = sum(severities) / len(severities)
    
    # Normalize to 0-100 (max severity is 10)
    severity_weight_normalized = (average_severity / 10.0) * 100
    
    # === Component 4: Stacking Multiplier ===
    violation_count = violation.get("violation_count", 1)
    stacking_multiplier = get_stacking_multiplier(violation_count)
    
    # === Final Score Calculation ===
    # Weighted combination of the four factors
    weighted_sum = (
        (time_of_day_weight * 0.35) +
        (junction_density_weight * 0.30) +
        (severity_weight_normalized * 0.25) +
        (stacking_multiplier * 100 * 0.10)  # Normalize multiplier to 0-100 scale for weighting
    )
    
    # Apply stacking multiplier to amplify the combined score
    amplified_score = weighted_sum * stacking_multiplier
    
    # Scale to 0-1000
    final_score = round(amplified_score * 10)
    
    # Clamp to 0-1000 range (safety check)
    final_score = max(0, min(1000, final_score))
    
    return final_score


def compute_all_scores(db_path: str) -> Tuple[int, float]:
    """
    Compute and store congestion_cost_score for all violations in the database.
    
    This function:
    1. Builds the lookup tables from actual data
    2. Fetches all violations
    3. Computes scores
    4. Writes scores back to DB
    
    Args:
        db_path: Path to SQLite database
    
    Returns:
        Tuple[records_scored, computation_time_seconds]
    """
    start_time = time.time()
    engine = get_engine(db_path)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Build lookup tables
        logger.info("Building lookup tables from historical data...")
        hourly_weight_lookup = build_hourly_weight_lookup(db_path)
        junction_density_lookup = build_junction_density_lookup(db_path)
        
        # Fetch all violations
        logger.info("Fetching all violations from database...")
        violations = session.query(Violation).all()
        total_records = len(violations)
        logger.info(f"Found {total_records} violations to score")
        
        if total_records == 0:
            return 0, time.time() - start_time
        
        # Compute and update scores
        logger.info("Computing congestion cost scores...")
        scores_computed = 0
        
        for violation in violations:
            # Build dict from violation object
            violation_dict = {
                "hour_ist": violation.hour_ist,
                "junction_name": violation.junction_name,
                "is_named_junction": violation.is_named_junction,
                "offence_code": violation.offence_code,  # JSON string from DB
                "violation_count": violation.violation_count,
            }
            
            # Compute score
            score = compute_congestion_cost_score(
                violation_dict,
                junction_density_lookup,
                hourly_weight_lookup
            )
            
            # Update record
            violation.congestion_cost_score = score
            scores_computed += 1
            
            # Log progress every 10k records
            if scores_computed % 10000 == 0:
                logger.info(f"  Scored {scores_computed}/{total_records}...")
        
        # Commit all changes
        logger.info("Committing scores to database...")
        session.commit()
        
        computation_time = time.time() - start_time
        logger.info(f"✓ Scoring complete. {scores_computed} records in {computation_time:.2f}s")
        
        return scores_computed, computation_time
        
    except Exception as e:
        logger.error(f"Error computing scores: {e}")
        session.rollback()
        raise
    finally:
        session.close()


def get_violation_score_breakdown(db_path: str, violation_id: str) -> Optional[Dict]:
    """
    Retrieve a violation record with full score breakdown.
    
    Returns all four component weights plus the final score, for transparency.
    
    Args:
        db_path: Path to SQLite database
        violation_id: ID of the violation to look up
    
    Returns:
        Dict with score breakdown, or None if not found
    """
    engine = get_engine(db_path)
    Session = sessionmaker(bind=engine)
    session = Session()
    
    try:
        # Build lookup tables (needed to recompute components)
        hourly_weight_lookup = build_hourly_weight_lookup(db_path)
        junction_density_lookup = build_junction_density_lookup(db_path)
        
        # Fetch violation
        violation = session.query(Violation).filter(Violation.id == violation_id).first()
        
        if not violation:
            return None
        
        # Recompute component weights
        # 1. Time-of-day
        hour = violation.hour_ist
        if hour is None or hour < 0 or hour > 23:
            time_of_day_weight = 50
        else:
            time_of_day_weight = hourly_weight_lookup.get(int(hour), 50)
        
        # 2. Junction density
        if violation.is_named_junction:
            junction_density_weight = junction_density_lookup.get(violation.junction_name, 40)
        else:
            junction_density_weight = junction_density_lookup.get("no_junction", 40)
        
        # 3. Severity
        offence_codes = violation.offence_code
        if isinstance(offence_codes, str):
            try:
                offence_codes = json.loads(offence_codes)
            except (json.JSONDecodeError, TypeError):
                offence_codes = []
        
        if not offence_codes or len(offence_codes) == 0:
            average_severity = DEFAULT_SEVERITY
        else:
            severities = [
                OFFENCE_CODE_SEVERITY.get(int(code), DEFAULT_SEVERITY)
                for code in offence_codes
            ]
            average_severity = sum(severities) / len(severities)
        
        severity_weight_normalized = (average_severity / 10.0) * 100
        
        # 4. Stacking
        stacking_multiplier = get_stacking_multiplier(violation.violation_count)
        
        return {
            "violation_id": violation.id,
            "location": violation.location,
            "junction_name": violation.junction_name,
            "vehicle_number": violation.vehicle_number,
            "vehicle_type": violation.vehicle_type,
            "primary_violation": violation.primary_violation,
            "violation_type": json.loads(violation.violation_type) if isinstance(violation.violation_type, str) else violation.violation_type,
            "offence_code": json.loads(violation.offence_code) if isinstance(violation.offence_code, str) else violation.offence_code,
            "created_ist": violation.created_ist.isoformat() if violation.created_ist else None,
            "hour_ist": violation.hour_ist,
            "police_station": violation.police_station,
            "validation_status": violation.validation_status,
            "congestion_cost_score": violation.congestion_cost_score,
            "score_breakdown": {
                "time_of_day_weight": round(time_of_day_weight, 2),
                "junction_density_weight": round(junction_density_weight, 2),
                "severity_weight": round(severity_weight_normalized, 2),
                "stacking_multiplier": round(stacking_multiplier, 2),
                "methodology": "score = (time*0.35 + junction*0.30 + severity*0.25 + stacking*0.10) * stacking_multiplier * 10, scaled 0-1000"
            }
        }
        
    finally:
        session.close()
