"""
LaneShift — CSV Upload & Analytics Endpoint
=============================================
POST /api/upload/csv

Accepts any CSV file (up to 50 MB), auto-detects columns, computes
analytics entirely in-memory, and returns a full dashboard report.

CRITICAL DATA INTEGRITY RULE:
  This endpoint NEVER touches violations_foundation.
  Uploaded data goes to violations_uploaded (tagged with a batch ID).
  The foundation table — and therefore all existing dashboard, dispatch,
  forecast, hotspot, and challan endpoints — remains 100% unaffected.
"""

import io
import json
import logging
import time
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH      = str(PROJECT_ROOT / "violations.db")

router = APIRouter(prefix="/api/upload", tags=["upload"])

MAX_CSV_BYTES = 50 * 1024 * 1024  # 50 MB


# ── Column auto-detection ─────────────────────────────────────────────────────

# Maps our internal field names → list of possible column name patterns (lowercase)
_COL_PATTERNS: Dict[str, List[str]] = {
    "id":               ["id", "fkid", "violation_id", "case_id", "record_id"],
    "violation_type":   ["violation_type", "violation", "offence_type", "violation_types",
                         "primary_violation", "offence", "violation type"],
    "offence_code":     ["offence_code", "offence_codes", "offense_code", "code"],
    "vehicle_type":     ["vehicle_type", "vehicle type", "veh_type", "vehicletype"],
    "vehicle_number":   ["vehicle_number", "vehicle number", "reg_no", "registration",
                         "veh_number", "number_plate"],
    "latitude":         ["latitude", "lat"],
    "longitude":        ["longitude", "lon", "long", "lng"],
    "location":         ["location", "address", "place"],
    "police_station":   ["police_station", "station", "ps_name", "police station",
                         "ps", "center_code"],
    "junction_name":    ["junction_name", "junction", "junction name", "location_name"],
    "created_datetime": ["created_datetime", "created_at", "datetime", "date_time",
                         "timestamp", "created", "date"],
    "validation_status":["validation_status", "status", "validation status"],
    "data_sent_to_scita":["data_sent_to_scita", "scita"],
}


def _detect_columns(df_cols: List[str]) -> Dict[str, Optional[str]]:
    """
    For each internal field, find the best matching column in the CSV.
    Returns mapping: internal_field → actual_csv_column (or None).
    """
    cols_lower = {c.lower().strip(): c for c in df_cols}
    mapping: Dict[str, Optional[str]] = {}

    for field, patterns in _COL_PATTERNS.items():
        found = None
        for pat in patterns:
            if pat in cols_lower:
                found = cols_lower[pat]
                break
        # Fuzzy: partial match
        if not found:
            for pat in patterns:
                for col_lower, col_orig in cols_lower.items():
                    if pat in col_lower or col_lower in pat:
                        found = col_orig
                        break
                if found:
                    break
        mapping[field] = found

    return mapping


