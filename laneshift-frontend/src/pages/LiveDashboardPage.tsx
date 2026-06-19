/**
 * LiveDashboardPage — /live
 * Full-page live data showcase.
 * Animated Nov→Apr timeline replay + live dispatch queue + monthly trend.
 */
import { useEffect, useState, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface MonthSummary {
  month: string
  label: string
  total_violations: number
  avg_congestion_score: number | null
  top_violation_type: string
}

interface QueueItem {
  rank: number
  location_name: string
  police_station_jurisdiction: string
  aggregate_congestion_score: number
  violation_count: number
  recommended_action: string
}

interface DashboardData {
  top_violation_types: { type: string; count: number }[]
  live_dispatch_queue_top_10: QueueItem[]
  validation_leak_summary: { projected_void_recovery_pct: number }
  stations_requiring_attention: { police_station: string; rejection_rate_pct: number }[]
}

/* ── Colours ───────────────────────────────────────────────────────────────── */
function actionColor(a: string) {
  if (a === 'Dispatch immediately') return colors.amber
  if (a === 'Route on standard patrol') return colors.white
  return colors.captionGray
}

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function Skel({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.1, 0.25, 0.1] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      style={{ width: w, height: h, background: 'rgba(255,255,255,0.09)', marginBottom: 10 }}
    />
  )
}

/* ── Monthly timeline replay ────────────────────────────────────────────────── */
const MONTHS_META = [
  { value: '2023-11', short: 'NOV', full: 'November 2023' },
  { value: '2023-12', short: 'DEC', full: 'December 2023' },
  { value: '2024-01', short: 'JAN', full: 'January 2024'  },
  { value: '2024-02', short: 'FEB', full: 'February 2024' },
  { value: '2024-03', short: 'MAR', full: 'March 2024'    },
  { value: '2024-04', short: 'APR', full: 'April 2024'    },
]

