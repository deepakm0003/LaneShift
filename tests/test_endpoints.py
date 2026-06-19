"""
LaneShift Backend — Endpoint Test Suite
========================================
Run from the project root:
    pytest tests/test_endpoints.py -v

Uses FastAPI's TestClient (backed by httpx) — no live server needed.
The test DB is the real violations.db; tests are read-only and make no writes.
"""

import sys
import os

# ── Path fix: ensure app/ is importable when pytest runs from project root ───
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

import pytest
from starlette.testclient import TestClient

from main import app

client = TestClient(app, raise_server_exceptions=True)


# ─────────────────────────────────────────────────────────────────────────────
# /health
# ─────────────────────────────────────────────────────────────────────────────

class TestHealth:
    def test_returns_200(self):
        r = client.get("/health")
        assert r.status_code == 200

    def test_status_ok(self):
        data = client.get("/health").json()
        assert data["status"] == "ok"

    def test_total_records_positive(self):
        """DB must be loaded before running tests."""
        data = client.get("/health").json()
        assert data["total_records"] > 0, (
            "total_records is 0 — ensure violations.db is populated "
            "(place CSV in data/ and start the server once to trigger CSV load)"
        )

    def test_expected_record_count(self):
        """Sanity-check: full dataset is 298,450 rows."""
        data = client.get("/health").json()
        assert data["total_records"] == 298_450, (
            f"Expected 298450 records, got {data['total_records']}"
        )


# ─────────────────────────────────────────────────────────────────────────────
# /api/dispatch/live-queue
# ─────────────────────────────────────────────────────────────────────────────

class TestLiveQueue:
    def test_returns_200(self):
        r = client.get("/api/dispatch/live-queue")
        assert r.status_code == 200

    def test_queue_non_empty(self):
        data = client.get("/api/dispatch/live-queue").json()
        assert len(data["queue"]) > 0

    def test_rank_starts_at_1(self):
        data = client.get("/api/dispatch/live-queue").json()
        assert data["queue"][0]["rank"] == 1

    def test_ranks_are_sequential(self):
        data = client.get("/api/dispatch/live-queue").json()
        ranks = [item["rank"] for item in data["queue"]]
        assert ranks == list(range(1, len(ranks) + 1))

    def test_recommended_action_values(self):
        data = client.get("/api/dispatch/live-queue").json()
        valid_actions = {"Dispatch immediately", "Route on standard patrol", "Monitor"}
        for item in data["queue"]:
            assert item["recommended_action"] in valid_actions

    def test_location_type_values(self):
        data = client.get("/api/dispatch/live-queue").json()
        valid_types = {"junction", "midblock_cluster"}
        for item in data["queue"]:
            assert item["location_type"] in valid_types

    def test_scores_descending(self):
        data = client.get("/api/dispatch/live-queue").json()
        scores = [item["aggregate_congestion_score"] for item in data["queue"]]
        assert scores == sorted(scores, reverse=True)

    def test_generated_at_present(self):
        data = client.get("/api/dispatch/live-queue").json()
        assert "generated_at" in data
        assert data["generated_at"]  # non-empty

    def test_limit_param_respected(self):
        data = client.get("/api/dispatch/live-queue?limit=5").json()
        assert len(data["queue"]) <= 5

    def test_first_action_is_dispatch_immediately(self):
        """Top-ranked item must be 'Dispatch immediately' (top 10% threshold)."""
        data = client.get("/api/dispatch/live-queue").json()
        assert data["queue"][0]["recommended_action"] == "Dispatch immediately"


# ─────────────────────────────────────────────────────────────────────────────
# /api/dashboard/summary
# ─────────────────────────────────────────────────────────────────────────────

EXPECTED_TOP_KEYS = {
    "total_violations_analyzed",
    "date_range",
    "top_violation_types",
    "validation_leak_summary",
    "live_dispatch_queue_top_10",
    "stations_requiring_attention",
    "midblock_violation_share_pct",
}