def _normalize_df(df: pd.DataFrame, col_map: Dict[str, Optional[str]]) -> pd.DataFrame:
    """
    Rename detected columns to internal names and derive missing columns.
    """
    rename = {v: k for k, v in col_map.items() if v and v in df.columns}
    df = df.rename(columns=rename)

    # Ensure id column
    if "id" not in df.columns:
        df["id"] = [f"ROW{i:07d}" for i in range(len(df))]

    # Normalise violation_type — handle both list strings and plain strings
    if "violation_type" in df.columns:
        def _parse_vtype(v):
            if pd.isna(v):
                return []
            s = str(v).strip()
            # Try JSON / Python list
            if s.startswith("["):
                try:
                    parsed = json.loads(s.replace("'", '"'))
                    if isinstance(parsed, list):
                        return [str(x).strip() for x in parsed if x]
                except Exception:
                    pass
            # Comma-separated
            if "," in s:
                return [x.strip() for x in s.split(",") if x.strip()]
            return [s] if s else []
        df["violation_type"] = df["violation_type"].apply(_parse_vtype)
    else:
        df["violation_type"] = [[]] * len(df)

    df["primary_violation"] = df["violation_type"].apply(
        lambda x: x[0].upper() if x else "UNKNOWN"
    )
    df["violation_count"] = df["violation_type"].apply(len)

    # offence_code
    if "offence_code" not in df.columns:
        df["offence_code"] = [[]] * len(df)
    else:
        def _parse_code(v):
            if pd.isna(v):
                return []
            s = str(v).strip()
            if s.startswith("["):
                try:
                    return json.loads(s.replace("'", '"'))
                except Exception:
                    pass
            try:
                return [int(float(s))]
            except Exception:
                return []
        df["offence_code"] = df["offence_code"].apply(_parse_code)

    # Datetime
    if "created_datetime" in df.columns:
        df["created_datetime"] = pd.to_datetime(df["created_datetime"], utc=True, errors="coerce")
        from datetime import timedelta
        df["created_ist"] = df["created_datetime"] + timedelta(hours=5, minutes=30)
        df["hour_ist"] = df["created_ist"].dt.hour
    else:
        df["created_ist"] = pd.NaT
        df["hour_ist"] = np.nan

    # Junction flags
    if "junction_name" in df.columns:
        df["is_named_junction"] = df["junction_name"].notna() & (df["junction_name"] != "No Junction")
    else:
        df["junction_name"] = "No Junction"
        df["is_named_junction"] = False

    # Fill missing non-essential columns with None
    for col in ["latitude", "longitude", "location", "police_station", "vehicle_type",
                "vehicle_number", "validation_status", "data_sent_to_scita",
                "modified_datetime", "closed_datetime", "device_id", "created_by_id",
                "center_code", "action_taken_timestamp", "data_sent_to_scita_timestamp",
                "updated_vehicle_number", "updated_vehicle_type", "validation_timestamp",
                "description"]:
        if col not in df.columns:
            df[col] = None

    df["congestion_cost_score"] = None
    return df


# ── Analytics builder ─────────────────────────────────────────────────────────

