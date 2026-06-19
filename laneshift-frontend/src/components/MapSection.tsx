/**
 * MapSection — Part 5: Live Map + Forecast View
 * BUILD 1: Dark Mapbox GL map, Bengaluru centre
 * BUILD 2: Time-scrub historical playback with play/pause
 * BUILD 3: Forecast panel — top 5 stations, real accuracy number, disclaimer
 * BUILD 4: Fallbacks for missing token or offline backend
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import Map, { Source, Layer, NavigationControl, Popup } from 'react-map-gl'
import type { FeatureCollection, GeoJsonProperties, Geometry } from 'geojson'
import { motion, useInView } from 'framer-motion'
import 'mapbox-gl/dist/mapbox-gl.css'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

/* ── env token + style ─────────────────────────────────────────────────── */
const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN
const MAPBOX_STYLE = 'mapbox://styles/mapbox/dark-v11'
const TOKEN_VALID  = typeof MAPBOX_TOKEN === 'string' && MAPBOX_TOKEN.startsWith('pk.') && MAPBOX_TOKEN.length > 20

/* ── month config ──────────────────────────────────────────────────────── */
const MONTHS = [
  { label: 'NOV', value: '2023-11', display: 'NOVEMBER 2023' },
  { label: 'DEC', value: '2023-12', display: 'DECEMBER 2023' },
  { label: 'JAN', value: '2024-01', display: 'JANUARY 2024'  },
  { label: 'FEB', value: '2024-02', display: 'FEBRUARY 2024' },
  { label: 'MAR', value: '2024-03', display: 'MARCH 2024'    },
  { label: 'APR', value: '2024-04', display: 'APRIL 2024'    },
]

const EASE = [0.22, 1, 0.36, 1] as const

/* ── types ─────────────────────────────────────────────────────────────── */
interface MonthlySummary {
  month: string
  total_violations: number
  top_violation_type: string
}

interface ForecastStation {
  station: string
  forecasted_count: number
  lower_bound: number
  upper_bound: number
}

interface ForecastStationRaw {
  police_station: string
  days_ahead: number
  total_forecasted_violations: number
  forecast: { date: string; forecasted_count: number; lower_bound: number; upper_bound: number }[]
  backtest_accuracy: {
    mae: number
    mape_pct: number | null
    smape_pct: number | null
    accuracy_pct: number | null
    holdout_days: number
    trained_on_days: number
  }
  accuracy_pct: number | null
  scope_disclaimer: string
}

/* ── Mapbox circle layer style (data-driven colour by congestion_cost_score) */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const violationCircleLayer: any = {
  id: 'violations',
  type: 'circle',
  paint: {
    'circle-radius': [
      'interpolate', ['linear'], ['zoom'],
      10, 2.5,
      14, 5,
    ] as unknown as number,
    'circle-color': [
      'interpolate',
      ['linear'],
      ['coalesce', ['get', 'congestion_cost_score'], 0],
      0,    'rgba(255,255,255,0.25)',
      300,  'rgba(255,255,255,0.55)',
      600,  '#FFC700',
      1000, '#FF6B00',
    ] as unknown as string,
    'circle-opacity': 0.85,
    'circle-stroke-width': 0,
  },
}

/* ── skeleton pulse ────────────────────────────────────────────────────── */
function Skeleton({ width = '100%', height = 16 }: { width?: string | number; height?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.12, 0.28, 0.12] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width, height, background: 'rgba(255,255,255,0.10)', marginBottom: 10 }}
    />
  )
}

