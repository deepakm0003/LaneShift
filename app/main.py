import os
import logging
from pathlib import Path
from datetime import datetime
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from database import load_csv_into_db, db_exists_and_has_data, get_violation_count, verify_foundation_integrity
from models import (
    HealthResponse, ComputeScoresResponse, ViolationScoreResponse
)
from scoring import compute_all_scores, get_violation_score_breakdown
from dispatch import router as dispatch_router
from auto_validation import router as auto_validation_router
from driver_nudge import router as driver_nudge_router
from dashboard import router as dashboard_router
from insights import router as insights_router
from forecasting import router as forecasting_router
from geo import router as geo_router
from simulated_detection import router as detection_router
from persistent_hotspots import router as hotspots_router
from challan_generator   import router as challan_router
from live_monitor        import router as live_monitor_router
from csv_upload          import router as csv_upload_router

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Configuration
PROJECT_ROOT = Path(__file__).parent.parent
DATA_DIR = PROJECT_ROOT / "data"
DB_PATH = str(PROJECT_ROOT / "violations.db")

# Expected CSV filename pattern
CSV_FILENAME = "jan to may police violation_anonymized791b166.csv"


def _startup_banner(record_count: int, scores_ready: bool) -> None:
    """Print a structured startup banner showing system state and all endpoints."""
    SEP = "=" * 65
    logger.info(SEP)
    logger.info("  LaneShift Backend — AI Parking Intelligence for Bengaluru BTP")
    logger.info("  Gridlock Hackathon 2.0 | Theme 1")
    logger.info(SEP)

    # ── Data state ────────────────────────────────────────────────────────────
    if record_count > 0:
        logger.info(f"  ✓ Records loaded : {record_count:,}")
    else:
        logger.error("  ✗ Records loaded : 0  ← place CSV in data/ and restart")

    if scores_ready:
        logger.info("  ✓ Congestion scores : computed")
    else:
        logger.warning("  ⚠  Congestion scores : NOT computed")
        logger.warning("     → Call POST /api/compute-scores to score all violations")
        logger.warning("       (takes ~15-20 s; only needed once per DB load)")

    logger.info(SEP)
    # ── Key dataset findings ──────────────────────────────────────────────────
    logger.info("  Key dataset findings (from violations.db):")
    logger.info(f"    {record_count:,} total records  |  Nov 2023 – Apr 2024")
    logger.info("    173,196 (58.0%) have a validation_status")
    logger.info("    125,254 (42.0%) have NO validation_status — never visibly entered the review pipeline")
    logger.info("    57,476 rejected/stuck = 49,754 rejected + 7,044 created1 + 678 processing")
    logger.info("    85.17% of rejected/stuck meet all four auto-validation criteria")
    logger.info(SEP)

    # ── Endpoint directory ────────────────────────────────────────────────────
    endpoints = [
        ("GET",  "/health",
         "System health + total record count"),
        ("GET",  "/",
         "API root / version info"),
        ("GET",  "/docs",
         "Interactive Swagger UI"),
        ("─── Module 2: Scoring ──────────────────────────────────", "", ""),
        ("POST", "/api/compute-scores",
         "Score all violations (run once after DB load)"),
        ("GET",  "/api/violations/{id}/score",
         "Score breakdown for a single violation"),
        ("─── Module 3: Dispatch Ranking ─────────────────────────", "", ""),
        ("GET",  "/api/dispatch/by-station",
         "Stations ranked by aggregate congestion score"),
        ("GET",  "/api/dispatch/by-junction",
         "Named junctions ranked by congestion score"),
        ("GET",  "/api/dispatch/hotspot-zones",
         "Mid-block geographic clusters (~100 m grid)"),
        ("GET",  "/api/dispatch/live-queue",
         "★ Unified dispatch queue — junction + midblock combined"),
        ("GET",  "/api/dispatch/validation-leak-report",
         "Per-station rejection/stuck rate (the 30% leak proof)"),
        ("POST", "/api/dispatch/clear-cache",
         "Flush 5-minute in-memory cache"),
        ("─── Module 4: Auto-Validation (SIMULATED) ──────────────", "", ""),
        ("GET",  "/api/auto-validation/simulation-report",
         "How many rejected/stuck violations were auto-validatable"),
        ("GET",  "/api/auto-validation/full-pipeline-projection",
         "Projection: all 298K records under LaneShift governance"),
        ("─── Module 5: Driver Nudge (SIMULATED STUB) ────────────", "", ""),
        ("POST", "/api/nudge/simulate",
         "Simulated nudge with nearest legal parking option"),
        ("─── Insights & Transparency ────────────────────────────", "", ""),
        ("GET",  "/api/severity-weights",
         "Full offence-code severity table used by scoring engine"),
        ("GET",  "/api/data-quality/validation-status-breakdown",
         "Exact status counts — reconciles 57,476 figure + 125K null finding"),
        ("GET",  "/api/dashboard/null-status-breakdown",
         "125K null-status records by station + violation type"),
        ("GET",  "/api/dashboard/summary",
         "★ Single-call demo endpoint — full primary view payload"),
        ("─── Forecasting ────────────────────────────────────────", "", ""),
        ("GET",  "/api/forecast/{station}",
         "14-day forward forecast + real backtest MAE/MAPE for one station"),
        ("GET",  "/api/forecast/all-stations/summary",
         "Forecast summary for top 10 stations, sorted by projected volume"),
        ("─── Geo / Mapbox ───────────────────────────────────────", "", ""),
        ("GET",  "/api/geo/violation-points?month=YYYY-MM",
         "GeoJSON FeatureCollection for one month (Mapbox-ready, [lon,lat])"),
        ("GET",  "/api/geo/monthly-summary",
         "Per-month counts for time-scrub slider"),
        ("GET",  "/api/geo/station-boundaries-approx",
         "Approx convex-hull station boundaries as GeoJSON Polygons"),
    ]

    logger.info("  Available endpoints:")
    for method, path, desc in endpoints:
        if not path:  # section header row
            logger.info(f"  {method}")
        else:
            logger.info(f"    {method:5}  {path:45} {desc}")

    logger.info(SEP)
    logger.info("  Server ready at http://0.0.0.0:8000")
    logger.info(SEP)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Lifecycle context manager: runs on app startup.
    Loads CSV into database if DB doesn't exist or is empty,
    then prints a structured startup banner showing system state.
    """
    # ── Data loading ──────────────────────────────────────────────────────────
    if db_exists_and_has_data(DB_PATH):
        count = get_violation_count(DB_PATH)
        logger.info(f"Database already populated with {count:,} records. Skipping CSV load.")
    else:
        logger.info("Database not found or empty. Attempting to load CSV...")
        csv_files = list(DATA_DIR.glob("*.csv"))

        if not csv_files:
            logger.error(f"✗ No CSV files found in {DATA_DIR}")
            logger.error("  Place the violations CSV in the data/ directory and restart.")
            count = 0
        else:
            csv_path = str(csv_files[0])
            logger.info(f"  Found CSV: {csv_path}")
            try:
                load_csv_into_db(csv_path, DB_PATH)
                count = get_violation_count(DB_PATH)
                logger.info(f"  ✓ Loaded {count:,} violation records into database")
            except Exception as e:
                logger.error(f"  ✗ Failed to load CSV: {e}")
                count = 0

    # ── Check whether congestion scores have been computed ────────────────────
    try:
        from sqlalchemy.orm import sessionmaker
        from database import get_engine, Violation as _Violation
        _engine = get_engine(DB_PATH)
        with sessionmaker(bind=_engine)() as _sess:
            scored = (
                _sess.query(_Violation)
                .filter(_Violation.congestion_cost_score.isnot(None))
                .limit(1)
                .count()
            )
        scores_ready = scored > 0
    except Exception:
        scores_ready = False

    _startup_banner(count, scores_ready)

    # ── Verify foundation integrity ───────────────────────────────────────────
    verify_foundation_integrity(DB_PATH)

    # ── Warm up the CV model so first upload isn't slow ───────────────────────
    try:
        from cv_detection import warmup_model
        warmup_model()
    except Exception as _cv_e:
        logger.warning("CV model warmup skipped: %s", _cv_e)

    yield  # App runs here

    logger.info("LaneShift Backend — shutdown")


# Create FastAPI app with lifespan
app = FastAPI(
    title="LaneShift Backend",
    description="AI-Driven Parking Violation Intelligence for Bengaluru Traffic Police",
    version="0.1.0",
    lifespan=lifespan
)

# Allow large uploads (video up to 100 MB, CSV up to 50 MB)
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class LargeUploadMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        request._body_max_size = 100 * 1024 * 1024  # 100 MB
        return await call_next(request)

# ── CORS — allow the Vite dev server and any local preview port ──────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:4173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dispatch_router)
app.include_router(auto_validation_router)
app.include_router(driver_nudge_router)
app.include_router(dashboard_router)
app.include_router(insights_router)
app.include_router(forecasting_router)
app.include_router(geo_router)
app.include_router(detection_router)
app.include_router(hotspots_router)
app.include_router(challan_router)
app.include_router(live_monitor_router)
app.include_router(csv_upload_router)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """
    Health check endpoint.
    Returns system status and total violation records in database.
    """
    try:
        total_records = get_violation_count(DB_PATH)
        return HealthResponse(
            status="ok",
            total_records=total_records,
            database_path=DB_PATH,
            timestamp=datetime.utcnow()
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "total_records": 0,
                "database_path": DB_PATH,
                "timestamp": datetime.utcnow().isoformat(),
                "error": str(e)
            }
        )


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "message": "LaneShift Backend API",
        "version": "0.1.0",
        "docs": "/docs",
        "health": "/health"
    }


@app.post("/api/compute-scores", response_model=ComputeScoresResponse)
async def compute_scores():
    """
    Compute congestion cost scores for all violations in the database.
    
    This endpoint:
    1. Builds lookup tables from historical hourly and junction data
    2. Computes a 0-1000 congestion cost score for each violation
    3. Stores scores in the database
    
    Takes ~1-2 seconds for the full 298,450-record dataset.
    """
    logger.info("POST /api/compute-scores: Starting score computation...")
    try:
        records_scored, computation_time = compute_all_scores(DB_PATH)
        logger.info(f"Score computation complete: {records_scored} records in {computation_time:.2f}s")
        return ComputeScoresResponse(
            status="complete",
            records_scored=records_scored,
            computation_time_seconds=computation_time
        )
    except Exception as e:
        logger.error(f"Score computation failed: {e}")
        return JSONResponse(
            status_code=500,
            content={
                "status": "error",
                "message": str(e)
            }
        )


@app.get("/api/violations/{violation_id}/score", response_model=ViolationScoreResponse)
async def get_violation_score(violation_id: str):
    """
    Retrieve a violation record with full score breakdown.
    
    Returns the congestion cost score plus all four component weights,
    allowing judges/stakeholders to see WHY a violation got its score.
    
    Args:
        violation_id: The ID of the violation (e.g., "FKID000000")
    
    Returns:
        ViolationScoreResponse with score and breakdown of all four factors
    """
    logger.info(f"GET /api/violations/{violation_id}/score")
    try:
        breakdown = get_violation_score_breakdown(DB_PATH, violation_id)
        if not breakdown:
            return JSONResponse(
                status_code=404,
                content={"error": f"Violation {violation_id} not found"}
            )
        return ViolationScoreResponse(**breakdown)
    except Exception as e:
        logger.error(f"Error fetching violation score: {e}")
        return JSONResponse(
            status_code=500,
            content={"error": str(e)}
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
