"""
LaneShift — Number Plate OCR
==============================
Extracts number plate text from vehicle bounding-box crops
using EasyOCR (no Tesseract install required).

Strategy:
  1. For each vehicle box detected by YOLO, crop the bottom-third
     of the bounding box (where plates typically sit on Indian vehicles).
  2. Preprocess the crop: upscale, sharpen, convert to grayscale.
  3. Run EasyOCR and filter results by the Indian plate regex pattern
     (2 letters + 2 digits + 1-2 letters + 4 digits, with optional spaces/hyphens).
  4. Return the best candidate per vehicle box.

Falls back gracefully: if OCR finds nothing matching a plate pattern,
returns None for that vehicle (does not invent plate text).
"""

import io
import logging
import re
import os
from typing import List, Optional, Tuple

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Indian number plate regex ────────────────────────────────────────────────
# Covers formats: TN 04 AC 3029 / KA 01 AB 1234 / MH02AA1234 etc.
_PLATE_RE = re.compile(
    r'\b([A-Z]{2}[\s\-]?\d{2}[\s\-]?[A-Z]{1,3}[\s\-]?\d{4})\b',
    re.IGNORECASE,
)

# ── EasyOCR reader singleton ─────────────────────────────────────────────────
_ocr_reader = None

def _get_ocr_reader():
    global _ocr_reader
    if _ocr_reader is None:
        import easyocr
        logger.info("Loading EasyOCR model (English)…")
        # gpu=False ensures it runs on CPU without CUDA
        _ocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)
        logger.info("EasyOCR loaded")
    return _ocr_reader


def _preprocess_crop(crop_bgr: np.ndarray) -> np.ndarray:
    """
    Upscale and sharpen a small vehicle crop so OCR has enough pixels to work with.
    Returns a BGR image ready for EasyOCR.
    """
    h, w = crop_bgr.shape[:2]
    # Upscale to at least 200px tall for OCR legibility
    scale = max(1.0, 200.0 / max(h, 1))
    if scale > 1.0:
        new_w = int(w * scale)
        new_h = int(h * scale)
        crop_bgr = cv2.resize(crop_bgr, (new_w, new_h), interpolation=cv2.INTER_CUBIC)

    # Sharpen
    kernel = np.array([[0, -1, 0], [-1, 5, -1], [0, -1, 0]], dtype=np.float32)
    crop_bgr = cv2.filter2D(crop_bgr, -1, kernel)
    return crop_bgr


def _extract_plate_from_crop(crop_bgr: np.ndarray, reader) -> Optional[str]:
    """
    Run OCR on a vehicle crop and return the best plate match, or None.
    """
    try:
        processed = _preprocess_crop(crop_bgr)
        # EasyOCR expects RGB or file path
        crop_rgb = cv2.cvtColor(processed, cv2.COLOR_BGR2RGB)
        results  = reader.readtext(crop_rgb, detail=1, paragraph=False)

        candidates: List[Tuple[float, str]] = []
        for (_, text, conf) in results:
            cleaned = text.upper().replace(" ", "").replace("-", "")
            # Try matching full plate in one OCR chunk
            m = _PLATE_RE.search(text.upper())
            if m:
                plate = re.sub(r'[\s\-]', '', m.group(1)).upper()
                candidates.append((conf, plate))

        if candidates:
            # Return highest-confidence match
            candidates.sort(key=lambda x: -x[0])
            return candidates[0][1]

    except Exception as e:
        logger.debug("OCR crop failed: %s", e)

    return None


def read_plates_from_vehicles(
    image_bytes: bytes,
    vehicle_boxes: List[dict],
) -> List[Optional[str]]:
    """
    For each vehicle bounding box, attempt to read the number plate.

    Args:
        image_bytes:   Raw image bytes (JPEG/PNG)
        vehicle_boxes: List of dicts with keys x1, y1, x2, y2 (pixel coords)

    Returns:
        List of plate strings (or None) in the same order as vehicle_boxes.
    """
    if not vehicle_boxes:
        return []

    try:
        reader = _get_ocr_reader()
    except Exception as e:
        logger.warning("OCR reader unavailable: %s", e)
        return [None] * len(vehicle_boxes)

    # Decode image once
    img_array = np.frombuffer(image_bytes, np.uint8)
    img_bgr   = cv2.imdecode(img_array, cv2.IMREAD_COLOR)
    if img_bgr is None:
        return [None] * len(vehicle_boxes)

    img_h, img_w = img_bgr.shape[:2]
    plates: List[Optional[str]] = []

    for box in vehicle_boxes:
        x1 = max(0, int(box["x1"]))
        y1 = max(0, int(box["y1"]))
        x2 = min(img_w, int(box["x2"]))
        y2 = min(img_h, int(box["y2"]))

        if x2 <= x1 or y2 <= y1:
            plates.append(None)
            continue

        # Crop the full vehicle box
        vehicle_crop = img_bgr[y1:y2, x1:x2]

        # Focus on the bottom 40% — that's where plates are on most Indian vehicles
        crop_h = vehicle_crop.shape[0]
        plate_region_y = max(0, int(crop_h * 0.55))
        plate_crop = vehicle_crop[plate_region_y:, :]

        plate = None
        # Try plate region first, then full crop as fallback
        if plate_crop.size > 0:
            plate = _extract_plate_from_crop(plate_crop, reader)
        if plate is None and vehicle_crop.size > 0:
            plate = _extract_plate_from_crop(vehicle_crop, reader)

        plates.append(plate)

    return plates


def warmup_ocr():
    """Pre-load the EasyOCR model at startup."""
    try:
        _get_ocr_reader()
        logger.info("OCR model warmed up")
    except Exception as e:
        logger.warning("OCR warmup failed (non-fatal): %s", e)
