"""
LaneShift — Chart Generation Script
=====================================
Generates all submission-quality charts from the live violations.db.
Output: charts/ directory with PNG files ready to attach to submission.

Run from project root:
    python scripts/generate_charts.py
"""

import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "app"))

import sqlite3
import pandas as pd
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from pathlib import Path

PROJECT_ROOT = Path(__file__).parent.parent
DB_PATH = str(PROJECT_ROOT / "violations.db")
OUT_DIR  = PROJECT_ROOT / "charts"
OUT_DIR.mkdir(exist_ok=True)

# ── Shared style ─────────────────────────────────────────────────────────────
BG      = "#0d1117"
CARD    = "#161b22"
ACCENT  = "#58a6ff"
GREEN   = "#3fb950"
RED     = "#f85149"
ORANGE  = "#d29922"
PURPLE  = "#bc8cff"
TEXT    = "#e6edf3"
SUBTEXT = "#8b949e"
GRID    = "#21262d"

def style_ax(ax, title="", xlabel="", ylabel=""):
    ax.set_facecolor(CARD)
    ax.tick_params(colors=SUBTEXT, labelsize=9)
    ax.spines["top"].set_visible(False)
    ax.spines["right"].set_visible(False)
    ax.spines["left"].set_color(GRID)
    ax.spines["bottom"].set_color(GRID)
    ax.yaxis.grid(True, color=GRID, linewidth=0.6, linestyle="--")
    ax.set_axisbelow(True)
    if title:  ax.set_title(title, color=TEXT, fontsize=12, fontweight="bold", pad=10)
    if xlabel: ax.set_xlabel(xlabel, color=SUBTEXT, fontsize=9)
    if ylabel: ax.set_ylabel(ylabel, color=SUBTEXT, fontsize=9)

def save(fig, name):
    path = OUT_DIR / name
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor=BG)
    plt.close(fig)
    print(f"  saved → charts/{name}")

conn = sqlite3.connect(DB_PATH)
print(f"\nConnected to {DB_PATH}")
print(f"Saving charts to {OUT_DIR}\n")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 1 — Top 10 Violation Types
# ══════════════════════════════════════════════════════════════════════════════
print("[1] Top violation types")
df1 = pd.read_sql("""
    SELECT primary_violation AS violation, COUNT(*) AS cnt
    FROM violations
    WHERE primary_violation IS NOT NULL
    GROUP BY primary_violation
    ORDER BY cnt DESC
    LIMIT 10
""", conn)

fig, ax = plt.subplots(figsize=(11, 5.5))
fig.patch.set_facecolor(BG)
colors = [ACCENT if i < 2 else "#2ea043" if i < 5 else "#3d444d" for i in range(len(df1))]
bars = ax.barh(df1["violation"][::-1], df1["cnt"][::-1], color=colors[::-1], height=0.6)
for bar, val in zip(bars, df1["cnt"][::-1]):
    ax.text(bar.get_width() + 1500, bar.get_y() + bar.get_height()/2,
            f"{val:,}", va="center", color=TEXT, fontsize=8.5)
style_ax(ax, "Top 10 Violation Types — 298,450 Records",
         "Number of Violations", "")
ax.xaxis.set_major_formatter(plt.FuncFormatter(lambda x, _: f"{int(x/1000)}K"))
ax.set_xlim(0, df1["cnt"].max() * 1.18)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "01_top_violation_types.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 2 — Validation Pipeline Funnel
# ══════════════════════════════════════════════════════════════════════════════
print("[2] Validation pipeline funnel")
labels = ["Total Flagged\n298,450", "No Status\n(Never Processed)\n125,254",
          "Entered Pipeline\n173,196", "Approved\n115,400",
          "Rejected\n49,754", "Stuck\n7,722"]
values = [298450, 125254, 173196, 115400, 49754, 7722]
bar_colors = [ACCENT, RED, ORANGE, GREEN, RED, ORANGE]

fig, ax = plt.subplots(figsize=(13, 5.5))
fig.patch.set_facecolor(BG)
x = np.arange(len(labels))
bars = ax.bar(x, values, color=bar_colors, width=0.55, zorder=3)
for bar, val in zip(bars, values):
    pct = val / 298450 * 100
    ax.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 3000,
            f"{val:,}\n({pct:.1f}%)", ha="center", va="bottom",
            color=TEXT, fontsize=8.5, fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels(labels, color=SUBTEXT, fontsize=8)
