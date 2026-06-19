/**
 * DetectionPage — /detect
 * Full-page CV detection demo.
 * - No Nav bar (standalone demo page)
 * - Top half: image/video upload → YOLOv8 detection + scoring
 * - Bottom half: CSV upload → full analytics dashboard
 */
import { useState, useCallback, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import DetectionUpload from '../components/DetectionUpload'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

const PIPELINE_STEPS = [
  { num: '01', label: 'Upload',   desc: 'Drop a parking photo, video, or CSV file' },
  { num: '02', label: 'Detect',   desc: 'YOLOv8n finds vehicles · videos sampled at 12 frames' },
  { num: '03', label: 'Classify', desc: 'Spatial heuristics infer violation type' },
  { num: '04', label: 'Score',    desc: 'Module 2 engine computes congestion-cost score' },
]

/* ── Types for CSV analytics result ─────────────────────────────────────── */
interface ViolationType { type: string; count: number; pct: number }
interface HourlyPoint   { hour: number; count: number }
interface MonthlyPoint  { month: string; count: number }
interface VehicleType   { type: string; count: number; pct: number }
interface Station       { station: string; count: number; rejection_rate_pct: number }
interface Junction      { junction: string; count: number }
interface ScoreBin      { range: string; count: number }
interface DispatchItem  {
  rank: number; location_name: string; police_station_jurisdiction: string
  aggregate_congestion_score: number; violation_count: number; recommended_action: string
}
interface LoadSummary {
  rows_in_file: number; rows_saved_to_batch: number
  columns_detected: Record<string, string>; columns_missing: string[]
  warnings: string[]; scores_computed: number; scoring_error: string | null
}
interface CsvResult {
  upload_received: boolean; filename: string; file_size_kb: number
  processing_time_seconds: number; upload_batch_id: string
  load_summary: LoadSummary
  kpi: {
    total_records: number; null_status_count: number; null_status_pct: number
    rejected_or_stuck: number; total_unresolved: number; unresolved_pct: number
    named_junction_pct: number
  }
  violation_types: ViolationType[]
  hourly_pattern: HourlyPoint[]
  monthly_trend: MonthlyPoint[]
  vehicle_types: VehicleType[]
  top_stations: Station[]
  top_junctions: Junction[]
  score_distribution: ScoreBin[]
  avg_score: number | null; max_score: number | null
  dispatch_queue: DispatchItem[]
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

function SLabel({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
      color: colors.captionGray, marginBottom: 14 }}>{children}</p>
  )
}

