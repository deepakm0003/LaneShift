/**
 * LiveMonitorPage — /monitor
 * Module 5: Live Continuous Monitoring
 *
 * Streams webcam frames via WebSocket to YOLOv8n backend.
 * Real-time bounding box overlay on live video.
 * Stationary vehicle dwell-time alerts with sampled scenario context.
 */
import { useEffect, useRef, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { colors } from '../designTokens'

const EASE        = [0.22, 1, 0.36, 1] as const
const WS_URL      = 'ws://localhost:8000/ws/live-monitor'
const FRAME_INTERVAL_MS = 800   // send a frame every 800ms

/* ── Types ──────────────────────────────────────────────────────────────────── */
interface DetectedObject {
  class: string
  confidence: number
  bbox_pct: { x1: number; y1: number; x2: number; y2: number }
}

interface SampledScenario {
  violation_type: string
  location: string
  hour_ist: number
  offence_code: number
  congestion_cost_score: number
  score_breakdown: { time_of_day_weight: number; junction_density_weight: number; severity_weight: number }
  confidence_note: string
}

interface StationaryAlert {
  track_id: string
  class: string
  dwell_frames: number
  cx_norm: number
  cy_norm: number
  bbox_pct: { x1: number; y1: number; x2: number; y2: number }
  sampled_scenario: SampledScenario
}

interface FrameResult {
  frame_timestamp: number
  image_size: { width: number; height: number }
  vehicle_count: number
  person_count: number
  objects_detected: DetectedObject[]
  stationary_alerts: StationaryAlert[]
  tracker_active_tracks: number
  detection_method: string
  disclosure: string
  error?: string
  heartbeat?: boolean
}

/* ── Score color ────────────────────────────────────────────────────────────── */
function scoreColor(s: number) {
  if (s >= 700) return '#FF6B00'
  if (s >= 400) return colors.amber
  return colors.white
}

/* ── Canvas overlay component ───────────────────────────────────────────────── */
function BBoxOverlay({ objects, alerts, width, height }: {
  objects: DetectedObject[]
  alerts: StationaryAlert[]
  width: number
  height: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || width === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const alertIds = new Set(alerts.map(a => a.track_id))

    // Draw all detected objects
    objects.forEach(obj => {
      const { x1, y1, x2, y2 } = obj.bbox_pct
      const px1 = x1 * canvas.width
      const py1 = y1 * canvas.height
      const pw  = (x2 - x1) * canvas.width
      const ph  = (y2 - y1) * canvas.height

      const isVehicle = ['car', 'truck', 'bus', 'motorcycle', 'bicycle'].includes(obj.class)
      const color = isVehicle ? '#FFC700' : 'rgba(255,255,255,0.5)'

      ctx.strokeStyle = color
      ctx.lineWidth   = isVehicle ? 2 : 1
      ctx.strokeRect(px1, py1, pw, ph)

      // Label
      ctx.fillStyle = color
      ctx.font      = 'bold 11px Inter, sans-serif'
      ctx.fillText(
        `${obj.class} ${Math.round(obj.confidence * 100)}%`,
        px1 + 4, py1 + 14,
      )
    })

    // Draw stationary alert boxes (red, thicker)
    alerts.forEach(alert => {
      const { x1, y1, x2, y2 } = alert.bbox_pct
      const px1 = x1 * canvas.width
      const py1 = y1 * canvas.height
      const pw  = (x2 - x1) * canvas.width
      const ph  = (y2 - y1) * canvas.height

      ctx.strokeStyle = '#f85149'
      ctx.lineWidth   = 3
      ctx.strokeRect(px1, py1, pw, ph)

      // Pulsing label background
      ctx.fillStyle = 'rgba(248,81,73,0.25)'
      ctx.fillRect(px1, py1 - 22, Math.min(180, pw), 20)
      ctx.fillStyle = '#f85149'
      ctx.font = 'bold 10px Inter, sans-serif'
      ctx.fillText(`STATIONARY · ${alert.dwell_frames}f`, px1 + 4, py1 - 6)
    })
  }, [objects, alerts, width, height])

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0, pointerEvents: 'none' }}
    />
  )
}

