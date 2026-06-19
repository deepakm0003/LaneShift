import sys
sys.path.insert(0, '.')
from forecasting import prepare_daily_series, fit_and_evaluate, _all_stations_by_volume, DB_PATH

stations = _all_stations_by_volume(DB_PATH)
print(f"All {len(stations)} stations — full-data R² fit\n")
for s in stations:
    try:
        df = prepare_daily_series(DB_PATH, s)
        _, q = fit_and_evaluate(df)
        print(f"  {s:<35} R2={q['r2_pct']}%  cv={q['cv_pct']}%  mean={q['mean_daily']}/day  days={q['trained_on_days']}")
    except Exception as e:
        print(f"  {s:<35} ERROR: {e}")
