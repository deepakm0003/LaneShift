"""
LaneShift — Module 5: Live Continuous Monitor (WebSocket)
===========================================================
WebSocket endpoint /ws/live-monitor

Accepts a continuous stream of base64-encoded JPEG frames from the frontend.
Runs YOLOv8n on each frame (real CV, same model as the single-image endpoint).
Tracks stationary vehicles across frames using dwell-time detection.

WHAT IS REAL:
  - YOLOv8n detects vehicles/people in every incoming frame
  - Stationary-vehicle detection: if a vehicle's bounding-box centroid stays
    within a 10% radius across 10+ consecutive frames (~5-10 seconds), it is
    flagged as "STATIONARY_VEHICLE_DETECTED" — a real, standard CV technique

WHAT IS SAMPLED:
  - When a stationary vehicle is flagged, a sampled scenario context
    (violation type + congestion score) is generated using real dataset
    distributions — EXACTLY as in the single-image endpoint, clearly labeled

NO identity resolution at any point. Output: bounding boxes, object classes,
stationary flag, sampled scenario context. Nothing more.
"""

import asyncio
import base64
import io
import json
import logging
import random
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse

from scoring import (
    compute_congestion_cost_score,
    build_hourly_weight_lookup,
    build_junction_density_lookup,
)
from severity_weights import OFFENCE_CODE_SEVERITY, DEFAULT_SEVERITY

logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH      = str(PROJECT_ROOT / "violations.db")

router = APIRouter(tags=["live_monitor"])

# ── Constants ──────────────────────────────────────────────────────────────────
STATIONARY_FRAME_THRESHOLD = 10    # frames before declaring stationary
STATIONARY_RADIUS_FRACTION = 0.08  # centroid must stay within 8% of frame dim
MAX_FRAME_SIZE_BYTES        = 2 * 1024 * 1024  # 2MB per frame

# ── Statistical fallback distributions ────────────────────────────────────────
PRIMARY_VIOLATION_WEIGHTS = {
    "WRONG PARKING": 49.42, "NO PARKING": 43.10,
    "PARKING IN A MAIN ROAD": 5.72, "PARKING ON FOOTPATH": 0.82,
    "DEFECTIVE NUMBER PLATE": 0.27, "PARKING NEAR ROAD CROSSING": 0.22,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 0.20,
    "DOUBLE PARKING": 0.11, "PARKING OTHER THAN BUS STOP": 0.07,
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 0.04,
}

VIOLATION_TO_OFFENCE = {
    "WRONG PARKING": 112, "NO PARKING": 113, "PARKING IN A MAIN ROAD": 107,
    "PARKING ON FOOTPATH": 105, "DEFECTIVE NUMBER PLATE": 116,
    "PARKING NEAR ROAD CROSSING": 104, "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC": 111,
    "DOUBLE PARKING": 109, "PARKING OTHER THAN BUS STOP": 139,
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 106,
}

TOP_JUNCTIONS = [
    "BTP051 - Safina Plaza Junction", "BTP082 - KR Market Junction",
    "BTP040 - Elite Junction", "BTP044 - Sagar Theatre Junction",
    "BTP027 - Modi Bridge Junction",
]
STATIONS = ["Upparpet", "Shivajinagar", "Malleshwaram", "City Market", "Rajajinagar"]
_HOURS      = list(range(24))
_HOUR_WGTS  = [0,0,0,0,1,2,5,12,18,20,20,18,16,14,10,8,6,5,4,3,2,1,1,0]

# ── Scoring lookups (lazy) ─────────────────────────────────────────────────────
_hourly_lkp   = None
_junction_lkp = None

def _get_lookups():
    global _hourly_lkp, _junction_lkp
    if _hourly_lkp is None:
        _hourly_lkp   = build_hourly_weight_lookup(DB_PATH)
        _junction_lkp = build_junction_density_lookup(DB_PATH)
    return _hourly_lkp, _junction_lkp


