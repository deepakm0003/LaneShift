/**
 * DetectionUpload — rebuilt
 * ══════════════════════════
 * Uploads an image → calls /api/detect/simulate → renders:
 *   1. Annotated image with YOLO bounding boxes + plate labels
 *   2. Captured number plates panel
 *   3. Full violation + scoring breakdown
 */

import { useState, useCallback, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

/* ── Types ──────────────────────────────────────────────────────────────── */
interface VehicleDetail {
  class: string
  class_id: number
  confidence: number
  bbox_pct: { x1: number; y1: number; x2: number; y2: number }
  plate: string | null
}

interface DetectionResult {
  upload_received: boolean
  filename: string
  file_size_kb: number
  detection_method: 'yolov8_cv' | 'statistical_fallback'
  simulated_detection: {
    violation_type: string
    vehicle_type: string
    vehicle_count: number
    detection_confidence: number
    inference_reasoning: string
    location: string
    junction_name: string
    hour_ist: number
    offence_code: number
    detected_objects: { class: string; confidence: number; bbox_pct: { x1: number; y1: number; x2: number; y2: number } }[]
    vehicle_details: VehicleDetail[]
    detected_plates: string[]
    annotated_image_b64: string
    context_signals: { traffic_signal_detected: boolean; person_count: number }
    confidence_note: string
  }
  congestion_cost_score: number
  score_breakdown: {
    time_of_day_weight: number
    junction_density_weight: number
    severity_weight: number
    stacking_multiplier: number
    methodology: string
  }
  disclosure: string
  production_note: string
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function scoreColor(s: number) { return s >= 700 ? '#FF6B00' : s >= 400 ? colors.amber : colors.white }
function scoreLabel(s: number) { return s >= 700 ? 'CRITICAL' : s >= 500 ? 'HIGH' : s >= 300 ? 'MODERATE' : 'LOW' }

function Skeleton({ width = '100%', height = 14 }: { width?: string | number; height?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.12, 0.3, 0.12] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
      style={{ width, height, background: 'rgba(255,255,255,0.10)', marginBottom: 10 }}
    />
  )
}

/* ── Class colour map (mirrors backend) ─────────────────────────────────── */
const CLASS_COLORS: Record<number, string> = {
  2: '#00c8ff',  // car       → cyan
  3: '#ff8c00',  // motorcycle → orange
  5: '#32ff32',  // bus        → green
  7: '#ff5050',  // truck      → red-ish
}
function classColor(id: number) { return CLASS_COLORS[id] ?? '#aaaaaa' }

/* ── Annotated image viewer ─────────────────────────────────────────────── */
function AnnotatedImage({ b64, filename }: { b64: string; filename: string }) {
  if (!b64) return null
  return (
    <div style={{ position: 'relative', marginBottom: 28 }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: colors.captionGray, marginBottom: 10,
      }}>
        YOLOv8 Detection Output
      </p>
      <img
        src={`data:image/jpeg;base64,${b64}`}
        alt={`Annotated detection result for ${filename}`}
        style={{
          width: '100%', maxHeight: 480, objectFit: 'contain',
          border: '1px solid rgba(255,255,255,0.12)', display: 'block',
          background: 'rgba(0,0,0,0.4)',
        }}
      />
      <div style={{
        position: 'absolute', bottom: 8, right: 8,
        background: 'rgba(0,0,0,0.75)', padding: '3px 8px',
        fontSize: 9, color: 'rgba(255,255,255,0.5)',
      }}>
        Boxes drawn by YOLOv8n · plates read by EasyOCR
      </div>
    </div>
  )
}