class TestDashboardSummary:
    def test_returns_200(self):
        r = client.get("/api/dashboard/summary")
        assert r.status_code == 200

    def test_all_top_level_keys_present(self):
        data = client.get("/api/dashboard/summary").json()
        missing = EXPECTED_TOP_KEYS - set(data.keys())
        assert not missing, f"Missing keys: {missing}"

    def test_total_violations_correct(self):
        data = client.get("/api/dashboard/summary").json()
        assert data["total_violations_analyzed"] == 298_450

    def test_date_range_has_start_and_end(self):
        data = client.get("/api/dashboard/summary").json()
        dr = data["date_range"]
        assert "start" in dr and "end" in dr
        assert dr["start"] is not None
        assert dr["end"] is not None

    def test_date_range_order(self):
        """start must be before end."""
        data = client.get("/api/dashboard/summary").json()
        dr = data["date_range"]
        assert dr["start"] < dr["end"]

    def test_top_violation_types_count(self):
        data = client.get("/api/dashboard/summary").json()
        assert len(data["top_violation_types"]) == 5

    def test_top_violation_types_structure(self):
        data = client.get("/api/dashboard/summary").json()
        for item in data["top_violation_types"]:
            assert "type" in item
            assert "count" in item
            assert isinstance(item["count"], int)
            assert item["count"] > 0

    def test_top_violation_is_wrong_parking(self):
        """WRONG PARKING is the highest-volume type in this dataset."""
        data = client.get("/api/dashboard/summary").json()
        top = data["top_violation_types"][0]
        assert top["type"] == "WRONG PARKING"

    def test_validation_leak_summary_structure(self):
        data = client.get("/api/dashboard/summary").json()
        vls = data["validation_leak_summary"]
        # New dual-framing structure (added in fix pass)
        for key in ("total_records", "records_with_validation_status",
                    "records_with_null_status", "null_status_pct",
                    "of_processed_records", "of_all_records",
                    "potential_recovery_via_auto_validation_pct"):
            assert key in vls, f"Missing key: {key}"
        # of_processed_records must have the rejected/stuck count and rate
        opr = vls["of_processed_records"]
        assert "total_rejected_or_stuck" in opr
        assert "leak_rate_pct" in opr

    def test_validation_leak_rate_in_range(self):
        data = client.get("/api/dashboard/summary").json()
        # Check the rate inside of_processed_records (of the 173K with a status)
        rate = data["validation_leak_summary"]["of_processed_records"]["leak_rate_pct"]
        assert 0 < rate < 100

    def test_live_queue_top_10_length(self):
        data = client.get("/api/dashboard/summary").json()
        assert len(data["live_dispatch_queue_top_10"]) == 10

    def test_live_queue_top_10_rank_starts_at_1(self):
        data = client.get("/api/dashboard/summary").json()
        assert data["live_dispatch_queue_top_10"][0]["rank"] == 1

    def test_stations_requiring_attention_count(self):
        data = client.get("/api/dashboard/summary").json()
        assert len(data["stations_requiring_attention"]) == 5

    def test_stations_requiring_attention_structure(self):
        data = client.get("/api/dashboard/summary").json()
        for s in data["stations_requiring_attention"]:
            assert "police_station" in s
            assert "rejection_rate_pct" in s
            assert "total_submitted" in s

    def test_midblock_share_in_range(self):
        data = client.get("/api/dashboard/summary").json()
        pct = data["midblock_violation_share_pct"]
        assert 0 < pct < 100

    def test_midblock_share_roughly_half(self):
        """Known: ~50% of violations are mid-block (No Junction)."""
        data = client.get("/api/dashboard/summary").json()
        pct = data["midblock_violation_share_pct"]
        assert 40 <= pct <= 60, (
            f"Expected midblock share ~50%, got {pct}% "
            "(dataset has ~149,880 No Junction out of 298,450 total)"
        )


# ─────────────────────────────────────────────────────────────────────────────
# /api/dispatch/validation-leak-report — numeric consistency
# ─────────────────────────────────────────────────────────────────────────────

