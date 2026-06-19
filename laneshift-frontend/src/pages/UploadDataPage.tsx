/**
 * UploadDataPage — /upload
 * Upload a CSV or video file and get a full analytics report.
 *
 * CSV path  → full dashboard: violation types, hourly chart, monthly trend,
 *             top stations, top junctions, dispatch queue, KPI cards
 * Video path → YOLOv8 detection fallback (same as /detect page)
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

/* ── Types ──────────────────────────────────────────────────────────────── */
interface LoadSummary {
  rows_in_file: number
  rows_loaded_to_db: number
  columns_detected: Record<string, string>
  columns_missing: string[]
  warnings: string[]
  scores_computed: number
  scoring_error: string | null
}

interface ViolationType { type: string; count: number; pct: number }
interface HourlyPoint   { hour: number; count: number }
interface MonthlyPoint  { month: string; count: number }
interface VehicleType   { type: string; count: number; pct: number }
interface Station       { station: string; count: number; rejection_rate_pct: number }
interface Junction      { junction: string; count: number }
interface ScoreBin      { range: string; count: number }
interface DispatchItem  { rank: number; location_name: string; police_station_jurisdiction: string; aggregate_congestion_score: number; violation_count: number; recommended_action: string }

interface AnalyticsResult {
  upload_received: boolean
  filename: string
  file_size_kb: number
  processing_time_seconds: number
  load_summary: LoadSummary
  kpi: {
    total_records: number
    null_status_count: number
    null_status_pct: number
    rejected_or_stuck: number
    total_unresolved: number
    unresolved_pct: number
    named_junction_pct: number
  }
  violation_types:    ViolationType[]
  hourly_pattern:     HourlyPoint[]
  monthly_trend:      MonthlyPoint[]
  vehicle_types:      VehicleType[]
  top_stations:       Station[]
  top_junctions:      Junction[]
  score_distribution: ScoreBin[]
  avg_score:          number | null
  max_score:          number | null
  dispatch_queue:     DispatchItem[]
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function scoreColor(s: number) { return s >= 700 ? '#FF6B00' : s >= 400 ? colors.amber : colors.white }

function Skeleton({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.1, 0.25, 0.1] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      style={{ width: w, height: h, background: 'rgba(255,255,255,0.09)', marginBottom: 10 }}
    />
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
      color: colors.captionGray, marginBottom: 16 }}>
      {children}
    </p>
  )
}

/* ── KPI cards ───────────────────────────────────────────────────────────── */
function KpiGrid({ kpi, filename, fileSizeKb, processingTime, scoresComputed }: {
  kpi: AnalyticsResult['kpi']
  filename: string
  fileSizeKb: number
  processingTime: number
  scoresComputed: number
}) {
  const cards = [
    { label: 'Total Records',        value: kpi.total_records.toLocaleString(),       accent: false },
    { label: 'Unresolved / No Status', value: `${kpi.unresolved_pct}%`,              accent: true  },
    { label: 'Null-Status Records',   value: kpi.null_status_count.toLocaleString(),  accent: false },
    { label: 'Rejected / Stuck',      value: kpi.rejected_or_stuck.toLocaleString(), accent: false },
    { label: 'Named Junction %',      value: `${kpi.named_junction_pct}%`,            accent: false },
    { label: 'Scores Computed',       value: scoresComputed.toLocaleString(),          accent: false },
  ]
  return (
    <div>
      <SectionLabel>Dataset KPIs</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 0,
        border: '1px solid rgba(255,255,255,0.08)', marginBottom: 40 }}>
        {cards.map((c, i) => (
          <div key={c.label} style={{
            padding: '20px 18px',
            borderRight: i % 3 !== 2 ? '1px solid rgba(255,255,255,0.06)' : 'none',
            borderBottom: i < 3 ? '1px solid rgba(255,255,255,0.06)' : 'none',
          }}>
            <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              color: colors.captionGray, marginBottom: 8 }}>{c.label}</p>
            <p style={{ fontSize: 'clamp(22px, 3vw, 36px)', fontWeight: 900, letterSpacing: '-0.03em',
              color: c.accent ? colors.amber : colors.white, lineHeight: 1 }}>{c.value}</p>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginBottom: 32 }}>
        {filename} · {fileSizeKb} KB · processed in {processingTime}s
      </p>
    </div>
  )
}