def _sample_scenario():
    """Build sampled scenario context identical to single-image endpoint."""
    vtype  = random.choices(list(PRIMARY_VIOLATION_WEIGHTS.keys()),
                             weights=list(PRIMARY_VIOLATION_WEIGHTS.values()), k=1)[0]
    hour   = random.choices(_HOURS, weights=_HOUR_WGTS, k=1)[0]
    is_jn  = random.random() < 0.4955
    if is_jn:
        jn  = random.choice(TOP_JUNCTIONS)
        loc = jn
    else:
        st  = random.choice(STATIONS)
        jn  = "No Junction"
        loc = f"Mid-block segment, {st} jurisdiction"

    offence  = VIOLATION_TO_OFFENCE.get(vtype, 112)
    severity = OFFENCE_CODE_SEVERITY.get(offence, DEFAULT_SEVERITY)
    hourly, junction = _get_lookups()

    vdict = {
        "hour_ist": hour, "junction_name": jn,
        "is_named_junction": is_jn, "offence_code": [offence], "violation_count": 1,
    }
    score  = compute_congestion_cost_score(vdict, junction, hourly)
    time_w = hourly.get(hour, 50)
    junc_w = junction.get(jn, 40) if is_jn else junction.get("no_junction", 40)
    sev_w  = (severity / 10.0) * 100

    return {
        "violation_type": vtype,
        "location": loc,
        "hour_ist": hour,
        "offence_code": offence,
        "congestion_cost_score": score,
        "score_breakdown": {
            "time_of_day_weight": round(time_w, 2),
            "junction_density_weight": round(junc_w, 2),
            "severity_weight": round(sev_w, 2),
            "stacking_multiplier": 1.0,
        },
        "confidence_note": (
            "SAMPLED — not derived from this frame's pixel content. "
            "Drawn from real dataset distributions (298,450 records). "
            "Shown for scoring demonstration only."
        ),
    }


# ── Per-connection state tracker ───────────────────────────────────────────────

class _VehicleTracker:
    """
    Tracks vehicle centroids across frames per WebSocket connection.
    Uses bounding-box centroid proximity to detect stationary vehicles.
    """
    def __init__(self):
        # {track_id: {"cx": float, "cy": float, "frames": int, "alerted": bool}}
        self.tracks: Dict[str, Dict] = {}
        self.frame_count = 0

    def update(self, detections: List[Dict], img_w: int, img_h: int) -> List[Dict]:
        """
        Match incoming detections to existing tracks by proximity.
        Returns list of stationary-vehicle alerts.
        """
        self.frame_count += 1
        alerts = []
        matched_ids = set()

        for det in detections:
            # Normalised centroid (0-1)
            cx = (det["x1"] + det["x2"]) / 2 / max(img_w, 1)
            cy = (det["y1"] + det["y2"]) / 2 / max(img_h, 1)

            # Find nearest existing track
            best_id, best_dist = None, float("inf")
            for tid, track in self.tracks.items():
                if tid in matched_ids:
                    continue
                dist = ((cx - track["cx"]) ** 2 + (cy - track["cy"]) ** 2) ** 0.5
                if dist < best_dist:
                    best_dist, best_id = dist, tid

            if best_id and best_dist < STATIONARY_RADIUS_FRACTION:
                # Update existing track
                self.tracks[best_id]["cx"] = cx
                self.tracks[best_id]["cy"] = cy
                self.tracks[best_id]["frames"] += 1
                matched_ids.add(best_id)
                track = self.tracks[best_id]
                if (track["frames"] >= STATIONARY_FRAME_THRESHOLD
                        and not track["alerted"]):
                    self.tracks[best_id]["alerted"] = True
                    alerts.append({
                        "track_id":      best_id,
                        "class":         det.get("class_name", "vehicle"),
                        "dwell_frames":  track["frames"],
                        "cx_norm":       round(cx, 3),
                        "cy_norm":       round(cy, 3),
                        "bbox_pct":      det.get("bbox_pct", {}),
                    })
            else:
                # New track
                new_id = f"T{self.frame_count:04d}_{len(self.tracks)}"
                self.tracks[new_id] = {
                    "cx": cx, "cy": cy, "frames": 1, "alerted": False,
                    "class": det.get("class_name", "vehicle"),
                }
                matched_ids.add(new_id)

        # Age out unmatched tracks
        for tid in list(self.tracks.keys()):
            if tid not in matched_ids:
                self.tracks[tid]["frames"] = max(0, self.tracks[tid]["frames"] - 2)
                if self.tracks[tid]["frames"] == 0:
                    del self.tracks[tid]

        return alerts


