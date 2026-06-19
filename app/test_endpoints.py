"""
LaneShift — Endpoint Tests
===========================
Run with: pytest test_endpoints.py -v
Requires the FastAPI app to be importable (dependencies installed).
Uses TestClient — no running server needed.
"""

import io
import pytest
from fastapi.testclient import TestClient

# Import the app
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))

from main import app

client = TestClient(app)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _make_jpeg_bytes() -> bytes:
    """Minimal valid JPEG (2×2 white pixels, SOI + EOI markers)."""
    return (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xdb\x00C\x00\x08\x06\x06\x07\x06\x05\x08\x07\x07\x07\t\t'
        b'\x08\n\x0c\x14\r\x0c\x0b\x0b\x0c\x19\x12\x13\x0f\x14\x1d\x1a'
        b'\x1f\x1e\x1d\x1a\x1c\x1c $.\' ",#\x1c\x1c(7),01444\x1f\'9=82<.342\x1e'
        b'\xff\xc0\x00\x0b\x08\x00\x02\x00\x02\x01\x01\x11\x00'
        b'\xff\xc4\x00\x1f\x00\x00\x01\x05\x01\x01\x01\x01\x01\x01\x00\x00'
        b'\x00\x00\x00\x00\x00\x00\x01\x02\x03\x04\x05\x06\x07\x08\t\n\x0b'
        b'\xff\xda\x00\x08\x01\x01\x00\x00?\x00\xfb\xd9'
    )


def _make_png_bytes() -> bytes:
    """Minimal valid 1×1 white PNG."""
    import zlib, struct
    def chunk(name, data):
        c = name + data
        return struct.pack('>I', len(data)) + c + struct.pack('>I', zlib.crc32(c) & 0xffffffff)

    ihdr  = struct.pack('>IIBBBBB', 1, 1, 8, 2, 0, 0, 0)
    raw   = b'\x00\xff\xff\xff'
    idat  = zlib.compress(raw)
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', idat)
        + chunk(b'IEND', b'')
    )


# ─────────────────────────────────────────────────────────────────────────────
# /api/detect/simulate
# ─────────────────────────────────────────────────────────────────────────────