function MonthlyTimeline({ months }: { months: MonthSummary[] }) {
  const [activeIdx, setActiveIdx] = useState(0)
  const [playing, setPlaying]     = useState(true)
  const timerRef                  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const advance = useCallback(() => {
    setActiveIdx(i => (i + 1) % MONTHS_META.length)
  }, [])

  useEffect(() => {
    if (!playing) { if (timerRef.current) clearTimeout(timerRef.current); return }
    timerRef.current = setTimeout(advance, 3500)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [playing, activeIdx, advance])

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current) }, [])

  const current = months[activeIdx]
  const maxViol = Math.max(...months.map(m => m.total_violations), 1)

  return (
    <div>
      {/* Timeline bar */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 32, flexWrap: 'wrap' }}>
        {MONTHS_META.map((m, i) => {
          const data = months[i]
          return (
            <button
              key={m.value}
              onClick={() => { setActiveIdx(i); setPlaying(false) }}
              style={{
                flex: 1, minWidth: 60, padding: '12px 8px',
                background: i === activeIdx ? colors.amber : 'transparent',
                border: `1px solid ${i === activeIdx ? colors.amber : 'rgba(255,255,255,0.1)'}`,
                cursor: 'pointer', transition: 'all 0.2s',
                borderRight: i < 5 ? 'none' : undefined,
              }}
            >
              <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', display: 'block', color: i === activeIdx ? colors.black : colors.captionGray }}>
                {m.short}
              </span>
              {data && (
                <span style={{ fontSize: 9, display: 'block', color: i === activeIdx ? 'rgba(0,0,0,0.7)' : 'rgba(255,255,255,0.25)', marginTop: 2 }}>
                  {(data.total_violations / 1000).toFixed(0)}K
                </span>
              )}
            </button>
          )
        })}
        <button
          onClick={() => setPlaying(p => !p)}
          style={{
            padding: '12px 16px', marginLeft: 12,
            background: playing ? colors.amber : 'transparent',
            border: `1px solid ${playing ? colors.amber : 'rgba(255,255,255,0.2)'}`,
            color: playing ? colors.black : colors.white,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.18s',
          }}
          aria-label={playing ? 'Pause' : 'Play timeline'}
        >
          {playing
            ? <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="0" width="3.5" height="12"/><rect x="6.5" y="0" width="3.5" height="12"/></svg>
            : <svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><polygon points="0,0 10,6 0,12"/></svg>
          }
        </button>
      </div>

      {/* Active month detail */}
      <AnimatePresence mode="wait">
        {current && (
          <motion.div
            key={current.month}
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.35, ease: EASE }}
          >
            {/* Month headline */}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 20, marginBottom: 28, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'clamp(28px, 4vw, 52px)', fontWeight: 900, letterSpacing: '-0.03em', color: colors.white }}>
                {MONTHS_META[activeIdx].full}
              </span>
              <span style={{ fontSize: 'clamp(22px, 3vw, 40px)', fontWeight: 900, color: colors.amber, letterSpacing: '-0.03em' }}>
                {current.total_violations.toLocaleString()}
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: colors.captionGray }}>
                violations
              </span>
            </div>

            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 16, marginBottom: 36 }}>
              <div style={{ padding: '18px 20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>Top Violation</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: colors.white }}>{current.top_violation_type || '—'}</p>
              </div>
              <div style={{ padding: '18px 20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>Avg Congestion Score</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: colors.amber }}>{current.avg_congestion_score?.toFixed(0) ?? '—'}</p>
              </div>
              <div style={{ padding: '18px 20px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <p style={{ fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>Share of Total</p>
                <p style={{ fontSize: 13, fontWeight: 700, color: colors.white }}>
                  {((current.total_violations / 298450) * 100).toFixed(1)}%
                </p>
              </div>
            </div>

            {/* Volume bar vs all months */}
            <div>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 16 }}>
                Volume vs all months
              </p>
              {months.map((m, i) => (
                <div key={m.month} style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: i === activeIdx ? colors.amber : 'rgba(255,255,255,0.5)' }}>
                      {MONTHS_META[i]?.full}
                    </span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                      {m.total_violations.toLocaleString()}
                    </span>
                  </div>
                  <div style={{ height: 4, background: 'rgba(255,255,255,0.07)' }}>
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(m.total_violations / maxViol) * 100}%` }}
                      transition={{ duration: 0.7, ease: EASE, delay: i * 0.07 }}
                      style={{
                        height: '100%',
                        background: i === activeIdx ? colors.amber : 'rgba(255,255,255,0.3)',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Dispatch queue table ───────────────────────────────────────────────────── */
function DispatchTable({ items }: { items: QueueItem[] }) {
  const [filter, setFilter] = useState<'all' | 'dispatch' | 'patrol'>('all')
  const shown = items.filter(item => {
    if (filter === 'dispatch') return item.recommended_action === 'Dispatch immediately'
    if (filter === 'patrol')   return item.recommended_action === 'Route on standard patrol'
    return true
  })

  return (
    <div>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {(['all', 'dispatch', 'patrol'] as const).map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: '5px 14px', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', cursor: 'pointer',
            background: filter === f ? colors.white : 'transparent',
            color: filter === f ? colors.black : colors.captionGray,
            border: `1px solid ${filter === f ? colors.white : 'rgba(255,255,255,0.15)'}`,
            transition: 'all 0.15s',
          }}>
            {f === 'all' ? 'All' : f === 'dispatch' ? '⚡ Dispatch Now' : '→ Patrol'}
          </button>
        ))}
      </div>

      {/* Header */}
      <div style={{
        display: 'grid', gridTemplateColumns: '36px 1fr 90px 80px 160px',
        padding: '8px 14px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {['#', 'LOCATION', 'SCORE', 'COUNT', 'ACTION'].map(h => (
          <span key={h} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: colors.captionGray }}>{h}</span>
        ))}
      </div>

      <AnimatePresence>
        {shown.map((item, i) => (
          <motion.div
            key={item.rank}
            initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE, delay: i * 0.04 }}
            style={{
              display: 'grid', gridTemplateColumns: '36px 1fr 90px 80px 160px',
              padding: '13px 14px', borderBottom: '1px solid rgba(255,255,255,0.04)',
              alignItems: 'center',
              background: item.recommended_action === 'Dispatch immediately' ? 'rgba(255,199,0,0.03)' : 'transparent',
            }}
          >
            <span style={{ fontSize: 10, fontWeight: 800, color: colors.captionGray }}>
              {String(item.rank).padStart(2, '0')}
            </span>
            <div style={{ paddingRight: 8, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 2 }}>
                {item.location_name}
              </p>
              <p style={{ fontSize: 9, color: colors.captionGray }}>{item.police_station_jurisdiction}</p>
            </div>
            <span style={{ fontSize: 13, fontWeight: 900, color: item.aggregate_congestion_score > 600 ? colors.amber : colors.white, letterSpacing: '-0.02em' }}>
              {item.aggregate_congestion_score.toLocaleString()}
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
              {item.violation_count.toLocaleString()}
            </span>
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: actionColor(item.recommended_action),
            }}>
              {item.recommended_action}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {shown.length === 0 && (
        <p style={{ padding: '24px 14px', fontSize: 12, color: colors.captionGray }}>No items match this filter.</p>
      )}
    </div>
  )
}

/* ── Violation type bars ─────────────────────────────────────────────────────── */
function ViolationBars({ types }: { types: { type: string; count: number }[] }) {
  const max = types[0]?.count ?? 1
  return (
    <div>
      {types.map((item, i) => (
        <div key={item.type} style={{ marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.white }}>{item.type}</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: colors.captionGray }}>{item.count.toLocaleString()}</span>
          </div>
          <div style={{ height: 5, background: 'rgba(255,255,255,0.08)', position: 'relative' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${(item.count / max) * 100}%` }}
              transition={{ duration: 0.8, ease: EASE, delay: i * 0.12 }}
              style={{
                position: 'absolute', top: 0, left: 0, height: '100%',
                background: i === 0 ? colors.amber : colors.white,
                opacity: i === 0 ? 1 : 0.65 - i * 0.08,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────────── */
export default function LiveDashboardPage() {
  const [months,    setMonths]    = useState<MonthSummary[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [offline,   setOffline]   = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    try {
      const [summaryRes, dashRes] = await Promise.all([
        fetch(`${API_BASE}/api/geo/monthly-summary`),
        fetch(`${API_BASE}/api/dashboard/summary`),
      ])
      if (!summaryRes.ok || !dashRes.ok) throw new Error('api error')
      const summaryData = await summaryRes.json()
      const dashData    = await dashRes.json()
      setMonths(summaryData.months ?? [])
      setDashboard(dashData)
      setLastUpdated(new Date())
      setOffline(false)
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { window.scrollTo(0, 0); fetchAll() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* ── Page header ──────────────────────────────────────────── */}
        <div style={{
          padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px) 40px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 16,
        }}>
          <div>
            <motion.p
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE }}
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}
            >
              Live System Output · Nov 2023 – Apr 2024 · 298,450 Records
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
              style={{ fontSize: 'clamp(28px, 5vw, 72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 0 }}
            >
              LIVE DATA<br />
              <span style={{ color: colors.amber }}>DASHBOARD.</span>
            </motion.h1>
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            {lastUpdated && (
              <span style={{ fontSize: 10, color: colors.captionGray }}>
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button onClick={fetchAll} disabled={loading} style={{
              padding: '8px 20px', background: 'transparent', border: `1px solid rgba(255,255,255,0.2)`,
              color: loading ? colors.captionGray : colors.white, cursor: loading ? 'default' : 'pointer',
              fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
              fontFamily: 'inherit', transition: 'border-color 0.15s',
            }}>
              {loading ? 'Loading…' : '↻ Refresh'}
            </button>
            {offline && (
              <span style={{ fontSize: 10, color: '#f85149', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                BACKEND OFFLINE
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)' }}>
            {[1,2,3,4,5].map(i => <Skel key={i} h={14} />)}
          </div>
        ) : (
          <div style={{ padding: '0 clamp(24px, 6vw, 120px) clamp(64px, 8vw, 100px)' }}>

            {/* ── KPI row ──────────────────────────────────────────── */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 0, borderBottom: '1px solid rgba(255,255,255,0.07)',
              marginBottom: 60,
            }}>
              {[
                { label: 'Total Violations', value: '298,450', accent: false },
                { label: 'Never Resolved', value: '61.23%', accent: true },
                { label: 'Auto-Recoverable', value: '85.17%', accent: true },
                { label: 'Active Devices', value: '3,070', accent: false },
                { label: 'Months of Data', value: '6', accent: false },
              ].map((kpi, i) => (
                <div key={kpi.label} style={{
                  padding: 'clamp(24px, 3vw, 40px) 24px',
                  borderRight: i < 4 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                }}>
                  <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 8 }}>
                    {kpi.label}
                  </p>
                  <p style={{ fontSize: 'clamp(28px, 4vw, 48px)', fontWeight: 900, letterSpacing: '-0.04em', lineHeight: 1, color: kpi.accent ? colors.amber : colors.white }}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>

            {/* ── Two-column main grid ──────────────────────────────── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 'clamp(40px, 5vw, 80px)' }}>

              {/* LEFT: Monthly timeline replay */}
              <div>
                <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 24, paddingTop: 0 }}>
                  Historical Playback — Nov 2023 → Apr 2024
                </p>
                {months.length > 0
                  ? <MonthlyTimeline months={months} />
                  : <div>{[1,2,3,4,5,6].map(i => <Skel key={i} h={10} />)}</div>
                }
              </div>

              {/* RIGHT: Violation types + dispatch */}
              <div>
                {/* Violation bars */}
                {dashboard?.top_violation_types && dashboard.top_violation_types.length > 0 && (
                  <div style={{ marginBottom: 48 }}>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 24 }}>
                      Top Violation Types · Full Dataset
                    </p>
                    <ViolationBars types={dashboard.top_violation_types} />
                    <p style={{ fontSize: 11, color: colors.captionGray, marginTop: 14 }}>
                      2 types account for 93%+ of all flagged violations.
                    </p>
                  </div>
                )}

                {/* Stations needing attention */}
                {dashboard?.stations_requiring_attention && dashboard.stations_requiring_attention.length > 0 && (
                  <div>
                    <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 18 }}>
                      Stations Requiring Attention
                    </p>
                    {dashboard.stations_requiring_attention.map((s, i) => (
                      <motion.div key={s.police_station}
                        initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.06 * i, ease: EASE }}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: colors.white }}>{s.police_station}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: s.rejection_rate_pct > 35 ? '#f85149' : colors.captionGray }}>
                          {s.rejection_rate_pct.toFixed(1)}% rejected
                        </span>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Dispatch queue — full width ───────────────────────── */}
            {dashboard?.live_dispatch_queue_top_10 && dashboard.live_dispatch_queue_top_10.length > 0 && (
              <div style={{ marginTop: 60 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray }}>
                    Live Dispatch Priority Queue — Top {dashboard.live_dispatch_queue_top_10.length} Zones
                  </p>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <motion.span
                      animate={{ opacity: [1, 0.3, 1] }} transition={{ duration: 1.2, repeat: Infinity }}
                      style={{ width: 6, height: 6, borderRadius: '50%', background: colors.amber, display: 'inline-block' }}
                    />
                    <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: colors.amber }}>LIVE</span>
                  </div>
                </div>
                <DispatchTable items={dashboard.live_dispatch_queue_top_10} />
              </div>
            )}

            {/* Recovery hero stat */}
            {dashboard?.validation_leak_summary && (
              <div style={{ marginTop: 60, padding: 'clamp(28px, 3vw, 44px)', border: `1px solid rgba(255,199,0,0.25)`, maxWidth: 560 }}>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.amber, marginBottom: 10 }}>
                  LaneShift Recovery Projection
                </p>
                <p style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', color: colors.amber, lineHeight: 1, marginBottom: 12 }}>
                  {dashboard.validation_leak_summary.projected_void_recovery_pct.toFixed(2)}%
                </p>
                <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
                  of all 298,450 violations — currently falling into a null-status void — would have been auto-approved under LaneShift governance.
                </p>
              </div>
            )}
          </div>
        )}
      </main>
      <Footer />
    </>
  )
}