style_ax(ax, "Validation Pipeline — Where Every Violation Goes", "", "Records")
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v/1000)}K"))
ax.set_ylim(0, 350000)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "02_validation_pipeline_funnel.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 3 — Rejection Rate by Station (top 15)
# ══════════════════════════════════════════════════════════════════════════════
print("[3] Rejection rate by station")
df3 = pd.read_sql("""
    SELECT police_station,
           SUM(CASE WHEN validation_status='approved'  THEN 1 ELSE 0 END) AS approved,
           SUM(CASE WHEN validation_status='rejected'  THEN 1 ELSE 0 END) AS rejected,
           SUM(CASE WHEN validation_status IN ('created1','processing') THEN 1 ELSE 0 END) AS stuck,
           COUNT(*) AS total
    FROM violations
    WHERE police_station IS NOT NULL
      AND validation_status IN ('approved','rejected','created1','processing','duplicate')
    GROUP BY police_station
    HAVING total > 200
    ORDER BY CAST(rejected AS FLOAT)/total DESC
    LIMIT 15
""", conn)
df3["rej_pct"] = df3["rejected"] / df3["total"] * 100

fig, ax = plt.subplots(figsize=(12, 6))
fig.patch.set_facecolor(BG)
bar_c = [RED if p > 35 else ORANGE if p > 28 else ACCENT for p in df3["rej_pct"]]
bars = ax.barh(df3["police_station"][::-1], df3["rej_pct"][::-1],
               color=bar_c[::-1], height=0.6)
for bar, val in zip(bars, df3["rej_pct"][::-1]):
    ax.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
            f"{val:.1f}%", va="center", color=TEXT, fontsize=8.5)
ax.axvline(x=df3["rej_pct"].mean(), color=SUBTEXT, linestyle="--",
           linewidth=1, label=f"Mean {df3['rej_pct'].mean():.1f}%")
ax.legend(facecolor=CARD, labelcolor=TEXT, fontsize=8)
style_ax(ax, "Rejection Rate by Station — Top 15 Worst Performers",
         "Rejection Rate (%)", "")
ax.set_xlim(0, df3["rej_pct"].max() * 1.18)
patches = [mpatches.Patch(color=RED, label=">35% — Critical"),
           mpatches.Patch(color=ORANGE, label="28-35% — Elevated"),
           mpatches.Patch(color=ACCENT, label="<28% — Normal")]
ax.legend(handles=patches, facecolor=CARD, labelcolor=TEXT, fontsize=8,
          loc="lower right")
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "03_rejection_rate_by_station.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 4 — Violations by Hour (IST) — Peak-Hour Pattern
# ══════════════════════════════════════════════════════════════════════════════
print("[4] Violations by hour IST")
df4 = pd.read_sql("""
    SELECT CAST(hour_ist AS INT) AS hour, COUNT(*) AS cnt
    FROM violations
    WHERE hour_ist IS NOT NULL
    GROUP BY hour
    ORDER BY hour
""", conn)

fig, ax = plt.subplots(figsize=(12, 5))
fig.patch.set_facecolor(BG)
bar_c = [RED if 8 <= h <= 12 else ORANGE if 7 <= h <= 18 else "#3d444d"
         for h in df4["hour"]]
ax.bar(df4["hour"], df4["cnt"], color=bar_c, width=0.75, zorder=3)
ax.axvspan(8, 12, alpha=0.08, color=RED, label="Peak window (8–12 AM)")
max_h = df4.loc[df4["cnt"].idxmax(), "hour"]
max_v = df4["cnt"].max()
ax.annotate(f"Peak: {int(max_h)}:00 IST\n{max_v:,} violations",
            xy=(max_h, max_v), xytext=(max_h + 1.5, max_v * 0.92),
            color=RED, fontsize=8.5, fontweight="bold",
            arrowprops=dict(arrowstyle="->", color=RED, lw=1.2))
