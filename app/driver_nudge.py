"""
Module 5 — Driver Nudge (SIMULATION STUB)
==========================================
LaneShift: AI-Driven Parking Intelligence for Bengaluru Traffic Police
Gridlock Hackathon 2.0, Theme 1

*** THIS MODULE IS AN INTENTIONAL STUB FOR THE HACKATHON PROTOTYPE ROUND ***

WHAT THIS IS
------------
A simulation endpoint that demonstrates the intended UX flow of the Driver Nudge
feature: at the moment a violation is flagged, the vehicle owner receives a push
notification surfacing the nearest available legal parking option as a one-tap
alternative to waiting for a challan.

WHY IT IS A STUB
----------------
The real implementation requires two external data sources that do not exist in
the provided dataset:

1. Vehicle owner contact channel — In India, the vehicle-to-owner link runs
   through the VAHAN/RTO national vehicle registry (MoRTH). A production system
   would query VAHAN via the registered API (requires BTP/government partnership
   credentials) to retrieve the registered mobile number for a given vehicle
   registration plate, then push a notification via SMS/WhatsApp/app.
   This dataset contains vehicle numbers but NO owner contact information.
   Simulating a contact lookup without this data source would be fabricated.

2. Live parking availability feed — Bengaluru does not currently have a unified
   real-time legal parking availability API. A production implementation would
   integrate with BBMP's parking management system, private parking operators
   (NoParkingZone, ParkSmart, etc.) or a geo-fenced parking layer. The nearest
   legal parking suggestions in this stub are PLACEHOLDER DATA only.

WHAT THE POST-SELECTION BUILD PHASE WOULD ADD
---------------------------------------------
- VAHAN API integration for vehicle-number → owner mobile number lookup
- Live parking slot availability query (BBMP API or aggregated feed)
- Actual push notification delivery (SMS gateway / WhatsApp Business API)
- Challan hold timer: notification fires T-minus N minutes before challan locks,
  giving the driver a real window to move the vehicle and avoid the fine
- Feedback loop: track whether the driver moved before the challan locked (this
  data, aggregated at zone level, would feed back into the scoring model as a
  behavioral compliance signal)

DEMO PURPOSE
------------
This endpoint proves the intended pipeline and response shape for judges:
  violation flagged → location looked up → nearest legal parking found → nudge sent
It uses the real violation lat/lon from the database, but returns placeholder
parking options. The JSON response structure is exactly what the production
endpoint would return.
"""

import logging
import math
import random
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import sessionmaker

from database import Violation, get_engine

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/nudge", tags=["driver-nudge"])

# ── SIMULATION NOTE ───────────────────────────────────────────────────────────
# The nudge note string is returned verbatim in every response so that any
# consumer of this API (judge, demo viewer, frontend) is unambiguously informed
# that this is simulated data, not a real notification.
SIMULATION_NOTE = (
    "SIMULATED — no live driver contact channel exists in this dataset; "
    "this endpoint demonstrates the intended UX flow for the post-selection "
    "build phase. Real implementation requires VAHAN/RTO vehicle-owner lookup "
    "and a live Bengaluru parking availability feed."
)

# ── PLACEHOLDER PARKING OPTIONS ───────────────────────────────────────────────
# *** PLACEHOLDER DATA — NOT REAL PARKING LOCATIONS ***
# These are fictional parking facilities with realistic Bengaluru-style names
# and plausible pricing/distance ranges, used purely for demo purposes.
# In production these would be replaced by a live parking availability API query
# filtered by the violation's lat/lon using a geo-radius search.
#
# Structure: list of dicts with name, base_distance_meters, price_per_hour (INR).
# distance_meters is treated as a base; a small random offset is added per
# request so different violations in the same area return slightly varied results,
# making the demo feel more realistic.

_PLACEHOLDER_PARKING_OPTIONS: List[Dict[str, Any]] = [
    {
        "name": "BBMP Multi-Level Parking – Brigade Road",
        "base_distance_meters": 180,
        "price_per_hour": 30,
    },
    {
        "name": "Forum Mall Basement Parking – Koramangala",
        "base_distance_meters": 350,
        "price_per_hour": 40,
    },
    {
        "name": "Garuda Mall Surface Lot – Magrath Road",
        "base_distance_meters": 420,
        "price_per_hour": 20,
    },
    {
        "name": "KSRTC Bus Stand Annex Parking – Majestic",
        "base_distance_meters": 290,
        "price_per_hour": 15,
    },
    {
        "name": "Orion Mall Underground – Rajajinagar",
        "base_distance_meters": 510,
        "price_per_hour": 50,
    },
    {
        "name": "Phoenix Marketcity Parking – Whitefield",
        "base_distance_meters": 640,
        "price_per_hour": 40,
    },
    {
        "name": "Lalbagh Main Gate Street Parking – Jayanagara",
        "base_distance_meters": 160,
        "price_per_hour": 10,
    },
    {
        "name": "Indiranagar 100ft Road Municipal Lot",
        "base_distance_meters": 270,
        "price_per_hour": 20,
    },
    {
        "name": "MG Road Metro Station Parking – Central",
        "base_distance_meters": 390,
        "price_per_hour": 25,
    },
    {
        "name": "Electronic City Phase 1 – Tech Park Visitor Lot",
        "base_distance_meters": 720,
        "price_per_hour": 0,  # free visitor parking
    },
]


