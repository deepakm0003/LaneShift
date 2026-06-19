"""
LaneShift — CV Detection Endpoint
====================================
POST /api/detect/simulate

Detection pipeline:
  1. Accept uploaded image (JPG/PNG) or video (MP4/MOV)
  2. For images: run YOLOv8n to detect vehicles and scene context
  3. Infer violation type from spatial analysis of detections
  4. Run the REAL Module 2 scoring engine on the detected inputs
  5. Return full result with detection evidence

For videos / when YOLO fails: falls back to statistical sampling
using real probability distributions from the 298,450-record dataset.
The fallback is clearly labeled in the response.

Every response includes:
  - detection_method: "yolov8_cv" | "statistical_fallback"
  - disclosure: honest explanation of what was and wasn't analyzed
  - production_note: what this would look like in production
"""

import io
import random
import logging
from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, File, HTTPException, UploadFile
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

router = APIRouter(prefix="/api/detect", tags=["detection"])

# ── File constraints ──────────────────────────────────────────────────────────
ALLOWED_MIME = ("image/jpeg", "image/png", "video/mp4", "video/quicktime")
MAX_BYTES    = 100 * 1024 * 1024   # 100 MB — raised to support 30 MB+ video files

# ── Statistical fallback distributions (from real dataset) ───────────────────
PRIMARY_VIOLATION_WEIGHTS = {
    "WRONG PARKING":                            49.42,
    "NO PARKING":                               43.10,
    "PARKING IN A MAIN ROAD":                    5.72,
    "PARKING ON FOOTPATH":                       0.82,
    "DEFECTIVE NUMBER PLATE":                    0.27,
    "PARKING NEAR ROAD CROSSING":                0.22,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC":   0.20,
    "DOUBLE PARKING":                            0.11,
    "PARKING OTHER THAN BUS STOP":               0.07,
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 0.04,
}

VEHICLE_TYPE_WEIGHTS = {
    "SCOOTER":        31.78,
    "CAR":            29.78,
    "MOTOR CYCLE":    13.67,
    "PASSENGER AUTO": 12.67,
    "MAXI-CAB":        3.81,
    "LGV":             2.77,
    "GOODS AUTO":      0.98,
    "MOPED":           0.74,
}

JUNCTION_TYPE_WEIGHTS = {
    "named_junction":       49.55,
    "no_junction_midblock": 50.45,
}

TOP_20_JUNCTIONS: List[str] = [
    "BTP051 - Safina Plaza Junction",
    "BTP082 - KR Market Junction",
    "BTP040 - Elite Junction",
    "BTP044 - Sagar Theatre Junction",
    "BTP211 - Central Street Junction",
    "BTP058 - Subbanna Junction",
    "BTP027 - Modi Bridge Junction",
    "BTP020 - Hosahalli Metro Station",
    "BTP057 - Anand Rao Junction",
    "BTP080 - NR Road, SP Road Junction",
    "BTP045 - Danvanthri Road Junction",
    "BTP001 - 10th Cross, Dr. Rajkumar Road",
    "BTP083 - AS Char Street, Mysore Road",
    "BTP032 - Windsor Circle",
    "BTP016 - 5th Main Road, RPC Layout",
    "BTP070 - Cholurpalya Junction, Magadi Road",
    "BTP042 - Minsk Square Junction (CTO)",
    "BTP038 - Mysore Bank Junction",
    "BTP023 - Mahalaxmi Layout Entrance",
    "BTP108 - Tagore Park Junction",
]

POLICE_STATIONS: List[str] = [
    "Upparpet", "Shivajinagar", "Malleshwaram", "HAL Old Airport",
    "City Market", "Vijayanagara", "Rajajinagar", "Kodigehalli",
    "Magadi Road", "Jeevanbheemanagar", "Bellandur", "HSR Layout",
    "Basavanagudi", "Wilson Garden", "Whitefield",
]

VIOLATION_TO_OFFENCE_CODE = {
    "WRONG PARKING":                             112,
    "NO PARKING":                                113,
    "PARKING IN A MAIN ROAD":                    107,
    "PARKING ON FOOTPATH":                       105,
    "DEFECTIVE NUMBER PLATE":                    116,
    "PARKING NEAR ROAD CROSSING":                104,
    "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC":   111,
    "DOUBLE PARKING":                            109,
    "PARKING OTHER THAN BUS STOP":               139,
    "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS": 106,
}