style_ax(ax, "Violation Volume by Hour (IST) — Time-of-Day Weight Basis",
         "Hour (IST, 0–23)", "Number of Violations")
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v/1000)}K"))
ax.set_xticks(range(0, 24))
ax.xaxis.set_tick_params(labelsize=8)
patches = [mpatches.Patch(color=RED, label="Peak (8–12 AM)"),
           mpatches.Patch(color=ORANGE, label="Active (7 AM–6 PM)"),
           mpatches.Patch(color="#3d444d", label="Off-peak")]
ax.legend(handles=patches, facecolor=CARD, labelcolor=TEXT, fontsize=8)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "04_violations_by_hour.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 5 — Top 15 Stations by Aggregate Congestion Score
# ══════════════════════════════════════════════════════════════════════════════
print("[5] Stations by aggregate congestion score")
df5 = pd.read_sql("""
    SELECT police_station, SUM(congestion_cost_score) AS agg_score,
           COUNT(*) AS violations, AVG(congestion_cost_score) AS avg_score
    FROM violations
    WHERE police_station IS NOT NULL AND congestion_cost_score IS NOT NULL
    GROUP BY police_station
    ORDER BY agg_score DESC
    LIMIT 15
""", conn)

fig, ax = plt.subplots(figsize=(12, 6))
fig.patch.set_facecolor(BG)
norm = plt.Normalize(df5["agg_score"].min(), df5["agg_score"].max())
cmap = matplotlib.colormaps["YlOrRd"]
bar_c = [cmap(norm(v)) for v in df5["agg_score"][::-1]]
bars = ax.barh(df5["police_station"][::-1], df5["agg_score"][::-1] / 1e6,
               color=bar_c, height=0.6)
for bar, row in zip(bars, df5.iloc[::-1].itertuples()):
    ax.text(bar.get_width() + 0.05,
            bar.get_y() + bar.get_height()/2,
            f"{row.agg_score/1e6:.1f}M  ({row.violations:,} violations)",
            va="center", color=TEXT, fontsize=7.5)
style_ax(ax, "Top 15 Stations — Aggregate Congestion Score (All-Time)",
         "Aggregate Congestion Score (Millions)", "")
ax.set_xlim(0, df5["agg_score"].max() / 1e6 * 1.35)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "05_stations_congestion_score.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 6 — Congestion Score Distribution (histogram)
# ══════════════════════════════════════════════════════════════════════════════
print("[6] Congestion score distribution")
df6 = pd.read_sql("""
    SELECT congestion_cost_score FROM violations
    WHERE congestion_cost_score IS NOT NULL
""", conn)

fig, ax = plt.subplots(figsize=(11, 5))
fig.patch.set_facecolor(BG)
n, bins, patches_h = ax.hist(df6["congestion_cost_score"], bins=50,
                              color=ACCENT, edgecolor=BG, linewidth=0.3, zorder=3)
# Color by zone
for patch, left in zip(patches_h, bins[:-1]):
    if left >= 700:   patch.set_facecolor(RED)
    elif left >= 400: patch.set_facecolor(ORANGE)
for pct, thresh, label, col in [(0.10, 700, "HIGH (≥700)\nDispatch immediately", RED),
                                 (0.40, 400, "MEDIUM (400-699)\nStandard patrol", ORANGE),
                                 (0.50, 0,   "LOW (<400)\nMonitor", ACCENT)]:
    pass
ax.axvline(700, color=RED,    linestyle="--", linewidth=1, label="Dispatch threshold (700)")
ax.axvline(400, color=ORANGE, linestyle="--", linewidth=1, label="Patrol threshold (400)")
style_ax(ax, "Congestion Score Distribution — All 298,450 Violations (0–1000 Scale)",
         "Congestion Cost Score", "Number of Violations")
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v/1000)}K"))
ax.legend(facecolor=CARD, labelcolor=TEXT, fontsize=8)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "06_congestion_score_distribution.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 7 — Auto-Validation Recovery by Station (top 20)
# ══════════════════════════════════════════════════════════════════════════════
print("[7] Auto-validation recovery by station")
import json as _json
from severity_weights import OFFENCE_CODE_SEVERITY, DEFAULT_SEVERITY

df7_raw = pd.read_sql("""
    SELECT police_station, validation_status, violation_count,
           vehicle_number, updated_vehicle_number,
           data_sent_to_scita, offence_code
    FROM violations
    WHERE validation_status IN ('rejected','created1','processing')
      AND police_station IS NOT NULL
""", conn)