/* ── Mini chart components ───────────────────────────────────────────────── */
function HBar({ items, labelKey, valueKey, title }: {
  items: Record<string,any>[]; labelKey: string; valueKey: string; title: string
}) {
  if (!items.length) return null
  const max = Math.max(...items.map(x => Number(x[valueKey])), 1)
  return (
    <div style={{ marginBottom: 32 }}>
      <SLabel>{title}</SLabel>
      {items.slice(0, 8).map((item, i) => (
        <div key={i} style={{ marginBottom: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: i === 0 ? colors.amber : 'rgba(255,255,255,0.7)',
              maxWidth: '68%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item[labelKey]}
            </span>
            <span style={{ fontSize: 10, color: colors.captionGray }}>{Number(item[valueKey]).toLocaleString()}</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)' }}>
            <motion.div initial={{ width: 0 }}
              animate={{ width: `${(Number(item[valueKey]) / max) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.05 }}
              style={{ height: '100%', background: i === 0 ? colors.amber : 'rgba(255,255,255,0.3)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function HourlyChart({ data }: { data: HourlyPoint[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  const peak = data.reduce((a, b) => a.count > b.count ? a : b, data[0])
  return (
    <div style={{ marginBottom: 32 }}>
      <SLabel>Violations by Hour (IST) · Peak: {peak.hour}:00</SLabel>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 56 }}>
        {data.map(d => (
          <div key={d.hour} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
            <motion.div initial={{ height: 0 }}
              animate={{ height: `${(d.count / max) * 48}px` }}
              transition={{ duration: 0.5, ease: EASE, delay: d.hour * 0.015 }}
              style={{ width: '100%', background: d.hour === peak.hour ? colors.amber : 'rgba(255,255,255,0.25)', minHeight: d.count > 0 ? 2 : 0 }} />
            {d.hour % 6 === 0 && <span style={{ fontSize: 7, color: colors.captionGray }}>{d.hour}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

function MonthlyChart({ data }: { data: MonthlyPoint[] }) {
  if (!data.length) return null
  const max = Math.max(...data.map(d => d.count), 1)
  return (
    <div style={{ marginBottom: 32 }}>
      <SLabel>Monthly Trend</SLabel>
      {data.map((d, i) => (
        <div key={d.month} style={{ marginBottom: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)' }}>{d.month}</span>
            <span style={{ fontSize: 10, color: colors.captionGray }}>{d.count.toLocaleString()}</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.07)' }}>
            <motion.div initial={{ width: 0 }}
              animate={{ width: `${(d.count / max) * 100}%` }}
              transition={{ duration: 0.7, ease: EASE, delay: i * 0.08 }}
              style={{ height: '100%', background: 'rgba(255,255,255,0.3)' }} />
          </div>
        </div>
      ))}
    </div>
  )
}

function LoadBanner({ summary }: { summary: LoadSummary }) {
  const displayW = summary.warnings.filter(w =>
    w.includes('duplicate') || w.includes('Duplicate') || w.includes('No violation_type')
  )
  const dbFailed = summary.rows_saved_to_batch === 0 && summary.rows_in_file > 0
  const hasIssues = dbFailed || displayW.length > 0
  return (
    <div style={{ padding: '12px 16px', marginBottom: 24,
      background: hasIssues ? 'rgba(248,81,73,0.06)' : 'rgba(255,199,0,0.06)',
      border: `1px solid ${hasIssues ? 'rgba(248,81,73,0.25)' : 'rgba(255,199,0,0.2)'}` }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: hasIssues ? '#f85149' : colors.amber, marginBottom: 6 }}>
        {dbFailed ? '⚠ Analytics Computed From Memory' : hasIssues ? 'Load Complete — Notes Below' : '✓ Data Loaded Successfully'}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Rows: <strong style={{ color: colors.white }}>{summary.rows_in_file.toLocaleString()}</strong></span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Saved: <strong style={{ color: dbFailed ? '#f85149' : colors.white }}>{summary.rows_saved_to_batch.toLocaleString()}</strong></span>
        {summary.scores_computed > 0 && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Scored: <strong style={{ color: colors.white }}>{summary.scores_computed.toLocaleString()}</strong></span>}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)' }}>Columns mapped: <strong style={{ color: colors.white }}>{Object.keys(summary.columns_detected).length}</strong></span>
      </div>
      {displayW.map((w, i) => <p key={i} style={{ fontSize: 10, color: '#f85149', marginTop: 4 }}>⚠ {w}</p>)}
    </div>
  )
}

/* ── CSV upload section ──────────────────────────────────────────────────── */
function CsvUploadSection() {
  const [result,   setResult]   = useState<CsvResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const isCsv   = file.name.toLowerCase().endsWith('.csv') || file.type.includes('csv')
    const isExcel = !!file.name.toLowerCase().match(/\.xlsx?$/)
    if (!isCsv && !isExcel) {
      setError('Upload a CSV or Excel (.xlsx) file.')
      return
    }
    if (file.size > 50 * 1024 * 1024) { setError('Max 50 MB.'); return }
    setFileName(file.name); setLoading(true); setError(null); setResult(null)
    const form = new FormData()
    form.append('file', file)
    try {
      const resp = await fetch(`${API_BASE}/api/upload/csv`, { method: 'POST', body: form })
      if (!resp.ok) { const b = await resp.json().catch(() => ({})); throw new Error(b.detail || `HTTP ${resp.status}`) }
      setResult(await resp.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally { setLoading(false) }
  }, [])

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]; if (f) handleFile(f)
  }

  return (
    <section style={{ padding: 'clamp(40px, 5vw, 64px) clamp(24px, 6vw, 120px)',
      borderTop: '1px solid rgba(255,255,255,0.07)' }}>
      <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase',
          color: colors.amber, marginBottom: 12 }}>
        Upload Your Data — CSV / Excel
      </motion.p>
      <motion.h2 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: EASE, delay: 0.05 }}
        style={{ fontSize: 'clamp(24px, 4vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em',
          lineHeight: 0.95, marginBottom: 14 }}>
        UPLOAD &amp; <span style={{ color: colors.amber }}>ANALYSE.</span>
      </motion.h2>
      <p style={{ fontSize: 'clamp(13px, 1.4vw, 15px)', color: 'rgba(255,255,255,0.5)',
        maxWidth: 520, lineHeight: 1.65, marginBottom: 24 }}>
        Upload any violations CSV and get the full LaneShift analytics dashboard — violation breakdown,
        hourly patterns, station rankings, dispatch queue — computed from your data.
        The original 298,450-row dataset is permanent and unaffected by uploads.
      </p>

      {/* Drop zone */}
      <div onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button" tabIndex={0} aria-label="Upload CSV file"
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        style={{ border: `1.5px dashed ${dragging ? colors.amber : 'rgba(255,255,255,0.15)'}`,
          padding: 'clamp(24px, 3vw, 40px) 24px', textAlign: 'center', cursor: 'pointer',
          background: dragging ? 'rgba(255,199,0,0.03)' : 'transparent',
          transition: 'all 0.18s', userSelect: 'none', marginBottom: 8 }}>
        <input ref={inputRef} type="file" accept=".csv,.xlsx,.xls,text/csv"
          onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = '' }}
          style={{ display: 'none' }} aria-hidden="true" />
        {loading ? (
          <div>
            <motion.div animate={{ rotate: 360 }} transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ width: 28, height: 28, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.1)',
                borderTop: `2px solid ${colors.amber}`, borderRadius: '50%' }} />
            <p style={{ fontSize: 11, fontWeight: 700, color: colors.captionGray, letterSpacing: '0.12em' }}>
              PROCESSING {fileName ?? ''}…
            </p>
          </div>
        ) : (
          <>
            <p style={{ fontSize: 13, fontWeight: 700, color: colors.white, marginBottom: 4 }}>
              {fileName ? 'Upload another CSV' : 'Drop CSV / Excel here or click to browse'}
            </p>
            <p style={{ fontSize: 10, color: colors.captionGray }}>CSV · XLSX · max 50 MB</p>
          </>
        )}
      </div>

      <AnimatePresence>
        {error && <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          style={{ marginTop: 8, fontSize: 11, color: '#f85149', fontWeight: 600 }}>✕ {error}</motion.p>}
      </AnimatePresence>

      {loading && <div style={{ marginTop: 20 }}>{[1,2,3,4,5].map(i => <Skeleton key={i} h={i===1?16:10} />)}</div>}

      <AnimatePresence>
        {result && !loading && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE }} style={{ marginTop: 24 }}>
            <LoadBanner summary={result.load_summary} />

            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
              gap: 0, border: '1px solid rgba(255,255,255,0.07)', marginBottom: 32 }}>
              {[
                { l: 'Total Records',     v: result.kpi.total_records.toLocaleString(),     a: false },
                { l: 'Unresolved %',      v: `${result.kpi.unresolved_pct}%`,               a: true  },
                { l: 'Null-Status',       v: result.kpi.null_status_count.toLocaleString(), a: false },
                { l: 'Rejected/Stuck',    v: result.kpi.rejected_or_stuck.toLocaleString(), a: false },
                { l: 'Scored',            v: result.load_summary.scores_computed.toLocaleString(), a: false },
              ].map((c, i) => (
                <div key={c.l} style={{ padding: '16px 14px',
                  borderRight: i < 4 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
                  <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
                    color: colors.captionGray, marginBottom: 6 }}>{c.l}</p>
                  <p style={{ fontSize: 'clamp(18px, 2.5vw, 28px)', fontWeight: 900, letterSpacing: '-0.03em',
                    color: c.a ? colors.amber : colors.white, lineHeight: 1 }}>{c.v}</p>
                </div>
              ))}
            </div>

            {/* Two-column charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(24px, 3vw, 48px)' }}>
              <div>
                <HBar items={result.violation_types} labelKey="type" valueKey="count" title="Top Violation Types" />
                <HourlyChart data={result.hourly_pattern} />
                <MonthlyChart data={result.monthly_trend} />
              </div>
              <div>
                <HBar items={result.top_stations} labelKey="station" valueKey="count" title="Top Stations by Volume" />
                <HBar items={result.vehicle_types} labelKey="type" valueKey="count" title="Vehicle Types" />
                <HBar items={result.top_junctions} labelKey="junction" valueKey="count" title="Top Junctions" />
              </div>
            </div>

            {/* Dispatch queue */}
            {result.dispatch_queue.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <SLabel>Dispatch Priority Queue — Uploaded Data</SLabel>
                <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 130px',
                  padding: '6px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  {['#','LOCATION','SCORE','COUNT','ACTION'].map(h => (
                    <span key={h} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', color: colors.captionGray }}>{h}</span>
                  ))}
                </div>
                {result.dispatch_queue.map((item, i) => (
                  <motion.div key={item.rank} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.04, ease: EASE }}
                    style={{ display: 'grid', gridTemplateColumns: '28px 1fr 80px 70px 130px',
                      padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      alignItems: 'center',
                      background: item.recommended_action === 'Dispatch immediately' ? 'rgba(255,199,0,0.03)' : 'transparent' }}>
                    <span style={{ fontSize: 9, fontWeight: 800, color: colors.captionGray }}>{String(item.rank).padStart(2,'0')}</span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: colors.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.location_name}</p>
                      <p style={{ fontSize: 9, color: colors.captionGray }}>{item.police_station_jurisdiction}</p>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 900, color: scoreColor(item.aggregate_congestion_score / 100), letterSpacing: '-0.02em' }}>{item.aggregate_congestion_score.toLocaleString()}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{item.violation_count}</span>
                    <span style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: item.recommended_action === 'Dispatch immediately' ? colors.amber : 'rgba(255,255,255,0.4)' }}>
                      {item.recommended_action}
                    </span>
                  </motion.div>
                ))}
              </div>
            )}

            <p style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
              Batch ID: {result.upload_batch_id} · {result.filename} · {result.file_size_kb} KB · {result.processing_time_seconds}s
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function DetectionPage() {
  useEffect(() => { window.scrollTo(0, 0) }, [])

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* ── Hero header ─────────────────────────────────────────── */}
        <section style={{
          padding: 'clamp(48px, 7vw, 96px) clamp(24px, 6vw, 120px) 40px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE }}
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase',
            color: colors.amber, marginBottom: 14 }}>
          Module 01 — Detection-to-Decision Engine
        </motion.p>

        <motion.h1 initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.06 }}
          style={{ fontSize: 'clamp(36px, 6vw, 96px)', fontWeight: 900, letterSpacing: '-0.03em',
            lineHeight: 0.95, marginBottom: 20 }}>
          DETECTION<br /><span style={{ color: colors.amber }}>DEMO.</span>
        </motion.h1>

        <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
          style={{ fontSize: 'clamp(14px, 1.6vw, 18px)', color: 'rgba(255,255,255,0.6)',
            maxWidth: 560, lineHeight: 1.7, marginBottom: 36 }}>
          Upload a parking photo or video. YOLOv8n detects vehicles (videos are sampled
          across 12 frames), spatial analysis infers the violation type, and the real
          scoring engine produces the congestion-cost priority score.
        </motion.p>

        {/* Pipeline steps */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: EASE, delay: 0.18 }}
          style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
          {PIPELINE_STEPS.map((step, i) => (
            <div key={step.num} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ padding: '14px 20px', border: '1px solid rgba(255,255,255,0.1)', minWidth: 160 }}>
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: colors.amber, display: 'block', marginBottom: 4 }}>{step.num}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: colors.white, display: 'block', marginBottom: 3 }}>{step.label}</span>
                <span style={{ fontSize: 10, color: colors.captionGray, lineHeight: 1.5 }}>{step.desc}</span>
              </div>
              {i < PIPELINE_STEPS.length - 1 && (
                <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.15)', padding: '0 4px' }}>→</span>
              )}
            </div>
          ))}
        </motion.div>
      </section>

      {/* ── Image / Video upload ────────────────────────────────── */}
      <section style={{ padding: 'clamp(40px, 5vw, 64px) clamp(24px, 6vw, 120px)' }}>
        <DetectionUpload />
      </section>

      {/* ── Disclaimer ─────────────────────────────────────────── */}
      <section style={{ padding: '24px clamp(24px, 6vw, 120px) 0',
        borderTop: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 680, display: 'flex', gap: 16 }}>
          <div style={{ width: 2, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }} />
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.75 }}>
            Vehicle detection uses YOLOv8n (COCO pre-trained, runs locally). Videos are sampled
            at 12 evenly-spaced frames — the frame with the most vehicles detected is used for
            annotation and scoring. Violation type uses spatial heuristics. Scoring engine is
            the real Module 2 implementation.
          </p>
        </div>
      </section>

      {/* ── CSV upload & analytics ──────────────────────────────── */}
      <CsvUploadSection />

      <Footer />
      </main>
    </>
  )
}