_HOURS     = list(range(24))
_HOUR_WGTS = [0,0,0,0,1,2,5,12,18,20,20,18,16,14,10,8,6,5,4,3,2,1,1,0]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _weighted_choice(d: dict) -> str:
    return random.choices(list(d.keys()), weights=list(d.values()), k=1)[0]

def _sample_location(junction_type: str):
    if junction_type == "named_junction":
        jn = random.choice(TOP_20_JUNCTIONS)
        return jn, jn, True
    station = random.choice(POLICE_STATIONS)
    return f"Mid-block segment, {station} jurisdiction", "No Junction", False

def _sample_hour() -> int:
    return random.choices(_HOURS, weights=_HOUR_WGTS, k=1)[0]


# ── Scoring lookup (lazy, built once) ─────────────────────────────────────────
_hourly_lookup   = None
_junction_lookup = None

def _get_lookups():
    global _hourly_lookup, _junction_lookup
    if _hourly_lookup is None:
        _hourly_lookup   = build_hourly_weight_lookup(DB_PATH)
        _junction_lookup = build_junction_density_lookup(DB_PATH)
    return _hourly_lookup, _junction_lookup


# ── Score a violation dict ─────────────────────────────────────────────────────

def _score(violation_type: str, vehicle_type: str,
           junction_name: str, is_named: bool, hour: int):
    hourly, junction = _get_lookups()
    offence_code = VIOLATION_TO_OFFENCE_CODE.get(violation_type, 112)
    severity     = OFFENCE_CODE_SEVERITY.get(offence_code, DEFAULT_SEVERITY)
    vdict = {
        "hour_ist":          hour,
        "junction_name":     junction_name,
        "is_named_junction": is_named,
        "offence_code":      [offence_code],
        "violation_count":   1,
    }
    score    = compute_congestion_cost_score(vdict, junction, hourly)
    time_w   = hourly.get(hour, 50)
    junc_w   = junction.get(junction_name, 40) if is_named else junction.get("no_junction", 40)
    sev_w    = (severity / 10.0) * 100
    return score, offence_code, time_w, junc_w, sev_w


# ── Video detection (frame sampling + YOLO) ──────────────────────────────────