class TestSimulatedDetection:

    def test_valid_jpeg_returns_200(self):
        """Valid JPEG upload returns HTTP 200."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("test.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
        assert resp.status_code == 200, resp.text

    def test_valid_png_returns_200(self):
        """Valid PNG upload returns HTTP 200."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("test.png", _make_png_bytes(), "image/png")},
        )
        assert resp.status_code == 200, resp.text

    def test_response_has_all_required_fields(self):
        """All required top-level fields are present and non-empty."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("test.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
        data = resp.json()

        assert data["upload_received"] is True
        assert data["filename"]

        # Simulated detection sub-object
        det = data["simulated_detection"]
        assert det["violation_type"]
        assert det["vehicle_type"]
        assert det["location"]
        assert det["confidence_note"]
        assert "SIMULATED" in det["confidence_note"]

        # Score
        assert isinstance(data["congestion_cost_score"], int)

        # Score breakdown
        bd = data["score_breakdown"]
        assert "time_of_day_weight"      in bd
        assert "junction_density_weight" in bd
        assert "severity_weight"         in bd
        assert "stacking_multiplier"     in bd

        # Mandatory disclosure fields — never empty
        assert data["disclosure"]
        assert len(data["disclosure"]) > 50
        assert data["production_note"]
        assert len(data["production_note"]) > 20

    def test_score_is_in_valid_range(self):
        """congestion_cost_score is a real integer 0–1000 (proves scoring engine ran)."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("photo.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
        score = resp.json()["congestion_cost_score"]
        assert isinstance(score, int), f"Score should be int, got {type(score)}"
        assert 0 <= score <= 1000, f"Score {score} is outside valid 0–1000 range"

    def test_score_is_not_hardcoded(self):
        """Run 10 times — scores must not all be identical (proves real engine, not hardcode)."""
        scores = set()
        for _ in range(10):
            resp = client.post(
                "/api/detect/simulate",
                files={"file": ("photo.jpg", _make_jpeg_bytes(), "image/jpeg")},
            )
            assert resp.status_code == 200
            scores.add(resp.json()["congestion_cost_score"])
        # With random sampling across hours/junctions/violations, expect > 1 unique score
        assert len(scores) > 1, f"All 10 scores were identical ({scores}) — may be hardcoded"

    def test_invalid_file_type_returns_400(self):
        """PDF upload is rejected with HTTP 400."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("report.pdf", b"%PDF-1.4 fake", "application/pdf")},
        )
        assert resp.status_code == 400

    def test_text_file_returns_400(self):
        """Plain text file is rejected with HTTP 400."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("data.txt", b"hello world", "text/plain")},
        )
        assert resp.status_code == 400

    def test_fake_jpeg_content_returns_400(self):
        """File claiming to be JPEG but with wrong magic bytes is rejected."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("fake.jpg", b"this is not a jpeg", "image/jpeg")},
        )
        assert resp.status_code == 400

    def test_disclosure_mentions_dataset_size(self):
        """Disclosure must reference the dataset (298,450 records)."""
        resp = client.post(
            "/api/detect/simulate",
            files={"file": ("img.jpg", _make_jpeg_bytes(), "image/jpeg")},
        )
        disc = resp.json()["disclosure"]
        assert "298,450" in disc, "Disclosure must mention the 298,450-record dataset"

    def test_violation_type_is_from_real_distribution(self):
        """Returned violation type must be one of the 10 real dataset categories."""
        valid_types = {
            "WRONG PARKING", "NO PARKING", "PARKING IN A MAIN ROAD",
            "PARKING ON FOOTPATH", "DEFECTIVE NUMBER PLATE",
            "PARKING NEAR ROAD CROSSING", "PARKING NEAR BUSTOP/SCHOOL/HOSPITAL ETC",
            "DOUBLE PARKING", "PARKING OTHER THAN BUS STOP",
            "PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS",
        }
        for _ in range(5):
            resp = client.post(
                "/api/detect/simulate",
                files={"file": ("img.jpg", _make_jpeg_bytes(), "image/jpeg")},
            )
            vtype = resp.json()["simulated_detection"]["violation_type"]
            assert vtype in valid_types, f"Unexpected violation type: '{vtype}'"

    def test_vehicle_type_is_from_real_distribution(self):
        """Returned vehicle type must be one of the real dataset categories."""
        valid_vehicles = {
            "SCOOTER", "CAR", "MOTOR CYCLE", "PASSENGER AUTO",
            "MAXI-CAB", "LGV", "GOODS AUTO", "MOPED",
        }
        for _ in range(5):
            resp = client.post(
                "/api/detect/simulate",
                files={"file": ("img.jpg", _make_jpeg_bytes(), "image/jpeg")},
            )
            vtype = resp.json()["simulated_detection"]["vehicle_type"]
            assert vtype in valid_vehicles, f"Unexpected vehicle type: '{vtype}'"


# ─────────────────────────────────────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────────────────────────────────────

class TestHealth:

    def test_health_returns_200(self):
        resp = client.get("/health")
        assert resp.status_code == 200

    def test_health_has_status_ok(self):
        resp = client.get("/health")
        assert resp.json()["status"] == "ok"

    def test_health_has_record_count(self):
        count = resp = client.get("/health").json()["total_records"]
        assert isinstance(count, int)
        assert count > 0, "Database appears empty — run data load first"


# ─────────────────────────────────────────────────────────────────────────────
# /api/dispatch/live-queue
# ─────────────────────────────────────────────────────────────────────────────

class TestDispatch:

    def test_live_queue_returns_200(self):
        resp = client.get("/api/dispatch/live-queue")
        assert resp.status_code == 200

    def test_live_queue_has_items(self):
        data = client.get("/api/dispatch/live-queue").json()
        assert len(data) > 0


# ─────────────────────────────────────────────────────────────────────────────
# /api/geo/violation-points
# ─────────────────────────────────────────────────────────────────────────────

class TestGeo:

    def test_violation_points_valid_month(self):
        resp = client.get("/api/geo/violation-points?month=2024-01")
        assert resp.status_code == 200
        data = resp.json()
        assert data["type"] == "FeatureCollection"
        assert len(data["features"]) > 0

    def test_violation_points_invalid_month_returns_400(self):
        resp = client.get("/api/geo/violation-points?month=2025-06")
        assert resp.status_code == 400

    def test_monthly_summary_returns_all_months(self):
        data = client.get("/api/geo/monthly-summary").json()
        months = [m["month"] for m in data["months"]]
        for expected in ["2023-11", "2023-12", "2024-01", "2024-02", "2024-03", "2024-04"]:
            assert expected in months, f"Missing month {expected} from summary"
