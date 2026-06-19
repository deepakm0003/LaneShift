"""
scripts/verify_fixes.py
========================
LaneShift Backend — Fix & Harden Pass Verification Script

Run from the project root:
    python scripts/verify_fixes.py

Checks all four assertions required by the fix spec:
1. records_with_validation_status + records_with_null_status == 298,450 (exact)
2. approved + rejected + created1 + processing + duplicate == 173,196 (exact)
3. /api/severity-weights returns exactly 27 entries
4. Zero records with max_severity >= 9 appear in the auto-validatable=True set

Does NOT modify any data. Reads directly from violations.db.
"""

import sys
import os
import json

# Allow running from project root or scripts/ directory
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

from sqlalchemy.orm import sessionmaker
from sqlalchemy import func

from database import Violation, get_engine
from severity_weights import OFFENCE_CODE_SEVERITY, DEFAULT_SEVERITY
from auto_validation import classify_auto_validatable, LEAKED_STATUSES, HIGH_SEVERITY_THRESHOLD

from pathlib import Path
PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")

PASS_COUNT = 0
FAIL_COUNT = 0


def assert_eq(label: str, actual, expected):
    global PASS_COUNT, FAIL_COUNT
    if actual == expected:
        print(f"  PASS  {label}")
        print(f"        actual={actual!r}")
        PASS_COUNT += 1
    else:
        print(f"  FAIL  {label}")
        print(f"        expected={expected!r}")
        print(f"        actual  ={actual!r}")
        FAIL_COUNT += 1


def assert_true(label: str, condition: bool, detail: str = ""):
    global PASS_COUNT, FAIL_COUNT
    if condition:
        print(f"  PASS  {label}")
        if detail:
            print(f"        {detail}")
        PASS_COUNT += 1
    else:
        print(f"  FAIL  {label}")
        if detail:
            print(f"        {detail}")
        FAIL_COUNT += 1


# ──────────────────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print("LaneShift — Fix & Harden Verification")
print("=" * 60)

engine = get_engine(DB_PATH)
Session = sessionmaker(bind=engine)

# ── Assertion 1: null + with_status == 298,450 ───────────────────────────────
print("\n[1] validation_status accounting adds up to total")

session = Session()
try:
    total = session.query(func.count(Violation.id)).scalar()
    null_count = (
        session.query(func.count(Violation.id))
        .filter(Violation.validation_status.is_(None))
        .scalar()
    )
    with_status = (
        session.query(func.count(Violation.id))
        .filter(Violation.validation_status.isnot(None))
        .scalar()
    )
finally:
    session.close()

print(f"    total records            : {total:,}")
print(f"    with validation_status   : {with_status:,}")
print(f"    null validation_status   : {null_count:,}")
print(f"    sum (with + null)        : {with_status + null_count:,}")

assert_eq(
    "with_status + null_count == 298,450",
    with_status + null_count,
    298_450,
)
assert_eq(
    "total == 298,450",
    total,
    298_450,
)

# ── Assertion 2: named statuses sum to 173,196 ────────────────────────────────
print("\n[2] named status counts sum to 173,196")

session = Session()
try:
    rows = (
        session.query(
            Violation.validation_status,
            func.count(Violation.id).label("cnt"),
        )
        .filter(Violation.validation_status.isnot(None))
        .group_by(Violation.validation_status)
        .all()
    )
finally:
    session.close()

status_counts = {r.validation_status: int(r.cnt) for r in rows}
approved   = status_counts.get("approved", 0)
rejected   = status_counts.get("rejected", 0)
created1   = status_counts.get("created1", 0)
processing = status_counts.get("processing", 0)
duplicate  = status_counts.get("duplicate", 0)
named_sum  = approved + rejected + created1 + processing + duplicate

print(f"    approved   : {approved:,}")
print(f"    rejected   : {rejected:,}")
print(f"    created1   : {created1:,}")
print(f"    processing : {processing:,}")
print(f"    duplicate  : {duplicate:,}")
print(f"    sum        : {named_sum:,}")

assert_eq("approved == 115,400", approved, 115_400)
assert_eq("rejected == 49,754",  rejected, 49_754)
assert_eq("created1 == 7,044",   created1, 7_044)
assert_eq("processing == 678",   processing, 678)
assert_eq("duplicate == 320",    duplicate, 320)
assert_eq(
    "approved+rejected+created1+processing+duplicate == 173,196",
    named_sum,
    173_196,
)

# ── Assertion 3: severity-weights has exactly 27 entries ─────────────────────
print("\n[3] OFFENCE_CODE_SEVERITY dict has exactly 27 entries")

entry_count = len(OFFENCE_CODE_SEVERITY)
print(f"    entries in OFFENCE_CODE_SEVERITY : {entry_count}")
assert_eq("len(OFFENCE_CODE_SEVERITY) == 27", entry_count, 27)

