# LaneShift — AI Parking Intelligence for Bengaluru BTP

**Gridlock Hackathon 2.0 | Flipkart × Bengaluru Traffic Police | Theme 1**

LaneShift is an AI-driven parking violation intelligence system built on top of Bengaluru Traffic Police's existing 298,450-record camera enforcement dataset (Nov 2023 – Apr 2024). It fixes what happens *after* detection — validation, prioritisation, and escalation — without requiring any new hardware.

---

## What it does

| Module | What it builds |
|--------|---------------|
| **M1 — Detection** | YOLOv8n on uploaded images/videos, number plate OCR (EasyOCR), violation classification via spatial heuristics |
| **M2 — Scoring** | 0–1000 congestion-cost score per violation (time × junction × severity × stacking) |
| **M3 — Dispatch** | Live priority queue ranking junctions and mid-block zones by aggregate congestion score |
| **M4 — Auto-Challan** | Structured challan records for auto-validatable violations, ready for BTP's SCITA pipeline |
| **M5 — Driver Nudge** | Nearest legal parking suggestion simulation |
| **M6 — Hotspots** | Persistent hotspot escalation engine — Tier 1/2/3 escalation recommendations |

---

## Stack

- **Backend** — FastAPI, SQLAlchemy, SQLite, YOLOv8n (ultralytics), EasyOCR, pandas, scikit-learn
- **Frontend** — React + TypeScript (Vite), Framer Motion, Mapbox GL JS

---

## Setup

### Backend

```bash
cd app
pip install -r requirements.txt   # or pip install fastapi uvicorn ultralytics easyocr pandas sqlalchemy numpy opencv-python
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

On first startup, place the violations CSV in `data/` — the server loads it automatically into `violations_foundation`.

After loading, run:
```
POST http://localhost:8000/api/compute-scores
```
to compute congestion scores for all records (~17s).

### Frontend

```bash
cd laneshift-frontend
npm install
npm run dev        # dev server at localhost:5173
npm run build      # production build → dist/
```

---

## Data integrity

The original 298,450-row BTP dataset lives permanently in `violations_foundation` (SQLite). CSV uploads go to `violations_uploaded` (separate table, tagged with batch ID). The foundation is never modified by uploads. Foundation integrity is verified at every server startup.

---

## Key findings

- **61.23%** of all flagged violations never reach a resolved outcome
- **125,254 records** (42%) have no validation status — never entered the review pipeline
- **85.17%** of rejected/stuck violations meet all four auto-validation criteria
- **BTP051 - Safina Plaza Junction** recorded violations in all 23 weeks of the dataset