/* ── Plates panel ───────────────────────────────────────────────────────── */
function PlatesPanel({ plates, vehicleDetails }: { plates: string[]; vehicleDetails: VehicleDetail[] }) {
  const allWithPlates = vehicleDetails.filter(v => v.plate)
  const noPlate       = vehicleDetails.filter(v => !v.plate)

  return (
    <div style={{
      border: '1px solid rgba(255,199,0,0.25)',
      background: 'rgba(255,199,0,0.04)',
      padding: '18px 20px',
      marginBottom: 28,
    }}>
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
        color: colors.amber, marginBottom: 14,
      }}>
        Captured Number Plates
      </p>

      {plates.length === 0 ? (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', fontStyle: 'italic' }}>
          No plates read — vehicles may be at an angle, low-res, or plate region not visible.
        </p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
          {plates.map((p, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.07)',
              border: '1.5px solid rgba(255,199,0,0.5)',
              padding: '8px 16px',
              fontFamily: 'monospace',
              fontSize: 15, fontWeight: 800,
              color: colors.amber,
              letterSpacing: '0.12em',
            }}>
              {p}
            </div>
          ))}
        </div>
      )}

      {/* Per-vehicle breakdown */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {vehicleDetails.map((v, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              width: 8, height: 8, flexShrink: 0,
              background: classColor(v.class_id),
            }} />
            <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.6)', minWidth: 80 }}>
              {v.class}
            </span>
            <span style={{ fontSize: 9, color: colors.captionGray, minWidth: 40 }}>
              {Math.round(v.confidence * 100)}%
            </span>
            {v.plate ? (
              <span style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700,
                color: colors.amber, letterSpacing: '0.08em',
              }}>
                {v.plate}
              </span>
            ) : (
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', fontStyle: 'italic' }}>
                plate not read
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Score bar ──────────────────────────────────────────────────────────── */
function ScoreBar({ score }: { score: number }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', color: colors.captionGray }}>
          CONGESTION-COST SCORE
        </span>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: scoreColor(score) }}>
          {scoreLabel(score)}
        </span>
      </div>
      <div style={{ position: 'relative', height: 6, background: 'rgba(255,255,255,0.08)' }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${(score / 1000) * 100}%` }}
          transition={{ duration: 0.9, ease: EASE }}
          style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: scoreColor(score) }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        <span style={{ fontSize: 9, color: colors.captionGray }}>0</span>
        <span style={{ fontSize: 9, color: colors.captionGray }}>1000</span>
      </div>
    </div>
  )
}

/* ── Method badge ───────────────────────────────────────────────────────── */
function MethodBadge({ result }: { result: DetectionResult }) {
  const det  = result.simulated_detection
  const isCV = result.detection_method === 'yolov8_cv'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '10px 16px',
      background: isCV ? 'rgba(255,199,0,0.1)' : 'rgba(255,255,255,0.04)',
      border: `1px solid ${isCV ? 'rgba(255,199,0,0.3)' : 'rgba(255,255,255,0.1)'}`,
      marginBottom: 20,
    }}>
      {isCV ? (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.amber }}>
          ✓ YOLOv8 Vision Analysis · {det.vehicle_count} vehicle{det.vehicle_count !== 1 ? 's' : ''} detected · {det.detection_confidence}% confidence
        </span>
      ) : (
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray }}>
          ⓘ Statistical fallback — no vehicle detected by CV
        </span>
      )}
    </div>
  )
}

/* ── Full result card ───────────────────────────────────────────────────── */
function ResultCard({ result }: { result: DetectionResult }) {
  const det  = result.simulated_detection
  const bd   = result.score_breakdown
  const isCV = result.detection_method === 'yolov8_cv'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      style={{ marginTop: 28 }}
    >
      <MethodBadge result={result} />

      {/* 1 — Annotated image */}
      {isCV && det.annotated_image_b64 && (
        <AnnotatedImage b64={det.annotated_image_b64} filename={result.filename} />
      )}

      {/* 2 — Number plates panel (always shown for CV path) */}
      {isCV && (
        <PlatesPanel
          plates={det.detected_plates ?? []}
          vehicleDetails={det.vehicle_details ?? []}
        />
      )}

      {/* 3 — Inference reasoning */}
      {isCV && det.inference_reasoning && (
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 20, fontStyle: 'italic' }}>
          "{det.inference_reasoning}"
        </p>
      )}

      {/* 4 — Two-column: violation fields + score */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>

        {/* Left — violation */}
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 16 }}>
            {isCV ? 'CV Detection Result' : 'Sampled Violation'}
          </p>
          {([
            { label: 'Violation Type', value: det.violation_type },
            { label: 'Vehicle Type',   value: det.vehicle_type },
            { label: 'Location',       value: det.location },
            { label: 'Hour (IST)',     value: `${det.hour_ist}:00` },
            { label: 'Offence Code',  value: String(det.offence_code) },
          ] as { label: string; value: string }[]).map(({ label, value }) => (
            <div key={label} style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
              padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              <span style={{ fontSize: 10, fontWeight: 600, color: colors.captionGray, letterSpacing: '0.06em', flexShrink: 0, marginRight: 12 }}>
                {label}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: colors.white, textAlign: 'right', lineHeight: 1.4 }}>
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Right — score */}
        <div>
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 16 }}>
            Module 2 — Real Scoring Engine
          </p>
          <div style={{ marginBottom: 20 }}>
            <span style={{ fontSize: 'clamp(48px, 7vw, 80px)', fontWeight: 900, letterSpacing: '-0.04em', color: scoreColor(result.congestion_cost_score), lineHeight: 1 }}>
              {result.congestion_cost_score}
            </span>
            <span style={{ fontSize: 11, color: colors.captionGray, marginLeft: 10 }}>/ 1000</span>
          </div>
          <ScoreBar score={result.congestion_cost_score} />
          <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 10 }}>
            Score Components
          </p>
          {([
            { label: 'Time of Day (35%)',        value: bd.time_of_day_weight },
            { label: 'Junction Density (30%)',   value: bd.junction_density_weight },
            { label: 'Violation Severity (25%)', value: bd.severity_weight },
            { label: 'Stacking (10%)',           value: bd.stacking_multiplier * 100 },
          ] as { label: string; value: number }[]).map(({ label, value }) => (
            <div key={label} style={{ marginBottom: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)' }}>{label}</span>
                <span style={{ fontSize: 9, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{value.toFixed(1)}</span>
              </div>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.07)' }}>
                <div style={{ height: '100%', width: `${Math.min(100, value)}%`, background: 'rgba(255,255,255,0.3)' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginTop: 16 }}>
        {result.filename} · {result.file_size_kb} KB
      </p>

      {/* Disclosure */}
      <div style={{ marginTop: 20, padding: '14px 16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>
          Disclosure
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7, marginBottom: 10 }}>
          {result.disclosure}
        </p>
        <p style={{ fontSize: 11, color: 'rgba(255,199,0,0.6)', lineHeight: 1.6 }}>
          {result.production_note}
        </p>
      </div>
    </motion.div>
  )
}

/* ── Main export ────────────────────────────────────────────────────────── */
export default function DetectionUpload() {
  const [result,   setResult]   = useState<DetectionResult | null>(null)
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (file: File) => {
    const allowed = ['image/jpeg', 'image/png', 'video/mp4', 'video/quicktime']
    if (!allowed.includes(file.type)) {
      setError(`Unsupported file type: ${file.type}. Upload a JPG, PNG, MP4, or MOV.`)
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

    const form = new FormData()
    form.append('file', file)

    try {
      const resp = await fetch(`${API_BASE}/api/detect/simulate`, { method: 'POST', body: form })
      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}))
        throw new Error(body.detail || `HTTP ${resp.status}`)
      }
      setResult(await resp.json())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }, [])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div style={{ marginTop: 'clamp(48px, 6vw, 80px)' }}>
      <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 14 }}>
        Module 1 — Detection-to-Decision Engine · Simulated
      </p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 10 }}>
        <h3 style={{ fontSize: 'clamp(20px, 3vw, 36px)', fontWeight: 900, letterSpacing: '-0.03em', color: colors.white, margin: 0 }}>
          UPLOAD A PHOTO OR VIDEO.
        </h3>
        <a
          href="/detect"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
            textDecoration: 'none', color: colors.black, background: colors.amber,
            padding: '9px 22px', flexShrink: 0, transition: 'background 0.18s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = colors.white)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = colors.amber)}
        >
          Full Demo Page →
        </a>
      </div>

      <p style={{ fontSize: 'clamp(13px, 1.4vw, 15px)', color: 'rgba(255,255,255,0.55)', maxWidth: 560, lineHeight: 1.65, marginBottom: 24 }}>
        Upload a parking scene photo. YOLOv8 detects vehicles and reads number plates, spatial analysis infers the violation type, then the real scoring engine computes the congestion-cost score.
      </p>

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        role="button" tabIndex={0} aria-label="Upload image or video file"
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        style={{
          border: `1.5px dashed ${dragging ? colors.amber : 'rgba(255,255,255,0.18)'}`,
          padding: 'clamp(28px, 4vw, 48px) 28px',
          textAlign: 'center', cursor: 'pointer',
          transition: 'border-color 0.18s, background 0.18s',
          background: dragging ? 'rgba(255,199,0,0.04)' : 'transparent',
          userSelect: 'none',
        }}
      >
        <input ref={inputRef} type="file" accept="image/jpeg,image/png,video/mp4,video/quicktime"
          onChange={handleInputChange} style={{ display: 'none' }} aria-hidden="true" />

        {loading ? (
          <div>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
              style={{ width: 28, height: 28, margin: '0 auto 12px', border: '2px solid rgba(255,255,255,0.1)', borderTop: `2px solid ${colors.amber}`, borderRadius: '50%' }}
            />
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray }}>
              ANALYSING{fileName ? ` ${fileName}` : ''}… (plate OCR may take ~10 s)
            </p>
          </div>
        ) : (
          <>
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ margin: '0 auto 12px', display: 'block' }} aria-hidden="true">
              <rect x="1" y="1" width="30" height="30" stroke="rgba(255,255,255,0.2)" strokeWidth="1"/>
              <line x1="16" y1="22" x2="16" y2="10" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round"/>
              <polyline points="10,16 16,10 22,16" stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, marginBottom: 4 }}>
              {fileName ? 'Re-upload or drop a new file' : 'Drop image or video here'}
            </p>
            <p style={{ fontSize: 10, color: colors.captionGray }}>JPG · PNG · MP4 · MOV · max 100 MB</p>
          </>
        )}
      </div>

      <AnimatePresence>
        {error && (
          <motion.p initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            style={{ marginTop: 12, fontSize: 11, color: '#f85149', fontWeight: 600 }}>
            ✕ {error}
          </motion.p>
        )}
      </AnimatePresence>

      {loading && (
        <div style={{ marginTop: 28 }}>
          <Skeleton width="50%" height={10} /><Skeleton width="80%" height={10} />
          <Skeleton height={6} /><Skeleton width="70%" height={6} /><Skeleton width="60%" height={6} />
        </div>
      )}

      <AnimatePresence>
        {result && !loading && <ResultCard result={result} />}
      </AnimatePresence>
    </div>
  )
}