/* ── section-level scroll reveal hook ─────────────────────────────────── */
function useReveal() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px', amount: 0.08 })
  return { ref, inView }
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILD 4 — fallback when token is absent or backend is unreachable
══════════════════════════════════════════════════════════════════════════ */
function MapUnavailable({ reason }: { reason: 'token' | 'backend' }) {
  return (
    <div style={{
      width: '100%', height: 520,
      background: '#0a0a0a',
      border: '1px solid rgba(255,255,255,0.08)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      gap: 16,
    }}>
      {/* crosshair icon */}
      <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
        <line x1="24" y1="2"  x2="24" y2="46" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
        <line x1="2"  y1="24" x2="46" y2="24" stroke="rgba(255,255,255,0.12)" strokeWidth="1"/>
        <circle cx="24" cy="24" r="4" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"/>
      </svg>
      <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>
        MAP UNAVAILABLE
      </p>
      <p style={{ fontSize: 11, color: colors.captionGray, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
        {reason === 'token'
          ? 'No Mapbox token found. Add VITE_MAPBOX_TOKEN to your .env file and restart the dev server.'
          : 'Backend not connected. Start the FastAPI server at localhost:8000 to load geo data.'}
      </p>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILD 2 — Playback scrubber + month stat line
══════════════════════════════════════════════════════════════════════════ */
interface ScrubberProps {
  monthIndex: number
  playing: boolean
  summary: MonthlySummary | null
  loadingPoints: boolean
  onScrub: (i: number) => void
  onTogglePlay: () => void
}

function PlaybackScrubber({ monthIndex, playing, summary, loadingPoints, onScrub, onTogglePlay }: ScrubberProps) {
  const month = MONTHS[monthIndex]

  return (
    <div style={{ padding: '20px clamp(24px, 6vw, 120px) 28px', background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      {/* Month label + stat line */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 18, flexWrap: 'wrap' }}>
        {/* Play/pause button — prominent, left side */}
        <button
          onClick={onTogglePlay}
          aria-label={playing ? 'Pause playback' : 'Play through all 6 months'}
          style={{
            flexShrink: 0,
            width: 40, height: 40,
            background: playing ? colors.amber : colors.white,
            border: 'none',
            color: colors.black,
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.18s, transform 0.1s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.08)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)' }}
        >
          {playing
            ? <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
                <rect x="0" y="0" width="4" height="13"/>
                <rect x="7" y="0" width="4" height="13"/>
              </svg>
            : <svg width="11" height="13" viewBox="0 0 11 13" fill="currentColor">
                <polygon points="0,0 11,6.5 0,13"/>
              </svg>
          }
        </button>

        {/* Status text */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: '0.08em', color: colors.white }}>
              {month.display}
            </span>
            {playing && (
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.2em', color: colors.amber }}
              >
                ● PLAYING
              </motion.span>
            )}
          </div>
          {loadingPoints ? (
            <Skeleton width={200} height={9} />
          ) : summary ? (
            <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.captionGray }}>
              {summary.total_violations.toLocaleString()} VIOLATIONS — TOP: {summary.top_violation_type.toUpperCase()}
            </span>
          ) : (
            <span style={{ fontSize: 10, color: colors.captionGray }}>BACKEND OFFLINE</span>
          )}
        </div>
      </div>

      {/* Progress bar + month ticks */}
      <div style={{ position: 'relative' }}>
        <input
          type="range" min={0} max={MONTHS.length - 1} step={1} value={monthIndex}
          onChange={e => onScrub(Number(e.target.value))}
          style={{ width: '100%', accentColor: colors.amber, cursor: 'pointer', height: 4, marginBottom: 10 }}
        />

        {/* Month tick labels */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          {MONTHS.map((m, i) => (
            <div key={m.value} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}
              onClick={() => onScrub(i)}>
              <div style={{
                width: i === monthIndex ? 6 : 4,
                height: i === monthIndex ? 6 : 4,
                borderRadius: '50%',
                background: i === monthIndex ? colors.amber : 'rgba(255,255,255,0.2)',
                transition: 'all 0.25s',
              }} />
              <span style={{
                fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                color: i === monthIndex ? colors.amber : 'rgba(255,255,255,0.3)',
                transition: 'color 0.25s',
                userSelect: 'none',
              }}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILD 3 — Forecast panel sub-components
══════════════════════════════════════════════════════════════════════════ */

/** Single horizontal bar with uncertainty range behind it */
function ForecastBar({ station, forecastedCount, lowerBound, upperBound, maxCount, index, inView }: {
  station: string
  forecastedCount: number
  lowerBound: number
  upperBound: number
  maxCount: number
  index: number
  inView: boolean
}) {
  const mainPct  = (forecastedCount / maxCount) * 100
  const lowPct   = (lowerBound      / maxCount) * 100
  const highPct  = (upperBound      / maxCount) * 100

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 7 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: '#111', letterSpacing: '0.02em' }}>
          {station}
        </span>
        <span style={{ fontSize: 12, fontWeight: 800, color: '#111' }}>
          {forecastedCount.toLocaleString()}
          <span style={{ fontSize: 10, fontWeight: 500, marginLeft: 5, color: '#777' }}>
            ({lowerBound.toLocaleString()}–{upperBound.toLocaleString()})
          </span>
        </span>
      </div>

      {/* Track */}
      <div style={{ position: 'relative', height: 8, background: '#e8e8e8', borderRadius: 0 }}>
        {/* Uncertainty range — behind the main bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${highPct - lowPct}%` } : {}}
          transition={{ duration: 0.9, ease: EASE, delay: 0.1 * index }}
          style={{
            position: 'absolute', top: 0,
            left: `${lowPct}%`,
            height: '100%',
            background: 'rgba(255,199,0,0.35)',
          }}
        />
        {/* Main forecasted bar */}
        <motion.div
          initial={{ width: 0 }}
          animate={inView ? { width: `${mainPct}%` } : {}}
          transition={{ duration: 0.75, ease: EASE, delay: 0.1 * index + 0.12 }}
          style={{
            position: 'absolute', top: 0, left: 0, height: '100%',
            background: index === 0 ? '#FFC700' : '#222',
            opacity: index === 0 ? 1 : 1 - index * 0.12,
          }}
        />
      </div>
    </div>
  )
}

/** Full forecast panel */
function ForecastPanel({ inView }: { inView: boolean }) {
  const [daysAhead, setDaysAhead] = useState(14)
  const [inputVal,  setInputVal]  = useState('14')
  const [showCount, setShowCount] = useState(7)
  const [raw, setRaw]             = useState<ForecastStationRaw[]>([])
  const [loading, setLoading]     = useState(true)
  const [offline, setOffline]     = useState(false)

  const loadForecast = useCallback((days: number) => {
    setLoading(true)
    setOffline(false)
    const url = `${API_BASE}/api/forecast/all-stations/summary?days_ahead=${days}`
    fetch(url)
      .then(r => { if (!r.ok) throw new Error('not ok'); return r.json() })
      .then((json: ForecastStationRaw[]) => {
        console.log('[MapSection] Forecast loaded for', days, 'days:', json)
        if (json.length > 0) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const q = (json[0] as any).model_quality ?? json[0].backtest_accuracy
          console.log('[MapSection] accuracy r2_pct:', q?.r2_pct, 'accuracy_pct:', json[0].accuracy_pct)
        }
        setRaw(json)
        setLoading(false)
      })
      .catch(() => { setOffline(true); setLoading(false) })
  }, [])

  useEffect(() => { loadForecast(daysAhead) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const n = Math.max(1, Math.min(30, parseInt(inputVal) || 14))
    setInputVal(String(n))
    setDaysAhead(n)
    loadForecast(n)
  }

  const topN = raw.slice(0, showCount)
  const stations: ForecastStation[] = topN.map(r => ({
    station:          r.police_station,
    forecasted_count: r.total_forecasted_violations,
    lower_bound:      r.forecast.reduce((s, d) => s + d.lower_bound, 0),
    upper_bound:      r.forecast.reduce((s, d) => s + d.upper_bound, 0),
  }))
  const maxCount    = stations[0]?.forecasted_count ?? 1
  const backtest    = topN[0]?.backtest_accuracy ?? null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const modelQuality = (topN[0] as any)?.model_quality ?? null
  // r2_pct from model_quality (new field) with fallback to accuracy_pct
  const accuracyPct = modelQuality?.r2_pct ?? topN[0]?.accuracy_pct ?? null
  const disclaimer  = topN[0]?.scope_disclaimer ?? ''

  return (
    <div style={{
      marginTop: 0,
      padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)',
      background: colors.white,
      borderTop: `4px solid ${colors.black}`,
    }}>
      {/* Label */}
      <motion.p
        initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.45, ease: EASE }}
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#555', marginBottom: 16 }}
      >
        Predictive Enforcement · Holt-Winters Forecast · Full Dataset Trained
      </motion.p>

      {/* Headline */}
      <motion.h2
        initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
        style={{ fontSize: 'clamp(26px, 4vw, 56px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, color: colors.black, marginBottom: 12 }}
      >
        WHAT COMES NEXT.
      </motion.h2>

      {/* Subhead */}
      <motion.p
        initial={{ opacity: 0, y: 14 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
        style={{ fontSize: 'clamp(13px, 1.4vw, 16px)', color: '#333', maxWidth: 540, lineHeight: 1.65, marginBottom: 28 }}
      >
        A trained forecasting model, backtested on real held-out data — not a guess.
      </motion.p>

      {/* ── Days-ahead input ────────────────────────────────────── */}
      <motion.form
        onSubmit={handleSubmit}
        initial={{ opacity: 0, y: 10 }} animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
        style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'clamp(32px, 4vw, 56px)', flexWrap: 'wrap' }}
      >
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>Forecast for</span>
        <input
          type="number" min={1} max={30} value={inputVal}
          onChange={e => setInputVal(e.target.value)}
          style={{
            width: 64, padding: '8px 10px',
            fontSize: 14, fontWeight: 800, color: '#111',
            border: '2px solid #111', background: '#fff',
            textAlign: 'center', outline: 'none',
            fontFamily: 'inherit',
          }}
        />
        <span style={{ fontSize: 12, fontWeight: 600, color: '#333' }}>days ahead</span>
        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '8px 20px',
            background: loading ? '#ccc' : '#111',
            color: '#fff', border: 'none', cursor: loading ? 'default' : 'pointer',
            fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            fontFamily: 'inherit', transition: 'background 0.15s',
          }}
        >
          {loading ? 'Loading…' : 'Run Forecast →'}
        </button>
        {!loading && raw.length > 0 && (
          <span style={{ fontSize: 11, color: '#555' }}>
            Showing {daysAhead}-day outlook · {showCount} stations
          </span>
        )}
      </motion.form>

      {/* Station count selector */}
      {raw.length > 0 && !loading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#555' }}>Show stations:</span>
          {[5, 7, 10, raw.length].map(n => (
            <button key={n}
              onClick={() => setShowCount(n)}
              style={{
                padding: '4px 14px', border: `1.5px solid ${showCount === n ? '#111' : '#ccc'}`,
                background: showCount === n ? '#111' : '#fff',
                color: showCount === n ? '#fff' : '#555',
                fontSize: 11, fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', transition: 'all 0.15s',
              }}
            >
              {n === raw.length ? `All (${n})` : `Top ${n}`}
            </button>
          ))}
        </div>
      )}

      {/* Chart area */}
      {loading ? (
        <div style={{ maxWidth: 560 }}>
          <Skeleton width="70%" height={12} />
          <Skeleton height={6} />
          <Skeleton width="85%" height={6} />
          <Skeleton width="60%" height={6} />
          <Skeleton width="75%" height={6} />
          <Skeleton width="50%" height={6} />
        </div>
      ) : offline ? (
        <div style={{
          padding: '28px 32px', border: '1px solid #e5e5e5', maxWidth: 480,
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#888' }}>
            FORECAST UNAVAILABLE
          </p>
          <p style={{ fontSize: 13, color: '#666', lineHeight: 1.6 }}>
            Backend not connected. Start the FastAPI server at localhost:8000 to load forecast data.
          </p>
        </div>
      ) : raw.length > 0 ? (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)',
          gap: 'clamp(40px, 5vw, 80px)',
          alignItems: 'start',
        }}>
          {/* LEFT col: bar chart + accuracy */}
          <div style={{ minWidth: 0 }}>
            <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#444', marginBottom: 24 }}>
              TOP {showCount} STATIONS — FORECASTED VIOLATIONS (NEXT {daysAhead} DAYS)
            </p>
            {stations.map((s, i) => (
              <ForecastBar
                key={s.station}
                station={s.station}
                forecastedCount={s.forecasted_count}
                lowerBound={s.lower_bound}
                upperBound={s.upper_bound}
                maxCount={maxCount}
                index={i}
                inView={inView}
              />
            ))}
          </div>

          {/* RIGHT col: legend + disclaimer — isolated stacking context prevents bar bleed-through */}
          <div style={{ minWidth: 0, paddingTop: 8, position: 'relative', zIndex: 1, isolation: 'isolate' }}>

            {/* Accuracy hero block — uses accuracy_pct from API directly */}
            {accuracyPct !== null && (
              <motion.div
                initial={{ opacity: 0, y: 12 }} animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ delay: 0.5, ease: EASE }}
                style={{ marginBottom: 24, padding: '28px 28px', background: '#000', position: 'relative', overflow: 'hidden' }}
              >
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: '#FFC700' }} />
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#FFC700', marginBottom: 10 }}>
                  Weekly Pattern Fit (R²)
                </p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 10 }}>
                  <span style={{ fontSize: 'clamp(48px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', color: '#FFC700', lineHeight: 1 }}>
                    {Math.round(accuracyPct)}%
                  </span>
                </div>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: 0 }}>
                  Model explains <strong style={{ color: '#FFC700' }}>{Math.round(accuracyPct)}%</strong> of weekly enforcement variation.
                  Trained on <strong style={{ color: '#fff' }}>{backtest?.trained_on_days ?? modelQuality?.trained_on_days} days</strong> of full historical data (Nov 2023 – Apr 2024).
                </p>
              </motion.div>
            )}

            {/* Legend box — static divs only, no animated children */}
            <div style={{ padding: '22px 24px', border: '1px solid #ddd', marginBottom: 20, background: '#fff', position: 'relative', zIndex: 1 }}>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#333', marginBottom: 14 }}>
                Legend — Uncertainty Range
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {/* Inline SVG rect avoids any CSS bleed from sibling motion divs */}
                  <svg width="36" height="8" style={{ flexShrink: 0 }}><rect width="36" height="8" fill="#FFC700"/></svg>
                  <span style={{ fontSize: 12, color: '#222', fontWeight: 500 }}>Forecasted count (point estimate)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <svg width="36" height="8" style={{ flexShrink: 0 }}><rect width="36" height="8" fill="rgba(255,199,0,0.42)"/></svg>
                  <span style={{ fontSize: 12, color: '#222', fontWeight: 500 }}>95% confidence range (lower – upper bound)</span>
                </div>
              </div>
            </div>

            {/* Scope disclaimer */}
            <p style={{ fontSize: 12, color: '#444', lineHeight: 1.75, fontWeight: 400 }}>
              {disclaimer}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   BUILD 1 + 2 — Map + playback block (the dark section)