def _run_video_detection(video_bytes: bytes, max_frames: int = 12) -> dict:
    """
    Extract up to max_frames evenly-spaced frames from a video,
    run YOLOv8n on each, and aggregate vehicle detections across all frames.

    Returns a cv_result dict in the same shape as run_cv_detection() so the
    rest of the endpoint can handle video and image results identically.
    """
    import tempfile, os, io
    import cv2
    import numpy as np
    from PIL import Image

    # Write video bytes to a temp file (OpenCV needs a file path)
    suffix = ".mp4"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(video_bytes)
        tmp_path = tmp.name

    try:
        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise RuntimeError("Could not open video file")

        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps          = cap.get(cv2.CAP_PROP_FPS) or 25
        duration_s   = total_frames / fps if fps else 0

        if total_frames <= 0:
            raise RuntimeError("Video has no readable frames")

        # Pick evenly-spaced frame indices, skipping first/last 5%
        start = int(total_frames * 0.05)
        end   = int(total_frames * 0.95)
        indices = [
            int(start + i * (end - start) / (max_frames - 1))
            for i in range(max_frames)
        ] if max_frames > 1 else [total_frames // 2]
        indices = sorted(set(max(0, min(i, total_frames - 1)) for i in indices))

        frames_bgr = []
        for idx in indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if ret and frame is not None:
                frames_bgr.append(frame)
        cap.release()

        if not frames_bgr:
            raise RuntimeError("Could not read any frames from video")

        # Run YOLO on each sampled frame
        from cv_detection import _get_yolo_model, VEHICLE_CLASSES, ROAD_CONTEXT_CLASSES

        model = _get_yolo_model()
        VEHICLE_IDS = set(VEHICLE_CLASSES.keys())
        CONTEXT_IDS = set(ROAD_CONTEXT_CLASSES.keys())

        all_vehicle_counts = []
        best_frame_result  = None   # frame with most vehicles detected
        all_plates         = []
        all_vehicle_details = []
        best_annotated_b64 = ""

        for frame_bgr in frames_bgr:
            # Convert BGR → RGB PIL image
            frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
            pil_img   = Image.fromarray(frame_rgb)

            results = model(pil_img, conf=0.25, iou=0.65, verbose=False)
            if not results:
                continue
            r = results[0]

            frame_vehicles = []
            frame_context  = []
            frame_all      = []

            if r.boxes is not None:
                img_h, img_w = frame_bgr.shape[:2]
                for box in r.boxes:
                    cls_id   = int(box.cls[0].item())
                    conf     = float(box.conf[0].item())
                    x1,y1,x2,y2 = [float(v) for v in box.xyxy[0].tolist()]
                    cls_name = model.names.get(cls_id, "unknown")
                    det = {
                        "class_id":   cls_id,
                        "class_name": cls_name,
                        "confidence": round(conf, 3),
                        "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                        "bbox_pct": {
                            "x1": round(x1/img_w, 3), "y1": round(y1/img_h, 3),
                            "x2": round(x2/img_w, 3), "y2": round(y2/img_h, 3),
                        }
                    }
                    frame_all.append(det)
                    if cls_id in VEHICLE_IDS:
                        frame_vehicles.append(det)
                    elif cls_id in CONTEXT_IDS:
                        frame_context.append(det)

            all_vehicle_counts.append(len(frame_vehicles))

            if best_frame_result is None or len(frame_vehicles) > len(best_frame_result["vehicles"]):
                best_frame_result = {
                    "vehicles": frame_vehicles,
                    "context":  frame_context,
                    "all":      frame_all,
                    "img_w":    frame_bgr.shape[1],
                    "img_h":    frame_bgr.shape[0],
                }

        if best_frame_result is None or not any(c > 0 for c in all_vehicle_counts):
            # No vehicles found in any frame
            return {
                "vehicle_detected":   False,
                "vehicle_count":      0,
                "vehicle_type":       "CAR",
                "vehicle_confidence": 0.0,
                "violation_type":     "WRONG PARKING",
                "violation_confidence": 0.0,
                "inference_reasoning": (
                    f"Video processed: {len(frames_bgr)} frames sampled from "
                    f"{duration_s:.0f}s video. No vehicles detected in any frame."
                ),
                "image_size":         {"width": 0, "height": 0},
                "annotated_image_b64": "",
                "detected_plates":    [],
                "vehicle_details":    [],
                "all_detections":     [],
                "context_signals":    {"traffic_signal_detected": False, "person_count": 0},
                "frames_sampled":     len(frames_bgr),
                "video_duration_s":   round(duration_s, 1),
                "max_vehicles_frame": 0,
            }

        # Use best frame for spatial analysis and annotation
        vehicles   = best_frame_result["vehicles"]
        context    = best_frame_result["context"]
        img_w      = best_frame_result["img_w"]
        img_h      = best_frame_result["img_h"]
        max_count  = max(all_vehicle_counts)
        avg_count  = round(sum(all_vehicle_counts) / len(all_vehicle_counts), 1)

        vehicles.sort(key=lambda d: d["confidence"], reverse=True)

        # Infer violation from best frame
        from cv_detection import (
            _infer_violation, _get_vehicle_type_label,
            VEHICLE_CLASSES as VC, _draw_annotated
        )
        violation_type, reasoning, violation_conf = _infer_violation(
            vehicles, context, img_w, img_h
        )

        # Plate OCR on best frame
        plates = []
        try:
            # Encode best frame as JPEG bytes for plate reader
            _, buf = cv2.imencode(".jpg", frames_bgr[all_vehicle_counts.index(max_count)],
                                  [cv2.IMWRITE_JPEG_QUALITY, 90])
            best_bytes = buf.tobytes()
            from plate_reader import read_plates_from_vehicles
            plates = read_plates_from_vehicles(best_bytes, vehicles)
        except Exception:
            plates = [None] * len(vehicles)
        while len(plates) < len(vehicles):
            plates.append(None)

        detected_plates = list(dict.fromkeys(p for p in plates if p))

        # Annotate best frame
        try:
            _, buf = cv2.imencode(".jpg", frames_bgr[all_vehicle_counts.index(max_count)],
                                  [cv2.IMWRITE_JPEG_QUALITY, 90])
            best_bytes = buf.tobytes()
            best_annotated_b64 = _draw_annotated(best_bytes, vehicles, plates)
        except Exception:
            best_annotated_b64 = ""

        primary_veh  = vehicles[0]
        vehicle_type = _get_vehicle_type_label(primary_veh["class_id"], primary_veh["class_name"])

        return {
            "vehicle_detected":   True,
            "vehicle_count":      max_count,
            "vehicle_type":       vehicle_type,
            "vehicle_confidence": primary_veh["confidence"],
            "violation_type":     violation_type,
            "violation_confidence": violation_conf,
            "inference_reasoning": (
                f"Video processed: {len(frames_bgr)} frames sampled from "
                f"{duration_s:.0f}s video. "
                f"Peak: {max_count} vehicle(s) detected in best frame, "
                f"avg {avg_count} per frame. {reasoning}"
            ),
            "image_size":         {"width": img_w, "height": img_h},
            "annotated_image_b64": best_annotated_b64,
            "detected_plates":    detected_plates,
            "vehicle_details":    [
                {
                    "class":      VC.get(v["class_id"], "VEHICLE"),
                    "class_id":   v["class_id"],
                    "confidence": v["confidence"],
                    "bbox_pct":   v["bbox_pct"],
                    "plate":      plates[i] if i < len(plates) else None,
                }
                for i, v in enumerate(vehicles)
            ],
            "all_detections":     [
                {"class": d["class_name"], "confidence": d["confidence"], "bbox_pct": d["bbox_pct"]}
                for d in best_frame_result["all"][:10]
            ],
            "context_signals": {
                "traffic_signal_detected": any(o["class_id"] in [9,11] for o in context),
                "person_count": sum(1 for o in context if o["class_id"] == 0),
            },
            "frames_sampled":    len(frames_bgr),
            "video_duration_s":  round(duration_s, 1),
            "max_vehicles_frame": max_count,
        }
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass


# ── Endpoint ──────────────────────────────────────────────────────────────────

@router.post(
    "/simulate",
    summary="CV-based violation detection from an uploaded image",
)
async def simulate_detection(file: UploadFile = File(...)):

    # ── Validate MIME ─────────────────────────────────────────────────────────
    ct = (file.content_type or "").lower()
    if not any(ct.startswith(p) for p in ALLOWED_MIME):
        raise HTTPException(status_code=400,
            detail=f"Unsupported type: '{ct}'. Accepted: jpg, png, mp4, mov.")

    contents = await file.read()

    # ── Validate size ─────────────────────────────────────────────────────────
    if len(contents) > MAX_BYTES:
        raise HTTPException(status_code=400,
            detail=f"File too large ({len(contents)//1024//1024} MB). Max 20 MB.")

    # ── Validate image magic bytes ────────────────────────────────────────────
    is_image = ct.startswith("image/")
    is_video = ct.startswith("video/") or ct in ("video/mp4", "video/quicktime")

    if is_image:
        is_jpg = contents[:2] == b'\xff\xd8'
        is_png = contents[:4] == b'\x89PNG'
        if not (is_jpg or is_png):
            raise HTTPException(status_code=400,
                detail="File content does not match declared image type.")

    # ── Real CV detection: images run YOLO directly, videos extract frames ────
    cv_result   = None
    cv_error    = None

    if is_image:
        try:
            from cv_detection import run_cv_detection
            cv_result = run_cv_detection(contents)
            logger.info("CV detection OK: %s vehicles, violation=%s",
                        cv_result["vehicle_count"], cv_result["violation_type"])
        except Exception as e:
            cv_error = str(e)
            logger.warning("CV detection failed, falling back: %s", e)

    elif is_video:
        try:
            cv_result = _run_video_detection(contents)
            logger.info("Video CV detection OK: %s vehicles across frames",
                        cv_result["vehicle_count"])
        except Exception as e:
            cv_error = str(e)
            logger.warning("Video detection failed, falling back: %s", e)

    # ── Build final result ────────────────────────────────────────────────────
    if cv_result and cv_result["vehicle_detected"]:
        # ── REAL CV PATH ─────────────────────────────────────────────────────
        detection_method  = "yolov8_cv"
        violation_type    = cv_result["violation_type"]
        vehicle_type      = cv_result["vehicle_type"]
        hour              = _sample_hour()   # still sampled (no GPS timestamp)
        junc_type         = _weighted_choice(JUNCTION_TYPE_WEIGHTS)
        location, jname, is_named = _sample_location(junc_type)
        score, offence_code, time_w, junc_w, sev_w = _score(
            violation_type, vehicle_type, jname, is_named, hour)

        detection_info = {
            "violation_type":       violation_type,
            "vehicle_type":         vehicle_type,
            "vehicle_count":        cv_result["vehicle_count"],
            "detection_confidence": round(cv_result["violation_confidence"] * 100, 1),
            "inference_reasoning":  cv_result["inference_reasoning"],
            "location":             location,
            "junction_name":        jname,
            "hour_ist":             hour,
            "offence_code":         offence_code,
            "detected_objects":     cv_result["all_detections"],
            "vehicle_details":      cv_result.get("vehicle_details", []),
            "detected_plates":      cv_result.get("detected_plates", []),
            "annotated_image_b64":  cv_result.get("annotated_image_b64", ""),
            "context_signals":      cv_result["context_signals"],
            "image_size":           cv_result["image_size"],
            "frames_sampled":       cv_result.get("frames_sampled"),
            "video_duration_s":     cv_result.get("video_duration_s"),
            "confidence_note": (
                f"YOLOv8n detected {cv_result['vehicle_count']} vehicle(s) "
                f"in the image. Violation type inferred from spatial analysis "
                f"({round(cv_result['violation_confidence']*100)}% confidence). "
                f"Hour and location sampled — no GPS metadata available."
            ),
        }

        disclosure = (
            "Vehicle detection was performed by YOLOv8n (COCO pre-trained) running "
            "on the actual pixel content of your uploaded image. "
            "Violation type was inferred using spatial heuristics applied to the "
            "detected bounding boxes — not a fine-tuned violation classifier "
            "(no labelled parking-violation image dataset was available). "
            "Time of day and location are sampled from the real dataset distribution "
            "since no GPS or timestamp metadata was present in the upload. "
            "The congestion-cost score is computed by the real Module 2 scoring engine."
        )

    else:
        # ── STATISTICAL FALLBACK PATH ─────────────────────────────────────────
        detection_method = "statistical_fallback"
        violation_type   = _weighted_choice(PRIMARY_VIOLATION_WEIGHTS)
        vehicle_type     = _weighted_choice(VEHICLE_TYPE_WEIGHTS)
        hour             = _sample_hour()
        junc_type        = _weighted_choice(JUNCTION_TYPE_WEIGHTS)
        location, jname, is_named = _sample_location(junc_type)
        score, offence_code, time_w, junc_w, sev_w = _score(
            violation_type, vehicle_type, jname, is_named, hour)

        fallback_reason = (
            "No vehicle detected in image by YOLOv8n" if (cv_result and not cv_result["vehicle_detected"])
            else f"CV unavailable ({cv_error})" if cv_error
            else "Video upload — no vehicles detected in sampled frames"
        )

        detection_info = {
            "violation_type":       violation_type,
            "vehicle_type":         vehicle_type,
            "vehicle_count":        0,
            "detection_confidence": 0.0,
            "inference_reasoning":  fallback_reason,
            "location":             location,
            "junction_name":        jname,
            "hour_ist":             hour,
            "offence_code":         offence_code,
            "detected_objects":     cv_result["all_detections"] if cv_result else [],
            "vehicle_details":      [],
            "detected_plates":      [],
            "annotated_image_b64":  "",
            "context_signals":      cv_result["context_signals"] if cv_result else {},
            "image_size":           cv_result["image_size"] if cv_result else {},
            "confidence_note": (
                f"Statistical fallback used: {fallback_reason}. "
                "Violation type sampled from real dataset distribution (not pixel analysis)."
            ),
        }

        disclosure = (
            "No vehicle was detected in the uploaded image by YOLOv8n, or CV was "
            "unavailable. Results are sampled using the REAL statistical distribution "
            "of violation types from Bengaluru Traffic Police's 298,450-record dataset. "
            "The congestion-cost score is computed by the real Module 2 scoring engine."
        )

    return {
        "upload_received":    True,
        "filename":           file.filename or "upload",
        "file_size_kb":       round(len(contents) / 1024, 1),
        "content_type":       ct,
        "detection_method":   detection_method,

        "simulated_detection": detection_info,

        "congestion_cost_score": score,
        "score_breakdown": {
            "time_of_day_weight":      round(time_w, 2),
            "junction_density_weight": round(junc_w, 2),
            "severity_weight":         round(sev_w, 2),
            "stacking_multiplier":     1.0,
            "methodology": (
                "score = (time×0.35 + junction×0.30 + severity×0.25 + "
                "stacking×0.10) × stacking_multiplier × 10, scaled 0–1000"
            ),
        },

        "disclosure":       disclosure,
        "production_note": (
            "In a deployed system, GPS coordinates from camera metadata would "
            "replace sampled location, and a fine-tuned violation classifier "
            "trained on labelled Bengaluru traffic images would replace the "
            "spatial heuristics. The scoring engine shown here is production-ready unchanged."
        ),
    }