# Also confirm the two highest-severity codes are present and correct
assert_eq("code 109 (DOUBLE PARKING) == 10",       OFFENCE_CODE_SEVERITY[109], 10)
assert_eq("code 107 (PARKING IN MAIN ROAD) == 9",  OFFENCE_CODE_SEVERITY[107], 9)

# ── Assertion 4: zero severity-9/10 records in auto-validatable=True ─────────
print(f"\n[4] Zero max_severity >= {HIGH_SEVERITY_THRESHOLD} records leak into auto-validatable=True")
print("    (scans all rejected/stuck records — may take a few seconds)")

session = Session()
try:
    leaked_rows = (
        session.query(
            Violation.id,
            Violation.violation_count,
            Violation.vehicle_number,
            Violation.updated_vehicle_number,
            Violation.data_sent_to_scita,
            Violation.offence_code,
        )
        .filter(Violation.validation_status.in_(LEAKED_STATUSES))
        .all()
    )
finally:
    session.close()

total_leaked = len(leaked_rows)
leaked_auto_valid = 0
high_severity_auto_valid = 0  # should be 0

for row in leaked_rows:
    v = {
        "violation_count": row.violation_count,
        "vehicle_number": row.vehicle_number,
        "updated_vehicle_number": row.updated_vehicle_number,
        "data_sent_to_scita": row.data_sent_to_scita,
        "offence_code": row.offence_code,
    }
    if classify_auto_validatable(v, OFFENCE_CODE_SEVERITY):
        leaked_auto_valid += 1
        # Double-check severity for every auto-valid record
        raw_codes = row.offence_code or "[]"
        if isinstance(raw_codes, str):
            try:
                codes = json.loads(raw_codes)
            except Exception:
                codes = []
        else:
            codes = list(raw_codes) if raw_codes else []
        if codes:
            max_sev = max(OFFENCE_CODE_SEVERITY.get(int(c), DEFAULT_SEVERITY) for c in codes)
        else:
            max_sev = DEFAULT_SEVERITY
        if max_sev >= HIGH_SEVERITY_THRESHOLD:
            high_severity_auto_valid += 1

print(f"    total rejected/stuck records   : {total_leaked:,}")
print(f"    of which auto-validatable=True : {leaked_auto_valid:,}")
print(f"    of which severity >= 9 AND auto-validatable=True : {high_severity_auto_valid}")

assert_eq(
    "total leaked == 57,476",
    total_leaked,
    57_476,
)
assert_eq(
    "auto-validatable count == 48,955",
    leaked_auto_valid,
    48_955,
)
assert_eq(
    "ZERO high-severity (>=9) records in auto-validatable=True set",
    high_severity_auto_valid,
    0,
)

# ── Assertion 5: projection sum == 298,450 (no record uncounted) ─────────────
print(f"\n[5] full_pipeline_projection: auto_approved + human_approved + requires_review == 298,450")
print("    (scans all 298,450 records — may take ~10 seconds)")

from auto_validation import project_full_pipeline_outcome

projection = project_full_pipeline_outcome(DB_PATH)
proj = projection["projected_under_laneshift"]
auto_approved_p   = proj["auto_approved_count"]
human_approved_p  = proj["human_approved_count"]
requires_review_p = proj["requires_human_review_count"]
proj_sum          = auto_approved_p + human_approved_p + requires_review_p

print(f"    auto_approved_count        : {auto_approved_p:,}")
print(f"    human_approved_count       : {human_approved_p:,}")
print(f"    requires_human_review_count: {requires_review_p:,}")
print(f"    sum                        : {proj_sum:,}")
print(f"    recovered_from_void        : {projection['headline_recovery_number']['records_recovered_from_void']:,}")
print(f"    recovered_from_void_pct    : {projection['headline_recovery_number']['records_recovered_from_void_pct_of_total']}%")

assert_eq(
    "auto_approved + human_approved + requires_review == 298,450",
    proj_sum,
    298_450,
)
assert_eq(
    "still_unresolved_count == 0",
    proj["still_unresolved_count"],
    0,
)

# ── Assertion 6: forecasting model backtest sanity ────────────────────────────
print(f"\n[6] Forecasting backtest sanity — top 3 stations")
print("    (trains Prophet on each station — may take 30–60 seconds)")

from forecasting import prepare_daily_series, train_and_backtest, _top_stations_by_volume

TOP_FORECAST_STATIONS = _top_stations_by_volume(DB_PATH, n=3)
print(f"    Top 3 stations by volume: {TOP_FORECAST_STATIONS}")
print()

backtest_results = {}
for station in TOP_FORECAST_STATIONS:
    try:
        daily_df = prepare_daily_series(DB_PATH, station)
        bt = train_and_backtest(daily_df, holdout_days=21)
        backtest_results[station] = bt
        print(f"    {station}:")
        print(f"      Days in series : {bt['trained_on_days'] + bt['holdout_days']}")
        print(f"      Trained on     : {bt['trained_on_days']} days")
        print(f"      Holdout        : {bt['holdout_days']} days ({bt['holdout_period_start']} – {bt['holdout_period_end']})")
        print(f"      MAE            : {bt['mae']:.2f} violations/day")
        print(f"      MAPE           : {bt['mape_pct']:.2f}%")
        print()
    except Exception as e:
        print(f"    ERROR for {station}: {e}")
        backtest_results[station] = None