class TestValidationLeakReport:
    def test_returns_200(self):
        r = client.get("/api/dispatch/validation-leak-report")
        assert r.status_code == 200

    def test_non_empty(self):
        data = client.get("/api/dispatch/validation-leak-report").json()
        assert len(data) > 0

    def test_per_station_totals_consistent(self):
        """
        For each station: approved + rejected + stuck + duplicate == total_submitted.
        stuck = created1 + processing (reported as a combined stuck_count).
        The endpoint only exposes stuck_count, not the split — but
        approved + rejected + stuck + duplicate must equal total_submitted.
        """
        data = client.get("/api/dispatch/validation-leak-report").json()
        for row in data:
            parts_sum = (
                row["approved_count"]
                + row["rejected_count"]
                + row["stuck_count"]
                # duplicate is included in total_submitted but not separately exposed
                # We allow for duplicate counts here by asserting parts_sum <= total
                # (duplicate is the missing slice: total - parts_sum >= 0)
            )
            # parts_sum may be less than total_submitted by the duplicate count
            assert parts_sum <= row["total_submitted"], (
                f"Station {row['police_station']}: "
                f"parts_sum {parts_sum} > total_submitted {row['total_submitted']}"
            )

    def test_rates_sum_to_at_most_100(self):
        """approval_rate + rejection_rate can't exceed 100 (stuck/duplicate make up the rest)."""
        data = client.get("/api/dispatch/validation-leak-report").json()
        for row in data:
            total_rate = row["approval_rate_pct"] + row["rejection_rate_pct"]
            assert total_rate <= 100.0 + 0.2, (  # 0.2 tolerance for rounding
                f"Station {row['police_station']}: "
                f"approval + rejection = {total_rate} > 100"
            )

    def test_global_rejected_stuck_count(self):
        """
        Sum of (rejected + stuck) across all stations must equal the known
        dataset total of 57,476 (49,754 rejected + 7,044 created1/processing).
        Stations with validation_status=None (125,254 records) are excluded from
        this report, so the sum covers all submitted-status records correctly.
        """
        data = client.get("/api/dispatch/validation-leak-report").json()
        total_rejected = sum(r["rejected_count"] for r in data)
        total_stuck = sum(r["stuck_count"] for r in data)
        # Allow ±5 for any records with null police_station logged under "No Police Station"
        assert abs((total_rejected + total_stuck) - 57_476) <= 5, (
            f"Expected rejected+stuck total ~57476, got {total_rejected + total_stuck}"
        )

    def test_sorted_by_rejection_rate_descending(self):
        data = client.get("/api/dispatch/validation-leak-report").json()
        rates = [r["rejection_rate_pct"] for r in data]
        assert rates == sorted(rates, reverse=True)

    def test_kodigehalli_is_worst(self):
        """Kodigehalli has the highest rejection rate in this dataset (~39.9%)."""
        data = client.get("/api/dispatch/validation-leak-report").json()
        assert data[0]["police_station"] == "Kodigehalli"


# ─────────────────────────────────────────────────────────────────────────────
# /api/auto-validation/simulation-report — spot checks
# ─────────────────────────────────────────────────────────────────────────────

class TestAutoValidationReport:
    def test_returns_200(self):
        r = client.get("/api/auto-validation/simulation-report")
        assert r.status_code == 200

    def test_recovery_pct_in_range(self):
        data = client.get("/api/auto-validation/simulation-report").json()
        pct = data["potential_leak_recovery_pct"]
        assert 0 < pct <= 100

    def test_auto_validatable_leq_leaked(self):
        data = client.get("/api/auto-validation/simulation-report").json()
        assert data["would_have_been_auto_validatable"] <= data["currently_rejected_or_stuck"]

    def test_breakdown_stations_present(self):
        data = client.get("/api/auto-validation/simulation-report").json()
        assert len(data["breakdown_by_station"]) > 0

    def test_severity_threshold_present(self):
        data = client.get("/api/auto-validation/simulation-report").json()
        assert data["classifier_criteria"]["high_severity_threshold"] == 9


# ─────────────────────────────────────────────────────────────────────────────
# /api/nudge/simulate
# ─────────────────────────────────────────────────────────────────────────────

class TestNudgeSimulate:
    def test_valid_id_returns_200(self):
        r = client.post("/api/nudge/simulate", json={"violation_id": "FKID000000"})
        assert r.status_code == 200

    def test_nudge_sent_true(self):
        data = client.post("/api/nudge/simulate", json={"violation_id": "FKID000000"}).json()
        assert data["nudge_sent"] is True

    def test_nearest_option_present(self):
        data = client.post("/api/nudge/simulate", json={"violation_id": "FKID000000"}).json()
        opt = data["nearest_legal_option"]
        assert "name" in opt
        assert "distance_meters" in opt
        assert "price_per_hour" in opt
        assert opt["distance_meters"] > 0

    def test_simulation_note_present(self):
        data = client.post("/api/nudge/simulate", json={"violation_id": "FKID000000"}).json()
        assert "SIMULATED" in data["note"]

    def test_unknown_id_returns_404(self):
        r = client.post("/api/nudge/simulate", json={"violation_id": "DOESNOTEXIST"})
        assert r.status_code == 404

    def test_deterministic_result(self):
        """Same violation ID must always return the same parking option."""
        d1 = client.post("/api/nudge/simulate", json={"violation_id": "FKID000100"}).json()
        d2 = client.post("/api/nudge/simulate", json={"violation_id": "FKID000100"}).json()
        assert d1["nearest_legal_option"] == d2["nearest_legal_option"]