def is_auto(row):
    if row["violation_count"] != 1: return False
    vn = row["vehicle_number"]
    if not vn: return False
    uvn = row["updated_vehicle_number"]
    if uvn and str(uvn).strip() and str(uvn).strip() != str(vn).strip(): return False
    if str(row["data_sent_to_scita"]).strip() != "1": return False
    raw = row["offence_code"] or "[]"
    try: codes = _json.loads(raw)
    except: codes = []
    max_sev = max((OFFENCE_CODE_SEVERITY.get(int(c), DEFAULT_SEVERITY) for c in codes), default=DEFAULT_SEVERITY)
    return max_sev < 9

df7_raw["auto_valid"] = df7_raw.apply(is_auto, axis=1)
df7 = df7_raw.groupby("police_station").agg(
    leaked=("auto_valid", "count"),
    recoverable=("auto_valid", "sum")
).reset_index()
df7["recovery_pct"] = df7["recoverable"] / df7["leaked"] * 100
df7 = df7[df7["leaked"] >= 100].sort_values("recovery_pct", ascending=False).head(20)

fig, ax = plt.subplots(figsize=(12, 7))
fig.patch.set_facecolor(BG)
bar_c = [GREEN if p >= 90 else ACCENT if p >= 70 else ORANGE for p in df7["recovery_pct"][::-1]]
bars = ax.barh(df7["police_station"][::-1], df7["recovery_pct"][::-1],
               color=bar_c, height=0.6)
for bar, row in zip(bars, df7.iloc[::-1].itertuples()):
    ax.text(bar.get_width() + 0.5,
            bar.get_y() + bar.get_height()/2,
            f"{row.recovery_pct:.1f}%  ({row.recoverable:,}/{row.leaked:,})",
            va="center", color=TEXT, fontsize=7.5)
ax.axvline(85.17, color=SUBTEXT, linestyle="--", linewidth=1,
           label="Overall avg: 85.17%")
style_ax(ax, "Auto-Validation Recovery Rate by Station\n(% of rejected/stuck that were objectively auto-validatable)",
         "Recovery Rate (%)", "")
ax.set_xlim(0, 115)
patches = [mpatches.Patch(color=GREEN,  label="≥90% recovery"),
           mpatches.Patch(color=ACCENT, label="70-89%"),
           mpatches.Patch(color=ORANGE, label="<70%"),
           mpatches.Patch(color=SUBTEXT, label="Overall avg: 85.17%", linestyle="--")]
ax.legend(handles=patches, facecolor=CARD, labelcolor=TEXT, fontsize=8,
          loc="lower right")
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "07_auto_validation_recovery.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 8 — Top 20 Junctions by Congestion Score
# ══════════════════════════════════════════════════════════════════════════════
print("[8] Top junctions by congestion score")
df8 = pd.read_sql("""
    SELECT junction_name, SUM(congestion_cost_score) AS agg,
           COUNT(*) AS cnt
    FROM violations
    WHERE junction_name NOT IN ('No Junction') AND junction_name IS NOT NULL
      AND congestion_cost_score IS NOT NULL
    GROUP BY junction_name
    ORDER BY agg DESC
    LIMIT 20
""", conn)

fig, ax = plt.subplots(figsize=(12, 7))
fig.patch.set_facecolor(BG)
norm = plt.Normalize(df8["agg"].min(), df8["agg"].max())
cmap = matplotlib.colormaps["plasma"]
bar_c = [cmap(norm(v)) for v in df8["agg"][::-1]]
bars = ax.barh(df8["junction_name"][::-1], df8["agg"][::-1] / 1e6,
               color=bar_c, height=0.6)
for bar, row in zip(bars, df8.iloc[::-1].itertuples()):
    ax.text(bar.get_width() + 0.02,
            bar.get_y() + bar.get_height()/2,
            f"{row.agg/1e6:.2f}M  ({row.cnt:,} violations)",
            va="center", color=TEXT, fontsize=7.5)
style_ax(ax, "Top 20 Named Junctions — Aggregate Congestion Score",
         "Aggregate Score (Millions)", "")