def _find_nearest_option(
    lat: Optional[float],
    lon: Optional[float],
    seed: str,
) -> Dict[str, Any]:
    """
    Return the simulated 'nearest' parking option.

    In production this would be a geo-radius query against a live parking feed.
    Here we use the violation_id as a seed so the same violation always returns
    the same result (deterministic for demo reproducibility), while different
    violations return different options.

    The distance is the placeholder base value ± a small deterministic offset
    derived from the seed, capped at ±80 m.
    """
    # Derive a stable index from the seed string
    seed_int = sum(ord(c) for c in seed)
    option = _PLACEHOLDER_PARKING_OPTIONS[seed_int % len(_PLACEHOLDER_PARKING_OPTIONS)]

    # Stable distance offset: ±0-80m based on seed
    offset = (seed_int % 81) - 40  # range [-40, +40]
    distance = max(50, option["base_distance_meters"] + offset)

    return {
        "name": option["name"],
        "distance_meters": distance,
        "price_per_hour": option["price_per_hour"],
    }


# ── Pydantic models ───────────────────────────────────────────────────────────

class ParkingOption(BaseModel):
    name: str
    distance_meters: int
    price_per_hour: int


class NudgeSimulateRequest(BaseModel):
    violation_id: str


class NudgeSimulateResponse(BaseModel):
    violation_id: str
    violation_location: Optional[str]
    coordinates: Optional[Dict[str, float]]
    congestion_cost_score: Optional[int]
    nudge_priority: str  # "HIGH", "MEDIUM", "LOW" — derived from congestion score
    nudge_sent: bool
    nearest_legal_option: Optional[ParkingOption]
    nudge_rationale: str  # explains why this violation triggered a nudge
    note: str


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/simulate",
    response_model=NudgeSimulateResponse,
    summary="Simulate driver nudge for a violation",
    description=(
        "Looks up the violation by ID, retrieves its lat/lon and location name, "
        "and returns a simulated nudge response with the nearest placeholder "
        "legal parking option. "
        "THIS IS A SIMULATION — see module docstring for what a production "
        "implementation requires."
    ),
)
async def nudge_simulate(body: NudgeSimulateRequest):
    violation_id = body.violation_id.strip()
    if not violation_id:
        return JSONResponse(
            status_code=422,
            content={"error": "violation_id must not be empty"},
        )

    engine = get_engine(DB_PATH)
    Session = sessionmaker(bind=engine)
    session = Session()

    try:
        row = (
            session.query(
                Violation.id,
                Violation.location,
                Violation.latitude,
                Violation.longitude,
                Violation.congestion_cost_score,
                Violation.primary_violation,
            )
            .filter(Violation.id == violation_id)
            .first()
        )

        if row is None:
            return JSONResponse(
                status_code=404,
                content={"error": f"Violation '{violation_id}' not found"},
            )

        nearest = _find_nearest_option(row.latitude, row.longitude, seed=violation_id)

        coords = None
        if row.latitude is not None and row.longitude is not None:
            coords = {"lat": row.latitude, "lon": row.longitude}

        # ── Connect nudge to Module 2's congestion score ──────────────────────
        # Nudges are prioritised by congestion_cost_score:
        #   HIGH   (score >= 700) — high-impact violation, nudge fires immediately
        #   MEDIUM (score 400-699) — moderate impact, nudge fires with standard delay
        #   LOW    (score < 400)  — low impact, nudge fires as informational only
        # This makes the nudge module a consumer of Module 2's output, not a
        # standalone feature — the scoring model directly drives notification priority.
        score = row.congestion_cost_score
        if score is None:
            nudge_priority = "UNKNOWN"
            rationale = (
                f"Congestion score not yet computed for this violation "
                f"(run POST /api/compute-scores first). "
                f"Violation type: {row.primary_violation or 'unknown'}."
            )
        elif score >= 700:
            nudge_priority = "HIGH"
            rationale = (
                f"Congestion score {score}/1000 (HIGH impact). "
                f"This {row.primary_violation or 'violation'} is in the top congestion tier — "
                f"nudge fires immediately to maximise chance of vehicle being moved "
                f"before enforcement action locks in."
            )
        elif score >= 400:
            nudge_priority = "MEDIUM"
            rationale = (
                f"Congestion score {score}/1000 (MEDIUM impact). "
                f"Standard nudge with 5-minute window before challan issuance."
            )
        else:
            nudge_priority = "LOW"
            rationale = (
                f"Congestion score {score}/1000 (LOW impact). "
                f"Informational nudge only — enforcement proceeds on normal timeline."
            )

        return NudgeSimulateResponse(
            violation_id=row.id,
            violation_location=row.location,
            coordinates=coords,
            congestion_cost_score=score,
            nudge_priority=nudge_priority,
            nudge_sent=True,
            nearest_legal_option=ParkingOption(**nearest),
            nudge_rationale=rationale,
            note=SIMULATION_NOTE,
        )

    except Exception as exc:
        logger.exception("Error in /api/nudge/simulate")
        return JSONResponse(status_code=500, content={"error": str(exc)})
    finally:
        session.close()