# Assert MAPE for the top station is a real positive float in [0, 100]
primary_station = TOP_FORECAST_STATIONS[0]
bt_primary = backtest_results.get(primary_station)

assert_true(
    f"Backtest ran successfully for {primary_station}",
    bt_primary is not None,
    f"Backtest result: {bt_primary}",
)
if bt_primary is not None:
    mape = bt_primary.get("mape_pct")
    assert_true(
        f"MAPE for {primary_station} is a real float in (0, 100)",
        mape is not None and isinstance(mape, float) and 0 < mape < 100,
        f"MAPE value: {mape}",
    )
    assert_true(
        f"MAE for {primary_station} is a positive float",
        isinstance(bt_primary.get("mae"), float) and bt_primary["mae"] > 0,
        f"MAE value: {bt_primary.get('mae')}",
    )

print("  ── Backtest accuracy record (quote these in the pitch) ──")
for station, bt in backtest_results.items():
    if bt:
        print(f"    {station}: MAE={bt['mae']:.1f} violations/day, MAPE={bt['mape_pct']:.1f}%")

# ── Module 6: Persistent Hotspot Escalation verification ──────────────────────
print("\n[6] Module 6 — Persistent Hotspot Escalation Engine")

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))
try:
    from persistent_hotspots import compute_weekly_persistence, classify_escalation_tier

    df6 = compute_weekly_persistence(DB_PATH)

    assert_true(
        "compute_weekly_persistence returns a non-empty DataFrame",
        df6 is not None and len(df6) > 0,
        f"rows returned: {len(df6) if df6 is not None else 'None'}",
    )

    # Total weeks in dataset must be 23
    weeks_in_ds = int(df6['weeks_in_dataset'].iloc[0]) if len(df6) > 0 else 0
    assert_eq("weeks_in_dataset == 23", weeks_in_ds, 23)

    # BTP051 - Safina Plaza Junction must be present and at ratio 1.0
    btp051_rows = df6[df6['location_name'].str.contains('BTP051', na=False)]
    assert_true(
        "BTP051 - Safina Plaza Junction is in the persistence report",
        len(btp051_rows) > 0,
        f"Found {len(btp051_rows)} rows matching BTP051",
    )
    if len(btp051_rows) > 0:
        row51 = btp051_rows.iloc[0]
        assert_true(
            "BTP051 persistence_ratio == 1.0 (present all 23/23 weeks)",
            float(row51['persistence_ratio']) == 1.0,
            f"persistence_ratio = {row51['persistence_ratio']}, weeks_present = {row51['weeks_present']}/23",
        )
        tier51 = classify_escalation_tier(row51.to_dict())
        assert_true(
            "BTP051 lands in TIER 1 - ESCALATE TO CIVIC AUTHORITY",
            tier51 == 'TIER 1 - ESCALATE TO CIVIC AUTHORITY',
            f"tier = {tier51}, trend = {row51['trend_direction']}",
        )
        print(f"    BTP051 avg weekly violations: {row51['average_weekly_count']:.1f}")
        print(f"    BTP051 min weekly violations: {row51['min_weekly_count']}")
        print(f"    BTP051 dominant type: {row51['dominant_violation_type']}")

    # Count tier 1 locations
    tier1_locs = [r for _, r in df6.iterrows()
                  if classify_escalation_tier(r.to_dict()) == 'TIER 1 - ESCALATE TO CIVIC AUTHORITY']
    print(f"    Total TIER 1 locations: {len(tier1_locs)}")
    print(f"    Total locations analysed: {len(df6)}")
    assert_true(
        "At least 1 TIER 1 location exists",
        len(tier1_locs) >= 1,
        f"Found {len(tier1_locs)} TIER 1 locations",
    )

    # Show top 5 by persistence ratio
    print("  ── Top 5 most persistent locations ──")
    for _, row in df6.nlargest(5, 'persistence_ratio').iterrows():
        tier = classify_escalation_tier(row.to_dict())
        print(f"    {row['location_name'][:50]:<50} "
              f"ratio={row['persistence_ratio']:.2f} "
              f"avg={row['average_weekly_count']:.0f}/wk "
              f"{tier.split(' - ')[0]}")

except Exception as e:
    print(f"  ERROR in Module 6 verification: {e}")
    import traceback
    traceback.print_exc()
    FAIL_COUNT += 1

# ── Summary ───────────────────────────────────────────────────────────────────
print("\n" + "=" * 60)
print(f"  {PASS_COUNT} passed,  {FAIL_COUNT} failed")
print("=" * 60)

if FAIL_COUNT > 0:
    print("\n  ✗ One or more assertions failed — fix before moving on.")
    sys.exit(1)
else:
    print("\n  ✓ All assertions passed. Forecasting + geo additions verified.")
    sys.exit(0)