ax.set_xlim(0, df8["agg"].max() / 1e6 * 1.45)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "08_top_junctions_congestion.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 9 — Violations Over Time (monthly trend)
# ══════════════════════════════════════════════════════════════════════════════
print("[9] Monthly violation trend")
df9 = pd.read_sql("""
    SELECT strftime('%Y-%m', created_datetime) AS month, COUNT(*) AS cnt
    FROM violations
    WHERE created_datetime IS NOT NULL
    GROUP BY month
    ORDER BY month
""", conn)
df9 = df9[df9["month"].notna() & (df9["month"] >= "2023-11")]

fig, ax = plt.subplots(figsize=(11, 5))
fig.patch.set_facecolor(BG)
ax.fill_between(range(len(df9)), df9["cnt"], alpha=0.25, color=ACCENT)
ax.plot(range(len(df9)), df9["cnt"], color=ACCENT, linewidth=2.5, marker="o",
        markersize=7, markerfacecolor=BG, markeredgecolor=ACCENT, markeredgewidth=2)
for i, (_, row) in enumerate(df9.iterrows()):
    ax.annotate(f"{row['cnt']:,}", (i, row["cnt"]),
                textcoords="offset points", xytext=(0, 10),
                ha="center", color=TEXT, fontsize=8.5, fontweight="bold")
ax.set_xticks(range(len(df9)))
ax.set_xticklabels(df9["month"].tolist(), color=SUBTEXT, fontsize=9)
style_ax(ax, "Monthly Violation Volume — Nov 2023 to Apr 2024",
         "Month", "Violations")
ax.yaxis.set_major_formatter(plt.FuncFormatter(lambda v, _: f"{int(v/1000)}K"))
ax.set_ylim(0, df9["cnt"].max() * 1.25)
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "09_monthly_trend.png")

# ══════════════════════════════════════════════════════════════════════════════
# CHART 10 — Summary KPI Card (text-based infographic)
# ══════════════════════════════════════════════════════════════════════════════
print("[10] Summary KPI card")
fig, ax = plt.subplots(figsize=(14, 6))
fig.patch.set_facecolor(BG)
ax.set_facecolor(BG)
ax.axis("off")

kpis = [
    ("298,450",  "Total Violations\nAnalyzed",          ACCENT),
    ("57,476",   "Rejected or Stuck\nin Pipeline",       RED),
    ("85.17%",   "Auto-Validatable\n(of rejected/stuck)", GREEN),
    ("125,254",  "Records with NO\nValidation Status",   ORANGE),
    ("41.97%",   "Pipeline Entry\nGap Rate",             ORANGE),
    ("820/1000", "Peak Score\n(Safina Plaza Jn)",        PURPLE),
]

for i, (val, label, col) in enumerate(kpis):
    x = 0.08 + (i % 3) * 0.32
    y = 0.65 if i < 3 else 0.15
    ax.text(x, y, val,  transform=ax.transAxes, fontsize=28,
            color=col, fontweight="bold", ha="center", va="center")
    ax.text(x, y - 0.18, label, transform=ax.transAxes, fontsize=9.5,
            color=SUBTEXT, ha="center", va="center", linespacing=1.4)
    rect = plt.Rectangle((x - 0.13, y - 0.32), 0.26, 0.55,
                          transform=ax.transAxes, linewidth=1,
                          edgecolor=col, facecolor=CARD, alpha=0.4,
                          clip_on=False)
    ax.add_patch(rect)

ax.text(0.5, 0.97, "LaneShift — Key Metrics at a Glance",
        transform=ax.transAxes, fontsize=14, color=TEXT,
        fontweight="bold", ha="center", va="top")
ax.text(0.5, 0.91, "298,450 real BTP violation records | Nov 2023 – Apr 2024 | Gridlock Hackathon 2.0",
        transform=ax.transAxes, fontsize=8.5, color=SUBTEXT, ha="center", va="top")
fig.text(0.99, 0.01, "LaneShift — Gridlock Hackathon 2.0", ha="right",
         color=SUBTEXT, fontsize=7)
plt.tight_layout()
save(fig, "10_kpi_summary.png")

# ── Done ─────────────────────────────────────────────────────────────────────
conn.close()
print(f"\nAll 10 charts saved to: {OUT_DIR}")
print("Attach these files to your HackerEarth submission.")