══════════════════════════════════════════════════════════════════════════ */

/** Cache fetched GeoJSON + summary so we never re-fetch the same month */
const monthDataCache: Record<string, { geo: FeatureCollection<Geometry, GeoJsonProperties>; summary: MonthlySummary | null }> = {}

function MapBlock() {
  const [monthIndex, setMonthIndex]       = useState(0)
  const [playing, setPlaying]             = useState(false)
  const [geoData, setGeoData]             = useState<FeatureCollection<Geometry, GeoJsonProperties> | null>(null)
  const [summary, setSummary]             = useState<MonthlySummary | null>(null)
  const [initialLoading, setInitialLoading] = useState(true)  // only true on very first load
  const [backendOffline, setBackendOffline] = useState(false)
  const [hoverInfo, setHoverInfo] = useState<{
    longitude: number
    latitude: number
    location: string
    violation: string
    score: number | null
    station: string
    date: string | null
  } | null>(null)
  const playTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playingRef    = useRef(false)   // mirror of playing state accessible inside callbacks
  const monthIndexRef = useRef(0)       // mirror of monthIndex accessible inside callbacks

  /* ── Fetch one month, write to cache, return data ─────────────── */
  const fetchMonth = useCallback(async (idx: number) => {
    const month = MONTHS[idx]
    if (monthDataCache[month.value]) return monthDataCache[month.value]

    const [geoRes, sumRes] = await Promise.all([
      fetch(`${API_BASE}/api/geo/violation-points?month=${month.value}`),
      fetch(`${API_BASE}/api/geo/monthly-summary`),
    ])
    if (!geoRes.ok || !sumRes.ok) throw new Error('not ok')
    const geo: FeatureCollection<Geometry, GeoJsonProperties> = await geoRes.json()
    const sumAll: { months: MonthlySummary[] } = await sumRes.json()
    const sum = sumAll.months?.find(m => m.month === month.value) ?? null
    console.log(`[MapSection] Fetched ${month.value}: ${geo.features.length} pts`, sum)
    const entry = { geo, summary: sum }
    monthDataCache[month.value] = entry
    return entry
  }, [])

  /* ── Show a month (from cache if available, fetch if not) ──────── */
  const showMonth = useCallback(async (idx: number, isBackground = false) => {
    const month = MONTHS[idx]
    try {
      const entry = await fetchMonth(idx)
      // Only update visible state if this is the active month
      if (!isBackground) {
        setGeoData(entry.geo)
        setSummary(entry.summary)
        setMonthIndex(idx)
        monthIndexRef.current = idx
        setInitialLoading(false)
      }
    } catch {
      if (!isBackground) {
        setBackendOffline(true)
        setInitialLoading(false)
      }
    }
  }, [fetchMonth])

  /* ── Preload adjacent months silently ─────────────────────────── */
  const preloadAdjacent = useCallback((idx: number) => {
    const next = (idx + 1) % MONTHS.length
    const prev = (idx - 1 + MONTHS.length) % MONTHS.length
    showMonth(next, true)
    showMonth(prev, true)
  }, [showMonth])

  /* ── Auto-advance loop (timeout-based, not interval) ──────────── */
  const scheduleNext = useCallback(() => {
    if (playTimerRef.current) clearTimeout(playTimerRef.current)
    playTimerRef.current = setTimeout(() => {
      if (!playingRef.current) return
      const next = (monthIndexRef.current + 1) % MONTHS.length
      showMonth(next).then(() => {
        preloadAdjacent(next)
        if (playingRef.current) scheduleNext()
      })
    }, 4000)   // 4 seconds per month — enough time to read the stat line
  }, [showMonth, preloadAdjacent])

  /* ── Start playing ─────────────────────────────────────────────── */
  const startPlay = useCallback(() => {
    playingRef.current = true
    setPlaying(true)
    scheduleNext()
  }, [scheduleNext])

  /* ── Stop playing ──────────────────────────────────────────────── */
  const stopPlay = useCallback(() => {
    playingRef.current = false
    setPlaying(false)
    if (playTimerRef.current) clearTimeout(playTimerRef.current)
  }, [])

  /* ── Toggle ────────────────────────────────────────────────────── */
  const handleTogglePlay = useCallback(() => {
    if (playingRef.current) stopPlay()
    else startPlay()
  }, [startPlay, stopPlay])

  /* ── Hover handlers ────────────────────────────────────────────── */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = useCallback((e: any) => {
    const features = e.features
    if (features && features.length > 0) {
      const f = features[0]
      const props = f.properties ?? {}
      const coords = (f.geometry as { type: string; coordinates: number[] }).coordinates
      setHoverInfo({
        longitude: coords[0],
        latitude:  coords[1],
        location:  props.location || props.primary_violation || 'Unknown location',
        violation: props.primary_violation || 'Unknown',
        score:     props.congestion_cost_score !== undefined ? Number(props.congestion_cost_score) : null,
        station:   props.police_station || 'Unknown station',
        date:      props.date || null,
      })
    } else {
      setHoverInfo(null)
    }
  }, [])

  const handleMouseLeave = useCallback(() => {
    setHoverInfo(null)
  }, [])
  const handleScrub = useCallback((i: number) => {
    stopPlay()
    showMonth(i).then(() => preloadAdjacent(i))
  }, [stopPlay, showMonth, preloadAdjacent])

  /* ── On mount: load NOV, preload all 6 months, then auto-start ── */
  useEffect(() => {
    showMonth(0).then(() => {
      preloadAdjacent(0)
      // Preload all months in background
      MONTHS.forEach((_, i) => { if (i > 0) showMonth(i, true) })
      // Auto-start playback after initial load
      startPlay()
    })
    return () => {
      if (playTimerRef.current) clearTimeout(playTimerRef.current)
      playingRef.current = false
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ background: colors.black }}>
      {/* ── Section header ────────────────────────────────────────── */}
      <div style={{ padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px) 32px' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 14 }}>
          Historical Playback · Bengaluru BTP Dataset · Nov 2023 – Apr 2024
        </p>
        <h2 style={{ fontSize: 'clamp(26px, 4.5vw, 64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, color: colors.white, marginBottom: 10 }}>
          6 MONTHS.<br />
          <span style={{ color: colors.amber }}>EVERY VIOLATION, MAPPED.</span>
        </h2>
        <p style={{ fontSize: 'clamp(13px, 1.4vw, 16px)', color: colors.captionGray, maxWidth: 520, lineHeight: 1.65 }}>
          Scrub through the timeline or hit play to animate the full dataset. Each point is colour-coded by congestion-cost score — white is low, amber is high.
        </p>
      </div>

      {/* ── Map or fallback ───────────────────────────────────────── */}
      {!TOKEN_VALID ? (
        <div style={{ padding: '0 clamp(24px, 6vw, 120px) 0' }}>
          <MapUnavailable reason="token" />
        </div>
      ) : (
        <div style={{ position: 'relative' }}>
          {/* First-load skeleton — only shown before any data arrives */}
          {initialLoading && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(0,0,0,0.6)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <motion.div
                animate={{ opacity: [0.4, 1, 0.4] }}
                transition={{ duration: 1.2, repeat: Infinity }}
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.amber }}
              >
                LOADING
              </motion.div>
            </div>
          )}

          {/* Backend-offline banner overlay — shown on top of map if geo fetch fails */}
          {backendOffline && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 20,
              background: 'rgba(0,0,0,0.82)',
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 12,
            }}>
              <svg width="40" height="40" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                <circle cx="24" cy="24" r="22" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <line x1="24" y1="2"  x2="24" y2="46" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <line x1="2"  y1="24" x2="46" y2="24" stroke="rgba(255,255,255,0.15)" strokeWidth="1"/>
                <circle cx="24" cy="24" r="4" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5"/>
              </svg>
              <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.4)' }}>
                GEO DATA UNAVAILABLE
              </p>
              <p style={{ fontSize: 11, color: colors.captionGray, textAlign: 'center', maxWidth: 300, lineHeight: 1.6 }}>
                Backend not connected. Start the FastAPI server at localhost:8000 to load violation points.
              </p>
            </div>
          )}

          <Map
            mapboxAccessToken={MAPBOX_TOKEN}
            mapStyle={MAPBOX_STYLE}
            initialViewState={{
              latitude: 12.9716,
              longitude: 77.5946,
              zoom: 11,
              pitch: 0,
              bearing: 0,
            }}
            minZoom={4}
            maxZoom={18}
            style={{ width: '100%', height: 560 }}
            attributionControl={false}
            interactiveLayerIds={['violations']}
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
            cursor={hoverInfo ? 'crosshair' : 'grab'}
          >
            <NavigationControl
              position="bottom-right"
              style={{ background: '#111', borderRadius: 0, border: '1px solid rgba(255,255,255,0.12)' }}
            />

            {/* GeoJSON source + circle layer — NOT individual markers */}
            {geoData && (
              <Source id="violations" type="geojson" data={geoData}>
                <Layer {...violationCircleLayer} />
              </Source>
            )}

            {/* Hover popup */}
            {hoverInfo && (
              <Popup
                longitude={hoverInfo.longitude}
                latitude={hoverInfo.latitude}
                closeButton={false}
                closeOnClick={false}
                anchor="bottom"
                offset={12}
                style={{ zIndex: 50 }}
              >
                <div style={{
                  background: '#000',
                  color: '#fff',
                  padding: '12px 14px',
                  minWidth: 200,
                  maxWidth: 260,
                  fontFamily: "'Inter', system-ui, sans-serif",
                  boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  borderTop: `2px solid ${hoverInfo.score && hoverInfo.score > 500 ? '#FFC700' : 'rgba(255,255,255,0.4)'}`,
                }}>
                  {/* Violation type — primary */}
                  <p style={{ fontSize: 11, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#FFC700', margin: '0 0 6px' }}>
                    {hoverInfo.violation}
                  </p>

                  {/* Station name */}
                  <p style={{ fontSize: 12, fontWeight: 600, color: '#fff', margin: '0 0 8px', lineHeight: 1.4 }}>
                    {hoverInfo.station}
                  </p>

                  {/* Score + date row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                    {hoverInfo.score !== null ? (
                      <div>
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 2 }}>
                          Congestion Score
                        </span>
                        <span style={{
                          fontSize: 16, fontWeight: 900, letterSpacing: '-0.02em',
                          color: hoverInfo.score > 600 ? '#FFC700' : hoverInfo.score > 300 ? '#fff' : 'rgba(255,255,255,0.6)',
                        }}>
                          {Math.round(hoverInfo.score).toLocaleString()}
                        </span>
                      </div>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>No score</span>
                    )}

                    {hoverInfo.date && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 500 }}>
                        {hoverInfo.date}
                      </span>
                    )}
                  </div>
                </div>
              </Popup>
            )}
          </Map>
        </div>
      )}

      {/* ── Playback scrubber ─────────────────────────────────────── */}
      <PlaybackScrubber
        monthIndex={monthIndex}
        playing={playing}
        summary={summary}
        loadingPoints={false}
        onScrub={handleScrub}
        onTogglePlay={handleTogglePlay}
      />
    </div>
  )
}

/* ══════════════════════════════════════════════════════════════════════════
   Root export — assembles MapBlock (dark) + ForecastPanel (white)
══════════════════════════════════════════════════════════════════════════ */
export default function MapSection() {
  const { ref: forecastRef, inView: forecastIn } = useReveal()

  return (
    <section id="map">
      {/* ── BUILD 1 + 2: dark map + historical playback ─────────── */}
      <MapBlock />

      {/* ── BUILD 3: forecast panel (white bg, visually separated) ─ */}
      <div ref={forecastRef}>
        <ForecastPanel inView={forecastIn} />
      </div>
    </section>
  )
}