/* ── Stationary alert card ───────────────────────────────────────────────────── */
function AlertCard({ alert }: { alert: StationaryAlert }) {
  const sc = alert.sampled_scenario
  const score = sc.congestion_cost_score

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.35, ease: EASE }}
      style={{ marginBottom: 14 }}
    >
      {/* Real detection panel */}
      <div style={{ padding: '12px 14px', background: 'rgba(248,81,73,0.08)', borderLeft: '3px solid #f85149', marginBottom: 6 }}>
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#f85149', marginBottom: 6 }}>
          ● REAL DETECTION — Stationary Vehicle
        </p>
        <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, marginBottom: 3 }}>
          {alert.class.toUpperCase()} · {alert.dwell_frames} frames stationary
        </p>
        <p style={{ fontSize: 10, color: colors.captionGray }}>
          Position: {Math.round(alert.cx_norm * 100)}% across · {Math.round(alert.cy_norm * 100)}% down
        </p>
      </div>

      {/* Sampled scenario panel — different styling = clearly separate */}
      <div style={{ padding: '12px 14px', background: 'rgba(255,199,0,0.05)', borderLeft: '3px solid rgba(255,199,0,0.3)' }}>
        <p style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,199,0,0.6)', marginBottom: 6 }}>
          SAMPLED SCENARIO — For Scoring Demo Only
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
          <div>
            <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, marginBottom: 2 }}>{sc.violation_type}</p>
            <p style={{ fontSize: 10, color: colors.captionGray }}>{sc.location}</p>
          </div>
          <div style={{ textAlign: 'right' }}>
            <p style={{ fontSize: 24, fontWeight: 900, letterSpacing: '-0.04em', color: scoreColor(score), lineHeight: 1 }}>{score}</p>
            <p style={{ fontSize: 8, color: colors.captionGray }}>/ 1000</p>
          </div>
        </div>
        <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', lineHeight: 1.5, fontStyle: 'italic' }}>
          {sc.confidence_note}
        </p>
      </div>
    </motion.div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────────── */