def _build_analytics(df: pd.DataFrame) -> Dict[str, Any]:
    """
    Build a full analytics report from a normalised violations DataFrame.
    Mirrors what the main website computes from its SQLite database.
    """
    total = len(df)
    if total == 0:
        return {"error": "No records found"}

    # ── KPI block ─────────────────────────────────────────────────────────────
    has_status = df["validation_status"].notna() if "validation_status" in df.columns else pd.Series([False]*total)
    null_status_count  = int((~has_status).sum())
    records_with_status = total - null_status_count

    rejected_statuses = {"rejected", "created1", "processing", "failed"}
    if "validation_status" in df.columns:
        rejected_mask = df["validation_status"].str.lower().isin(rejected_statuses)
        rejected_count = int(rejected_mask.sum())
    else:
        rejected_count = 0

    total_unresolved = rejected_count + null_status_count
    unresolved_pct   = round(total_unresolved / total * 100, 2) if total else 0

    kpi = {
        "total_records":           total,
        "records_with_status":     records_with_status,
        "null_status_count":       null_status_count,
        "null_status_pct":         round(null_status_count / total * 100, 2) if total else 0,
        "rejected_or_stuck":       rejected_count,
        "total_unresolved":        total_unresolved,
        "unresolved_pct":          unresolved_pct,
        "named_junction_pct":      round(df["is_named_junction"].mean() * 100, 2) if total else 0,
    }

    # ── Violation types ───────────────────────────────────────────────────────
    vtype_counts = df["primary_violation"].value_counts()
    violation_types = [
        {"type": k, "count": int(v), "pct": round(v / total * 100, 2)}
        for k, v in vtype_counts.head(10).items()
        if k and k != "UNKNOWN"
    ]

    # ── Hourly pattern ────────────────────────────────────────────────────────
    if df["hour_ist"].notna().any():
        hourly_raw = df["hour_ist"].dropna().astype(int).value_counts().sort_index()
        hourly_pattern = [
            {"hour": int(h), "count": int(c)}
            for h, c in hourly_raw.items()
            if 0 <= h <= 23
        ]
        # Fill missing hours with 0
        hour_map = {x["hour"]: x["count"] for x in hourly_pattern}
        hourly_pattern = [{"hour": h, "count": hour_map.get(h, 0)} for h in range(24)]
    else:
        hourly_pattern = []

    # ── Monthly trend ─────────────────────────────────────────────────────────
    if "created_ist" in df.columns and df["created_ist"].notna().any():
        df["_month"] = df["created_ist"].dt.to_period("M").astype(str)
        monthly_raw = df["_month"].value_counts().sort_index()
        monthly_trend = [
            {"month": k, "count": int(v)}
            for k, v in monthly_raw.items()
            if k and k != "NaT"
        ]
        monthly_trend.sort(key=lambda x: x["month"])
    else:
        monthly_trend = []

    # ── Vehicle types ─────────────────────────────────────────────────────────
    if "vehicle_type" in df.columns and df["vehicle_type"].notna().any():
        veh_counts = df["vehicle_type"].dropna().str.upper().value_counts()
        vehicle_types = [
            {"type": k, "count": int(v), "pct": round(v / total * 100, 2)}
            for k, v in veh_counts.head(8).items()
        ]
    else:
        vehicle_types = []

    # ── Top stations ──────────────────────────────────────────────────────────
    if "police_station" in df.columns and df["police_station"].notna().any():
        station_counts = df["police_station"].value_counts().head(10)
        top_stations = []
        for station, cnt in station_counts.items():
            sdf = df[df["police_station"] == station]
            if "validation_status" in sdf.columns:
                rej = int(sdf["validation_status"].str.lower().isin(rejected_statuses).sum())
                rej_pct = round(rej / len(sdf) * 100, 1) if len(sdf) else 0
            else:
                rej_pct = 0
            top_stations.append({
                "station": station,
                "count": int(cnt),
                "rejection_rate_pct": rej_pct,
            })
    else:
        top_stations = []

    # ── Top junctions ─────────────────────────────────────────────────────────
    if "junction_name" in df.columns:
        junc_df = df[df["junction_name"].notna() & (df["junction_name"] != "No Junction")]
        junc_counts = junc_df["junction_name"].value_counts().head(10)
        top_junctions = [
            {"junction": k, "count": int(v)}
            for k, v in junc_counts.items()
        ]
    else:
        top_junctions = []

    # ── Score distribution (if scores computed) ───────────────────────────────
    if "congestion_cost_score" in df.columns and df["congestion_cost_score"].notna().any():
        scores = df["congestion_cost_score"].dropna()
        bins   = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000]
        labels = [f"{bins[i]}–{bins[i+1]}" for i in range(len(bins)-1)]
        hist, _ = np.histogram(scores, bins=bins)
        score_distribution = [{"range": l, "count": int(c)} for l, c in zip(labels, hist)]
        avg_score = round(float(scores.mean()), 1)
        max_score = int(scores.max())
    else:
        score_distribution = []
        avg_score = None
        max_score = None

    return {
        "kpi":                kpi,
        "violation_types":    violation_types,
        "hourly_pattern":     hourly_pattern,
        "monthly_trend":      monthly_trend,
        "vehicle_types":      vehicle_types,
        "top_stations":       top_stations,
        "top_junctions":      top_junctions,
        "score_distribution": score_distribution,
        "avg_score":          avg_score,
        "max_score":          max_score,
    }


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/csv",
    summary="Upload a violations CSV and get a full analytics report",
)
async def upload_csv(file: UploadFile = File(...)):
    """
    Upload any violations CSV file (up to 50 MB).

    The backend:
    1. Reads and auto-maps column names
    2. Loads records into the violations database (replaces existing data)
    3. Runs the Module 2 scoring engine on all records
    4. Returns a complete analytics dashboard payload

    The response mirrors what the main LaneShift website shows for the
    Bengaluru BTP dataset — but computed from YOUR uploaded data.
    """
    ct = (file.content_type or "").lower()
    allowed_types = ("text/csv", "application/csv", "application/vnd.ms-excel",
                     "text/plain", "application/octet-stream",
                     "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    # Also allow by filename if content-type is generic
    fname = (file.filename or "").lower()
    is_csv   = fname.endswith(".csv") or "csv" in ct
    is_excel = fname.endswith((".xlsx", ".xls")) or "excel" in ct or "spreadsheet" in ct

    if not (is_csv or is_excel):
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type. Upload a CSV or Excel (.xlsx) file. Got: {ct}"
        )

    contents = await file.read()
    if len(contents) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"File too large ({len(contents)//1024//1024} MB). Maximum 50 MB."
        )

    t0 = time.time()

    # ── Parse file ────────────────────────────────────────────────────────────
    try:
        if is_excel:
            df_raw = pd.read_excel(io.BytesIO(contents), engine="openpyxl")
        else:
            # Try UTF-8 first, fall back to latin-1
            try:
                df_raw = pd.read_csv(io.BytesIO(contents), low_memory=False)
            except UnicodeDecodeError:
                df_raw = pd.read_csv(io.BytesIO(contents), low_memory=False, encoding="latin-1")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not parse file: {e}")

    if df_raw.empty:
        raise HTTPException(status_code=400, detail="File is empty or has no data rows.")

    rows_raw = len(df_raw)

    # Replace string NULLs
    df_raw = df_raw.replace({"NULL": None, "null": None, "None": None, "nan": None, "": None})

    # ── Auto-detect columns ───────────────────────────────────────────────────
    col_map  = _detect_columns(list(df_raw.columns))
    warnings = []

    if not col_map.get("violation_type"):
        warnings.append(
            "No violation_type column detected — all records will be classified as UNKNOWN. "
            "Expected a column named: violation_type, violation, offence_type, etc."
        )

    # ── Normalise ─────────────────────────────────────────────────────────────
    df = _normalize_df(df_raw.copy(), col_map)

    # ── Write to violations_uploaded — NEVER touches foundation ──────────────
    batch_id   = str(uuid.uuid4())[:8].upper()
    load_warning = None
    db_rows = 0
    try:
        from database import get_engine, init_db, UploadedViolation
        import sqlalchemy

        engine = init_db(DB_PATH)   # creates violations_uploaded if missing

        # Prepare DF for DB write
        df_db = df.copy()
        df_db["violation_type"] = df_db["violation_type"].apply(json.dumps)
        df_db["offence_code"]   = df_db["offence_code"].apply(json.dumps)

        # Deduplicate on id within this upload
        before_dedup = len(df_db)
        if "id" in df_db.columns:
            df_db = df_db.drop_duplicates(subset=["id"], keep="last")
        dupes_removed = before_dedup - len(df_db)
        if dupes_removed > 0:
            warnings.append(f"{dupes_removed:,} duplicate IDs removed.")

        # Add batch metadata columns
        df_db["upload_batch_id"]  = batch_id
        df_db["upload_timestamp"] = datetime.utcnow()
        df_db["source_filename"]  = file.filename or "upload.csv"

        # Keep only columns that exist in UploadedViolation
        model_cols = [c.key for c in sqlalchemy.inspect(UploadedViolation).columns]
        df_db = df_db[[c for c in df_db.columns if c in model_cols]]

        # Append to violations_uploaded — does NOT affect violations_foundation
        df_db.to_sql("violations_uploaded", engine, if_exists="append",
                     index=False, chunksize=5000, method="multi")
        db_rows = len(df_db)

    except Exception as e:
        err_str = str(e)
        load_warning = err_str[:120] + ("…" if len(err_str) > 120 else "")
        logger.warning("Upload DB write failed: %s", e)

    # ── Score in-memory from uploaded DF (never touches foundation scores) ────
    scores_computed = 0
    scoring_error   = None
    try:
        from scoring import (
            compute_congestion_cost_score,
            build_hourly_weight_lookup,
            build_junction_density_lookup,
        )
        # Build lookups from the FOUNDATION data (gives meaningful scores)
        hourly_lookup   = build_hourly_weight_lookup(DB_PATH)
        junction_lookup = build_junction_density_lookup(DB_PATH)

        def _score_row(row):
            try:
                codes = json.loads(row.get("offence_code") or "[]") if isinstance(row.get("offence_code"), str) else (row.get("offence_code") or [])
                vdict = {
                    "hour_ist":          row.get("hour_ist") or 10,
                    "junction_name":     row.get("junction_name") or "No Junction",
                    "is_named_junction": bool(row.get("is_named_junction")),
                    "offence_code":      codes if codes else [112],
                    "violation_count":   int(row.get("violation_count") or 1),
                }
                return compute_congestion_cost_score(vdict, junction_lookup, hourly_lookup)
            except Exception:
                return None

        df["congestion_cost_score"] = df.apply(_score_row, axis=1)
        scores_computed = int(df["congestion_cost_score"].notna().sum())
    except Exception as e:
        scoring_error = str(e)[:120]
        logger.warning("In-memory scoring failed: %s", e)

    # ── Build analytics from the uploaded DF (foundation is untouched) ────────
    analytics = _build_analytics(df)
    elapsed = round(time.time() - t0, 2)

    # ── Dispatch queue from uploaded data scores ──────────────────────────────
    # Build a lightweight top-junction list from the uploaded DF itself
    dispatch_queue = []
    if scores_computed > 0 and "junction_name" in df.columns:
        try:
            junc_df = df[
                df["junction_name"].notna() &
                (df["junction_name"] != "No Junction") &
                df["congestion_cost_score"].notna()
            ]
            if not junc_df.empty:
                jq = (
                    junc_df.groupby("junction_name")
                    .agg(
                        agg_score=("congestion_cost_score", "sum"),
                        count=("congestion_cost_score", "count"),
                        station=("police_station", lambda x: x.mode()[0] if len(x) else "Unknown"),
                    )
                    .reset_index()
                    .sort_values("agg_score", ascending=False)
                    .head(10)
                )
                for rank, (_, row) in enumerate(jq.iterrows(), 1):
                    score = int(row["agg_score"])
                    dispatch_queue.append({
                        "rank": rank,
                        "location_name": row["junction_name"],
                        "police_station_jurisdiction": row["station"],
                        "aggregate_congestion_score": score,
                        "violation_count": int(row["count"]),
                        "recommended_action": (
                            "Dispatch immediately" if score > 50000
                            else "Route on standard patrol" if score > 10000
                            else "Monitor"
                        ),
                    })
        except Exception as e:
            logger.warning("Dispatch queue build failed: %s", e)

    return {
        "upload_received":           True,
        "filename":                  file.filename or "upload.csv",
        "file_size_kb":              round(len(contents) / 1024, 1),
        "processing_time_seconds":   elapsed,
        "upload_batch_id":           batch_id,

        "load_summary": {
            "rows_in_file":       rows_raw,
            "rows_saved_to_batch": db_rows,
            "columns_detected":   {k: v for k, v in col_map.items() if v},
            "columns_missing":    [k for k, v in col_map.items() if not v],
            "warnings":           warnings + ([load_warning] if load_warning else []),
            "scores_computed":    scores_computed,
            "scoring_error":      scoring_error,
        },

        **analytics,
        "dispatch_queue": dispatch_queue,
    }