/* ── Horizontal bar chart ────────────────────────────────────────────────── */
function HBarChart({ items, labelKey, valueKey, pctKey, title, accentFirst = true }: {
  items: Record<string, any>[]
  labelKey: string
  valueKey: string
  pctKey?: string
  title: string
  accentFirst?: boolean
}) {
  if (!items.length) return null
  const max = Math.max(...items.map(x => Number(x[valueKey])), 1)
  return (
    <div style={{ marginBottom: 40 }}>
      <SectionLabel>{title}</SectionLabel>
      {items.slice(0, 10).map((item, i) => (
        <div key={i} style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: i === 0 && accentFirst ? colors.amber : 'rgba(255,255,255,0.8)',
              maxWidth: '70%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item[labelKey]}
            </span>
            <span style={{ fontSize: 11, color: colors.captionGray }}>
              {Number(item[valueKey]).toLocaleString()}
              {pctKey ? ` (${item[pctKey]}%)` : ''}
            </span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.06 }}
              style={{ height: '100%', background: i === 0 && accentFirst ? colors.amber : 'rgba(255,255,255,0.35)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Hourly sparkline ────────────────────────────────────────────────────── */
function HourlyChart({ data }: { data: HourlyPoint[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  const peakHour = data.reduce((a, b) => a.count > b.count ? a : b, data[0])
  return (
    <div style={{ marginBottom: 40 }}>
      <SectionLabel>Violations by Hour (IST)</SectionLabel>
      <p style={{ fontSize: 10, color: colors.captionGray, marginBottom: 12 }}>
        Peak: {peakHour.hour}:00 — {peakHour.count.toLocaleString()} violations
      </p>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 64 }}>
        {data.map((d) => (
          <div key={d.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${(d.count / max) * 56}px` }}
              transition={{ duration: 0.6, ease: EASE, delay: d.hour * 0.02 }}
              style={{
                width: '100%',
                background: d.hour === peakHour.hour ? colors.amber : 'rgba(255,255,255,0.3)',
                minHeight: d.count > 0 ? 2 : 0,
              }}
            />
            {d.hour % 4 === 0 && (
              <span style={{ fontSize: 7, color: colors.captionGray }}>{d.hour}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Monthly trend bars ──────────────────────────────────────────────────── */
function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ marginBottom: 40 }}>
      <SectionLabel>Monthly Trend</SectionLabel>
      {data.map((d, i) => (
        <div key={d.month} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)' }}>{d.month}</span>
            <span style={{ fontSize: 10, color: colors.captionGray }}>{d.count.toLocaleString()}</span>
          </div>
          <div style={{ height: 4, background: 'rgba(255,255,255,0.07)' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
              style={{ height: '100%', background: 'rgba(255,255,255,0.35)' }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Dispatch queue ──────────────────────────────────────────────────────── */
function DispatchQueue({ items }: { items: DispatchItem[] }) {
  if (!items.length) return null
  return (
    <div style={{ marginBottom: 40 }}>
      <SectionLabel>Live Dispatch Priority Queue</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 140px',
        padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {['#','LOCATION','SCORE','COUNT','ACTION'].map(h => (
          <span key={h} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: colors.captionGray }}>{h}</span>
        ))}
      </div>
      {items.map((item, i) => (
        <motion.div key={item.rank}
          initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.04, ease: EASE }}
          style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 70px 140px',
            padding: '11px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
            background: item.recommended_action === 'Dispatch immediately' ? 'rgba(255,199,0,0.03)' : 'transparent',
            alignItems: 'center' }}>
          <span style={{ fontSize: 9, fontWeight: 800, color: colors.captionGray }}>{String(item.rank).padStart(2,'0')}</span>
          <div style={{ paddingRight: 6, minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: colors.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 1 }}>
              {item.location_name}
            </p>
            <p style={{ fontSize: 9, color: colors.captionGray }}>{item.police_station_jurisdiction}</p>
          </div>
          <span style={{ fontSize: 12, fontWeight: 900, letterSpacing: '-0.02em',
            color: item.aggregate_congestion_score > 600 ? colors.amber : colors.white }}>
            {item.aggregate_congestion_score.toLocaleString()}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{item.violation_count.toLocaleString()}</span>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase',
            color: item.recommended_action === 'Dispatch immediately' ? colors.amber : 'rgba(255,255,255,0.5)' }}>
            {item.recommended_action}
          </span>
        </motion.div>
      ))}
    </div>
  )
}

/* ── Load summary banner ─────────────────────────────────────────────────── */
function LoadBanner({ summary }: { summary: LoadSummary }) {
  // Only show real user-facing warnings (dedupe notice, missing column notice)
  // Never show raw SQL errors or internal tracebacks
  const displayWarnings = summary.warnings.filter(w =>
    // Show duplicate warning and missing-column warning — skip SQL internals
    w.includes('duplicate') || w.includes('Duplicate') ||
    w.includes('No violation_type') || w.includes('column')
  )
  const dbFailed = summary.rows_loaded_to_db === 0 && summary.rows_in_file > 0
  const hasIssues = dbFailed || displayWarnings.length > 0

  return (
    <div style={{ padding: '14px 18px', marginBottom: 32,
      background: hasIssues ? 'rgba(248,81,73,0.06)' : 'rgba(255,199,0,0.06)',
      border: `1px solid ${hasIssues ? 'rgba(248,81,73,0.25)' : 'rgba(255,199,0,0.2)'}` }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        color: hasIssues ? '#f85149' : colors.amber, marginBottom: 8 }}>
        {dbFailed ? '⚠ DB Write Failed — Analytics Computed From Memory'
          : hasIssues ? 'Load Complete — Check Notes Below'
          : '✓ Data Loaded Successfully'}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, marginBottom: displayWarnings.length > 0 ? 10 : 0 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          Rows in file: <strong style={{ color: colors.white }}>{summary.rows_in_file.toLocaleString()}</strong>
        </span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          Loaded to DB: <strong style={{ color: dbFailed ? '#f85149' : colors.white }}>{summary.rows_loaded_to_db.toLocaleString()}</strong>
        </span>
        {summary.scores_computed > 0 && (
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
            Scored: <strong style={{ color: colors.white }}>{summary.scores_computed.toLocaleString()}</strong>
          </span>
        )}
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)' }}>
          Columns mapped: <strong style={{ color: colors.white }}>{Object.keys(summary.columns_detected).length}</strong>
        </span>
      </div>
      {displayWarnings.map((w, i) => (
        <p key={i} style={{ fontSize: 10, color: '#f85149', lineHeight: 1.6, marginTop: 4 }}>⚠ {w}</p>
      ))}
      {dbFailed && (
        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 6, lineHeight: 1.5 }}>
          Analytics below are computed directly from the uploaded file. Dispatch queue requires DB load to succeed.
        </p>
      )}
    </div>
  )
}

/* ── Full analytics dashboard ────────────────────────────────────────────── */
function AnalyticsDashboard({ result }: { result: AnalyticsResult }) {
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }} style={{ marginTop: 32 }}>

      <LoadBanner summary={result.load_summary} />

      <KpiGrid
        kpi={result.kpi}
        filename={result.filename}
        fileSizeKb={result.file_size_kb}
        processingTime={result.processing_time_seconds}
        scoresComputed={result.load_summary.scores_computed}
      />

      {/* Main two-column grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'clamp(32px, 4vw, 64px)' }}>

        {/* Left column */}
        <div>
          <HBarChart
            items={result.violation_types}
            labelKey="type" valueKey="count" pctKey="pct"
            title="Top Violation Types"
          />
          <HourlyChart data={result.hourly_pattern} />
          <MonthlyChart data={result.monthly_trend} />
        </div>

        {/* Right column */}
        <div>
          <HBarChart
            items={result.top_stations}
            labelKey="station" valueKey="count"
            title="Top Police Stations by Volume"
            accentFirst={false}
          />
          {result.top_stations.length > 0 && (
            <div style={{ marginBottom: 40 }}>
              <SectionLabel>Station Rejection Rates</SectionLabel>
              {result.top_stations.slice(0, 8).map((s, i) => (
                <div key={s.station} style={{ display: 'flex', justifyContent: 'space-between',
                  padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.75)' }}>{s.station}</span>
                  <span style={{ fontSize: 11, fontWeight: 700,
                    color: s.rejection_rate_pct > 35 ? '#f85149' : colors.captionGray }}>
                    {s.rejection_rate_pct.toFixed(1)}% rejected
                  </span>
                </div>
              ))}
            </div>
          )}
          <HBarChart
            items={result.vehicle_types}
            labelKey="type" valueKey="count" pctKey="pct"
            title="Vehicle Types"
            accentFirst={false}
          />
          <HBarChart
            items={result.top_junctions}
            labelKey="junction" valueKey="count"
            title="Top Junctions"
            accentFirst={false}
          />
        </div>
      </div>

      {/* Full-width dispatch queue */}
      <DispatchQueue items={result.dispatch_queue} />

      {/* Score distribution if available */}
      {result.score_distribution.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <SectionLabel>Congestion Score Distribution (0–1000)</SectionLabel>
          {result.avg_score !== null && (
            <p style={{ fontSize: 11, color: colors.captionGray, marginBottom: 12 }}>
              Average: <strong style={{ color: colors.amber }}>{result.avg_score}</strong>
              {result.max_score !== null && <>  ·  Max: <strong style={{ color: colors.white }}>{result.max_score}</strong></>}
            </p>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 80 }}>
            {result.score_distribution.map((bin, i) => {
              const maxBin = Math.max(...result.score_distribution.map(b => b.count), 1)
              return (
                <div key={bin.range} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${(bin.count / maxBin) * 64}px` }}
                    transition={{ duration: 0.6, ease: EASE, delay: i * 0.05 }}
                    style={{ width: '100%', background: i >= 6 ? colors.amber : 'rgba(255,255,255,0.3)', minHeight: bin.count > 0 ? 2 : 0 }}
                  />
                  <span style={{ fontSize: 7, color: colors.captionGray, writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                    {bin.range}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </motion.div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────── */
export default function UploadDataPage() {
  const [result,   setResult]   = useState<AnalyticsResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const [progress, setProgress] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { window.scrollTo(0, 0) }, [])

  const handleFile = useCallback(async (file: File) => {
    const isCsv   = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')
    const isExcel = file.name.toLowerCase().match(/\.xlsx?$/)
    const isVideo = file.type.startsWith('video/')

    if (!isCsv && !isExcel && !isVideo) {
      setError(`Unsupported file. Upload a CSV, Excel (.xlsx), MP4, or MOV file.`)
      return
    }
    if (file.size > 100 * 1024 * 1024) {
      setError('File too large. Maximum 100 MB.')
      return
    }

    setFileName(file.name)
    setLoading(true)
    setError(null)
    setResult(null)
    setProgress('Uploading…')

    const form = new FormData()
    form.append('file', file)

    const endpoint = (isCsv || isExcel)
      ? `${API_BASE}/api/upload/csv`
      : `${API_BASE}/api/detect/simulate`

    try {
      if (isCsv || isExcel) setProgress('Loading data into database…')
      const resp = await fetch(endpoint, { method: 'POST', body: form })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${resp.status}`)
      }
      const data = await resp.json()
      setResult(data)
      setProgress(null)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* Header */}
        <section style={{ padding: 'clamp(64px, 8vw, 100px) clamp(24px, 6vw, 120px) 40px',
          borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
              color: colors.amber, marginBottom: 14 }}>
            Upload Your Data
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
            style={{ fontSize: 'clamp(36px, 6vw, 80px)', fontWeight: 900, letterSpacing: '-0.03em',
              lineHeight: 0.95, marginBottom: 20 }}>
            UPLOAD & <br/><span style={{ color: colors.amber }}>ANALYSE.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
            style={{ fontSize: 'clamp(14px, 1.5vw, 17px)', color: 'rgba(255,255,255,0.55)',
              maxWidth: 560, lineHeight: 1.7, marginBottom: 0 }}>
            Upload a <strong style={{ color: colors.white }}>CSV or Excel file</strong> of parking violations
            and get the full LaneShift analytics dashboard — violation breakdown, hourly patterns,
            station rankings, dispatch queue — all computed from your data.
            Or upload a <strong style={{ color: colors.white }}>video/image</strong> for vehicle detection.
          </motion.p>
        </section>

        {/* Upload area + results */}
        <section style={{ padding: 'clamp(40px, 5vw, 72px) clamp(24px, 6vw, 120px)' }}>

          {/* Drop zone */}
          <div
            onClick={() => inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            role="button" tabIndex={0} aria-label="Upload data file"
            onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
            style={{
              border: `1.5px dashed ${dragging ? colors.amber : 'rgba(255,255,255,0.18)'}`,
              padding: 'clamp(32px, 5vw, 56px) 28px',
              textAlign: 'center', cursor: 'pointer',
              background: dragging ? 'rgba(255,199,0,0.04)' : 'rgba(255,255,255,0.01)',
              transition: 'all 0.18s', userSelect: 'none', marginBottom: 8,
            }}>
            <input ref={inputRef} type="file"
              accept=".csv,.xlsx,.xls,text/csv,video/mp4,video/quicktime,image/jpeg,image/png"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
              style={{ display: 'none' }} aria-hidden="true" />

            {loading ? (
              <div>
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
                  style={{ width: 32, height: 32, margin: '0 auto 14px',
                    border: '2px solid rgba(255,255,255,0.1)', borderTop: `2px solid ${colors.amber}`,
                    borderRadius: '50%' }} />
                <p style={{ fontSize: 13, fontWeight: 700, color: colors.white, marginBottom: 4 }}>
                  {progress ?? 'Processing…'}
                </p>
                <p style={{ fontSize: 10, color: colors.captionGray }}>
                  Large datasets may take 20–40 seconds for scoring
                </p>
              </div>
            ) : (
              <>
                <svg width="40" height="40" viewBox="0 0 40 40" fill="none" style={{ margin: '0 auto 14px', display: 'block' }} aria-hidden="true">
                  <rect x="2" y="2" width="36" height="36" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                  <line x1="20" y1="28" x2="20" y2="12" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round"/>
                  <polyline points="12,20 20,12 28,20" stroke="rgba(255,255,255,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  <line x1="12" y1="30" x2="28" y2="30" stroke="rgba(255,255,255,0.3)" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <p style={{ fontSize: 14, fontWeight: 700, color: colors.white, marginBottom: 6 }}>
                  {fileName ? 'Upload another file' : 'Drop your file here or click to browse'}
                </p>
                <p style={{ fontSize: 11, color: colors.captionGray, lineHeight: 1.6 }}>
                  CSV · Excel (.xlsx) · MP4 · MOV · JPG · PNG · max 100 MB
                </p>
              </>
            )}
          </div>

          <AnimatePresence>
            {error && (
              <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ marginTop: 12, fontSize: 12, color: '#f85149', fontWeight: 600 }}>
                ✕ {error}
              </motion.p>
            )}
          </AnimatePresence>

          {loading && (
            <div style={{ marginTop: 32 }}>
              {[1,2,3,4,5].map(i => <Skeleton key={i} h={i === 1 ? 20 : 10} />)}
            </div>
          )}

          <AnimatePresence>
            {result && !loading && 'kpi' in result && (
              <AnalyticsDashboard result={result as AnalyticsResult} />
            )}
          </AnimatePresence>
        </section>
      </main>
      <Footer />
    </>
  )
}