export default function LiveMonitorPage() {
  const videoRef    = useRef<HTMLVideoElement>(null)
  const streamRef   = useRef<MediaStream | null>(null)
  const wsRef       = useRef<WebSocket | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const canvasCaptureRef = useRef<HTMLCanvasElement>(null)

  const [cameraOn,    setCameraOn]    = useState(false)
  const [wsConnected, setWsConnected] = useState(false)
  const [monitoring,  setMonitoring]  = useState(false)
  const [frameResult, setFrameResult] = useState<FrameResult | null>(null)
  const [alerts,      setAlerts]      = useState<StationaryAlert[]>([])
  const [fps,         setFps]         = useState(0)
  const [error,       setError]       = useState<string | null>(null)
  const [videoDims,   setVideoDims]   = useState({ w: 0, h: 0 })
  const lastFrameTime = useRef<number>(Date.now())

  /* ── Start camera ────────────────────────────────────────────────────────── */
  const startCamera = useCallback(async () => {
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'environment' }
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        videoRef.current.onloadedmetadata = () => {
          setVideoDims({ w: videoRef.current!.videoWidth, h: videoRef.current!.videoHeight })
        }
      }
      setCameraOn(true)
    } catch (e) {
      setError('Camera access denied. Please allow camera permissions and try again.')
    }
  }, [])

  /* ── Stop camera ─────────────────────────────────────────────────────────── */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraOn(false)
    setMonitoring(false)
  }, [])

  /* ── Connect WebSocket ───────────────────────────────────────────────────── */
  const connectWs = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return
    const ws = new WebSocket(WS_URL)
    wsRef.current = ws
    ws.onopen  = () => { setWsConnected(true);  setError(null) }
    ws.onclose = () => { setWsConnected(false); setMonitoring(false) }
    ws.onerror = () => setError('WebSocket connection failed. Is the backend running at localhost:8000?')
    ws.onmessage = (e) => {
      try {
        const result: FrameResult = JSON.parse(e.data)
        if (result.heartbeat) return
        setFrameResult(result)
        if (result.stationary_alerts?.length) {
          setAlerts(prev => {
            const newAlerts = result.stationary_alerts.filter(
              a => !prev.find(p => p.track_id === a.track_id)
            )
            return [...newAlerts, ...prev].slice(0, 5)
          })
        }
        const now = Date.now()
        setFps(Math.round(1000 / (now - lastFrameTime.current)))
        lastFrameTime.current = now
      } catch { /* ignore parse errors */ }
    }
  }, [])

  /* ── Send frames ─────────────────────────────────────────────────────────── */
  const startMonitoring = useCallback(() => {
    if (!wsConnected) connectWs()
    setMonitoring(true)
    intervalRef.current = setInterval(() => {
      const video  = videoRef.current
      const canvas = canvasCaptureRef.current
      const ws     = wsRef.current
      if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      canvas.width  = video.videoWidth  || 320
      canvas.height = video.videoHeight || 240
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const b64 = canvas.toDataURL('image/jpeg', 0.7).split(',')[1]
      ws.send(JSON.stringify({ frame: b64, timestamp: Date.now() }))
    }, FRAME_INTERVAL_MS)
  }, [wsConnected, connectWs])

  const stopMonitoring = useCallback(() => {
    setMonitoring(false)
    if (intervalRef.current) clearInterval(intervalRef.current)
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
    connectWs()
    return () => {
      stopMonitoring()
      wsRef.current?.close()
      streamRef.current?.getTracks().forEach(t => t.stop())
    }
  }, []) // eslint-disable-line

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* Header */}
        <div style={{ padding: 'clamp(32px,4vw,56px) clamp(24px,6vw,120px) 24px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 10 }}>
            Module 05 — Live Continuous Monitoring · YOLOv8n Real-Time
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
            style={{ fontSize: 'clamp(28px,5vw,64px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 10 }}>
            LIVE MONITOR.<br /><span style={{ color: colors.amber }}>REAL-TIME CV.</span>
          </motion.h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', maxWidth: 560, lineHeight: 1.65 }}>
            YOLOv8 object detection running on your camera feed in real time. When a vehicle stays stationary for ~8–10 seconds, it's flagged — with a sampled scenario context for scoring demo. No identity data. No VAHAN lookup.
          </p>
        </div>

        {/* Main content */}
        <div style={{ padding: 'clamp(24px,3vw,40px) clamp(24px,6vw,120px)', display: 'grid', gridTemplateColumns: 'minmax(0, 1.5fr) minmax(0, 1fr)', gap: 28, alignItems: 'start' }}>

          {/* LEFT: video + overlay */}
          <div>
            {/* Video wrapper */}
            <div style={{ position: 'relative', background: '#0a0a0a', border: '1px solid rgba(255,255,255,0.1)', aspectRatio: '4/3', overflow: 'hidden' }}>
              <video
                ref={videoRef}
                autoPlay playsInline muted
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: cameraOn ? 'block' : 'none' }}
              />

              {/* Bounding box overlay */}
              {cameraOn && frameResult && (
                <BBoxOverlay
                  objects={frameResult.objects_detected}
                  alerts={frameResult.stationary_alerts}
                  width={videoDims.w || 640}
                  height={videoDims.h || 480}
                />
              )}

              {/* Hidden capture canvas */}
              <canvas ref={canvasCaptureRef} style={{ display: 'none' }} />

              {/* No camera placeholder */}
              {!cameraOn && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <svg width="48" height="48" viewBox="0 0 48 48" fill="none" aria-hidden="true">
                    <rect x="3" y="10" width="42" height="30" rx="2" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                    <circle cx="24" cy="25" r="8" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                    <path d="M16 10 L20 3 H28 L32 10" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5"/>
                  </svg>
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>
                    Camera Off
                  </p>
                </div>
              )}

              {/* LIVE badge */}
              {monitoring && (
                <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', background: 'rgba(0,0,0,0.65)' }}>
                  <motion.span animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                    style={{ width: 6, height: 6, borderRadius: '50%', background: '#f85149', display: 'inline-block' }} />
                  <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: '#f85149' }}>LIVE</span>
                </div>
              )}

              {/* Stats overlay */}
              {monitoring && frameResult && (
                <div style={{ position: 'absolute', top: 12, right: 12, padding: '6px 10px', background: 'rgba(0,0,0,0.65)' }}>
                  <p style={{ fontSize: 9, color: colors.amber, fontWeight: 700, marginBottom: 2 }}>
                    {frameResult.vehicle_count} vehicle{frameResult.vehicle_count !== 1 ? 's' : ''}
                    {frameResult.person_count > 0 && ` · ${frameResult.person_count} person${frameResult.person_count !== 1 ? 's' : ''}`}
                  </p>
                  <p style={{ fontSize: 8, color: colors.captionGray }}>{fps} fps · {frameResult.tracker_active_tracks} tracks</p>
                </div>
              )}
            </div>

            {/* Controls */}
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap', alignItems: 'center' }}>
              {!cameraOn ? (
                <button onClick={startCamera} style={{ padding: '10px 24px', background: colors.amber, color: colors.black, border: 'none', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                  Start Camera
                </button>
              ) : (
                <>
                  {!monitoring ? (
                    <button onClick={startMonitoring} disabled={!wsConnected} style={{ padding: '10px 24px', background: wsConnected ? '#3fb950' : 'rgba(255,255,255,0.1)', color: wsConnected ? '#000' : colors.captionGray, border: 'none', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: wsConnected ? 'pointer' : 'default', fontFamily: 'inherit' }}>
                      {wsConnected ? 'Start Monitoring' : 'Connecting…'}
                    </button>
                  ) : (
                    <button onClick={stopMonitoring} style={{ padding: '10px 24px', background: '#f85149', color: '#fff', border: 'none', fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                      ■ Stop
                    </button>
                  )}
                  <button onClick={stopCamera} style={{ padding: '10px 20px', background: 'transparent', color: colors.captionGray, border: '1px solid rgba(255,255,255,0.15)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Turn Off Camera
                  </button>
                </>
              )}

              {/* WS status */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: wsConnected ? '#3fb950' : '#f85149', display: 'inline-block' }} />
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: wsConnected ? '#3fb950' : '#f85149', textTransform: 'uppercase' }}>
                  Backend {wsConnected ? 'Connected' : 'Disconnected'}
                </span>
              </div>
            </div>

            {/* Error */}
            {error && (
              <p style={{ marginTop: 12, fontSize: 11, color: '#f85149', fontWeight: 600 }}>✕ {error}</p>
            )}

            {/* Live detection label */}
            <p style={{ marginTop: 16, fontSize: 10, color: 'rgba(255,255,255,0.25)', lineHeight: 1.65 }}>
              LIVE DEMO — Real-time object detection running on your camera feed. Violation classification shown in any alert is a sampled example for scoring demonstration, not a detected violation type — see disclosure below.
            </p>
          </div>

          {/* RIGHT: alerts + stats */}
          <div>
            {/* Detection stats */}
            {frameResult && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', marginBottom: 20 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}>
                  Current Frame
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  {[
                    { label: 'Vehicles', value: frameResult.vehicle_count, color: colors.amber },
                    { label: 'People',   value: frameResult.person_count,  color: colors.white },
                    { label: 'Objects',  value: frameResult.objects_detected.length, color: colors.white },
                    { label: 'Tracks',   value: frameResult.tracker_active_tracks,   color: colors.captionGray },
                  ].map(({ label, value, color }) => (
                    <div key={label} style={{ padding: '10px 12px', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <p style={{ fontSize: 20, fontWeight: 900, color, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</p>
                      <p style={{ fontSize: 9, color: colors.captionGray, marginTop: 3 }}>{label}</p>
                    </div>
                  ))}
                </div>

                {/* Detected classes */}
                {frameResult.objects_detected.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>Detected</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {frameResult.objects_detected.slice(0, 8).map((obj, i) => (
                        <span key={i} style={{ fontSize: 9, padding: '2px 7px', background: 'rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.08)' }}>
                          {obj.class} {Math.round(obj.confidence * 100)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* Stationary alerts */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray }}>
                  Stationary Vehicle Alerts
                </p>
                {alerts.length > 0 && (
                  <button onClick={() => setAlerts([])} style={{ fontSize: 9, color: colors.captionGray, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                    Clear
                  </button>
                )}
              </div>

              <AnimatePresence>
                {alerts.length === 0 ? (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', lineHeight: 1.6 }}>
                    {monitoring ? 'Watching for stationary vehicles (~8 seconds dwell time)…' : 'Start monitoring to detect stationary vehicles.'}
                  </p>
                ) : (
                  alerts.map(a => <AlertCard key={a.track_id} alert={a} />)
                )}
              </AnimatePresence>
            </div>

            {/* Disclosure */}
            {frameResult?.disclosure && (
              <div style={{ marginTop: 20, padding: '12px 14px', border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.02)' }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>Disclosure</p>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>{frameResult.disclosure}</p>
              </div>
            )}
          </div>
        </div>
      </main>
      <Footer />
    </>
  )
}