def _process_frame(frame_bytes: bytes, tracker: _VehicleTracker) -> Dict[str, Any]:
    """Run YOLO on one frame, update tracker, return structured result."""
    try:
        from cv_detection import _get_yolo_model, VEHICLE_CLASSES, ROAD_CONTEXT_CLASSES
        from PIL import Image
    except ImportError as e:
        return {"error": f"CV unavailable: {e}", "fallback": True}

    try:
        img     = Image.open(io.BytesIO(frame_bytes)).convert("RGB")
        img_w, img_h = img.size
        model   = _get_yolo_model()
        results = model(img, conf=0.3, iou=0.45, verbose=False)

        vehicle_dets = []
        all_dets     = []
        person_count = 0

        if results and results[0].boxes is not None:
            for box in results[0].boxes:
                cls_id = int(box.cls[0].item())
                conf   = float(box.conf[0].item())
                x1, y1, x2, y2 = [float(v) for v in box.xyxy[0].tolist()]
                name   = model.names.get(cls_id, "unknown")

                d = {
                    "class_id": cls_id, "class_name": name,
                    "confidence": round(conf, 3),
                    "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                    "bbox_pct": {
                        "x1": round(x1/img_w, 3), "y1": round(y1/img_h, 3),
                        "x2": round(x2/img_w, 3), "y2": round(y2/img_h, 3),
                    }
                }
                all_dets.append(d)
                if cls_id in VEHICLE_CLASSES:
                    vehicle_dets.append(d)
                if cls_id == 0:
                    person_count += 1

        # Update tracker
        stationary_alerts = tracker.update(vehicle_dets, img_w, img_h)

        # Build sampled scenario for each stationary alert
        enriched_alerts = []
        for alert in stationary_alerts:
            scenario = _sample_scenario()
            enriched_alerts.append({**alert, "sampled_scenario": scenario})

        return {
            "frame_timestamp":  time.time(),
            "image_size":       {"width": img_w, "height": img_h},
            "vehicle_count":    len(vehicle_dets),
            "person_count":     person_count,
            "objects_detected": [
                {"class": d["class_name"], "confidence": d["confidence"],
                 "bbox_pct": d["bbox_pct"]}
                for d in all_dets[:12]
            ],
            "stationary_alerts":    enriched_alerts,
            "tracker_active_tracks": len(tracker.tracks),
            "detection_method":     "yolov8_realtime",
            "disclosure": (
                "Vehicle detection is REAL (YOLOv8n on actual frame pixels). "
                "Stationary-vehicle flag uses real dwell-time detection. "
                "Violation type and score shown in any alert panel are SAMPLED "
                "from real dataset distributions — not detected from the frame."
            ),
        }

    except Exception as e:
        logger.warning("Frame processing error: %s", e)
        return {
            "frame_timestamp": time.time(),
            "vehicle_count": 0, "person_count": 0,
            "objects_detected": [], "stationary_alerts": [],
            "error": str(e), "detection_method": "error",
        }


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/ws/live-monitor")
async def live_monitor_ws(websocket: WebSocket):
    """
    WebSocket live monitor.

    Frontend sends JSON messages: {"frame": "<base64 JPEG>", "timestamp": <ms>}
    Backend responds with per-frame detection results.
    """
    await websocket.accept()
    tracker = _VehicleTracker()
    logger.info("Live monitor WebSocket connected")

    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=10.0)
            except asyncio.TimeoutError:
                await websocket.send_text(json.dumps({"heartbeat": True}))
                continue

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"error": "Invalid JSON"}))
                continue

            if msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            b64 = msg.get("frame", "")
            if not b64:
                await websocket.send_text(json.dumps({"error": "No frame data"}))
                continue

            try:
                frame_bytes = base64.b64decode(b64)
            except Exception:
                await websocket.send_text(json.dumps({"error": "Invalid base64"}))
                continue

            if len(frame_bytes) > MAX_FRAME_SIZE_BYTES:
                await websocket.send_text(json.dumps({"error": "Frame too large"}))
                continue

            result = await asyncio.get_event_loop().run_in_executor(
                None, _process_frame, frame_bytes, tracker
            )
            await websocket.send_text(json.dumps(result))

    except WebSocketDisconnect:
        logger.info("Live monitor WebSocket disconnected")
    except Exception as e:
        logger.warning("Live monitor error: %s", e)
        try:
            await websocket.send_text(json.dumps({"error": str(e)}))
        except Exception:
            pass
