/**
 * ChallanPage — /challan
 * Module 4: Auto-Challan Record Generator
 * Shows preview of auto-generated challan records ready for SCITA submission.
 */
import { useEffect, useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

interface ChallanRecord {
  challan_id: string
  source_violation_id: string
  vehicle_number: string
  vehicle_type: string | null
  violation_type: string
  violation_type_full: string[]
  offence_code: number[]
  location: string
  police_station_jurisdiction: string
  timestamp_ist: string | null
  congestion_cost_score: number | null
  auto_validation_basis: string
  status: string
  routing_note: string
  generated_at: string
}

interface BatchResult {
  total_generated: number
  limit_applied: boolean
  generated_at: string
  routing_note: string
  records: ChallanRecord[]
}

function Skel({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.08, 0.22, 0.08] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      style={{ width: w, height: h, background: 'rgba(255,255,255,0.09)', marginBottom: 10 }}
    />
  )
}

function scoreColor(s: number) {
  if (s >= 700) return '#FF6B00'
  if (s >= 400) return colors.amber
  return 'rgba(255,255,255,0.7)'
}

function ChallanCard({ rec, index }: { rec: ChallanRecord; index: number }) {
  const [open, setOpen] = useState(false)
  const score = rec.congestion_cost_score ?? 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: EASE, delay: Math.min(index * 0.05, 0.5) }}
      style={{ border: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}
    >
      {/* Collapsed row */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '160px minmax(0,1fr) 100px 140px 80px 28px',
          padding: '14px 18px', alignItems: 'center', gap: 8,
          cursor: 'pointer', background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
        }}
      >
        {/* Challan ID */}
        <div>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: colors.amber }}>
            {rec.challan_id}
          </span>
        </div>

        {/* Violation + location */}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rec.violation_type}
          </p>
          <p style={{ fontSize: 9, color: colors.captionGray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {rec.location} · {rec.police_station_jurisdiction}
          </p>
        </div>

        {/* Vehicle number */}
        <span style={{ fontSize: 11, fontWeight: 700, color: colors.white, fontFamily: 'monospace', letterSpacing: '0.06em' }}>
          {rec.vehicle_number || '—'}
        </span>

        {/* Status */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
          color: '#3fb950', padding: '3px 8px',
          background: 'rgba(63,185,80,0.12)', border: '1px solid rgba(63,185,80,0.25)',
          whiteSpace: 'nowrap',
        }}>
          READY
        </span>

        {/* Score */}
        <span style={{ fontSize: 13, fontWeight: 900, color: scoreColor(score), textAlign: 'right' }}>
          {score}
        </span>

        {/* Chevron */}
        <span style={{ fontSize: 9, color: colors.captionGray, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block', textAlign: 'right' }}>▼</span>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '16px 18px 20px',
              background: 'rgba(255,255,255,0.015)',
              borderTop: '1px solid rgba(255,255,255,0.05)',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24,
            }}>
              {/* Left: record fields */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}>
                  Challan Record
                </p>
                {[
                  ['Challan ID',       rec.challan_id],
                  ['Source Violation', rec.source_violation_id],
                  ['Vehicle Reg.',     rec.vehicle_number || '—'],
                  ['Vehicle Type',     rec.vehicle_type || '—'],
                  ['Offence Code',     rec.offence_code?.join(', ') || '—'],
                  ['Timestamp',        rec.timestamp_ist ? new Date(rec.timestamp_ist).toLocaleString('en-IN') : '—'],
                  ['Status',          rec.status],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 10, color: colors.captionGray }}>{k}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.white, textAlign: 'right', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Right: basis + routing */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}>
                  Auto-Validation Basis
                </p>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.6)', lineHeight: 1.75, marginBottom: 16 }}>
                  {rec.auto_validation_basis}
                </p>

                {/* Score */}
                <div style={{ padding: '14px 16px', border: `1px solid ${scoreColor(score)}44`, marginBottom: 16 }}>
                  <p style={{ fontSize: 9, color: colors.captionGray, marginBottom: 4 }}>Congestion-Cost Score</p>
                  <p style={{ fontSize: 32, fontWeight: 900, color: scoreColor(score), letterSpacing: '-0.04em', lineHeight: 1 }}>{score}</p>
                  <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', marginTop: 8 }}>
                    <div style={{ height: '100%', width: `${(score / 1000) * 100}%`, background: scoreColor(score) }} />
                  </div>
                </div>

                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', lineHeight: 1.65 }}>
                  {rec.routing_note}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function ChallanPage() {
  const [batch,   setBatch]   = useState<BatchResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [search,  setSearch]  = useState('')

  const load = useCallback(async () => {
    setLoading(true); setOffline(false)
    try {
      const res = await fetch(`${API_BASE}/api/challan/preview`)
      if (!res.ok) throw new Error('api error')
      setBatch(await res.json())
    } catch { setOffline(true) }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { window.scrollTo(0, 0); load() }, []) // eslint-disable-line

  const filtered = batch?.records.filter(r =>
    !search.trim() ||
    r.challan_id.toLowerCase().includes(search.toLowerCase()) ||
    r.vehicle_number?.toLowerCase().includes(search.toLowerCase()) ||
    r.violation_type?.toLowerCase().includes(search.toLowerCase()) ||
    r.location?.toLowerCase().includes(search.toLowerCase())
  ) ?? []

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* Header */}
        <div style={{ padding: 'clamp(48px,6vw,80px) clamp(24px,6vw,120px) 40px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 14 }}>
            Module 04 — Auto-Challan Record Generator · Deployable
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
            style={{ fontSize: 'clamp(28px,5vw,72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 16 }}>
            AUTO-CHALLAN<br /><span style={{ color: colors.amber }}>RECORDS.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
            style={{ fontSize: 'clamp(13px,1.5vw,17px)', color: 'rgba(255,255,255,0.55)', maxWidth: 620, lineHeight: 1.7, marginBottom: 32 }}>
            For every violation classified as auto-validatable — single type, uncontested vehicle number, passed SCITA, below severity threshold — LaneShift generates a complete, structured record ready for BTP's existing challan pipeline. No officer discretion required.
          </motion.p>

          {/* KPI row */}
          {batch && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
              style={{ display: 'flex', gap: 0, flexWrap: 'wrap' }}>
              {[
                { num: '48,955', label: 'Challans Ready for Submission', color: colors.amber, sub: 'From 298,450 violations analysed' },
                { num: '85.17%', label: 'of Rejected/Stuck Records', color: colors.white, sub: 'Auto-validatable by objective criteria' },
                { num: '0', label: 'Owner Identity Data Required', color: '#3fb950', sub: 'Vehicle reg. number is public — no VAHAN lookup needed at this stage' },
              ].map((k, i) => (
                <div key={k.label} style={{ padding: '20px 28px', borderTop: '1px solid rgba(255,255,255,0.07)', borderRight: i < 2 ? '1px solid rgba(255,255,255,0.07)' : 'none', minWidth: 180 }}>
                  <p style={{ fontSize: 'clamp(24px,4vw,44px)', fontWeight: 900, letterSpacing: '-0.04em', color: k.color, lineHeight: 1, marginBottom: 6 }}>{k.num}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: colors.white, marginBottom: 3 }}>{k.label}</p>
                  <p style={{ fontSize: 10, color: colors.captionGray }}>{k.sub}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* Scope note */}
          <div style={{ marginTop: 28, maxWidth: 680, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 12 }}>
            <div style={{ width: 2, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
              LaneShift stops at the vehicle registration number — a public identifier visible on the vehicle itself. Owner name, phone, and address resolution happens inside BTP's existing authorized VAHAN/SCITA system, unchanged by LaneShift. This is a deliberate architectural boundary, not a missing feature.
            </p>
          </div>
        </div>

        {/* Records */}
        <div style={{ padding: 'clamp(32px,4vw,56px) clamp(24px,6vw,120px) clamp(64px,8vw,100px)' }}>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24, flexWrap: 'wrap' }}>
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search by challan ID, vehicle, violation, location…"
              style={{ flex: 1, minWidth: 240, maxWidth: 400, padding: '7px 12px', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: colors.white, fontSize: 11, fontFamily: 'inherit', outline: 'none' }} />
            <button onClick={load} disabled={loading} style={{ padding: '7px 18px', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: loading ? colors.captionGray : colors.white, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit' }}>
              {loading ? '↻ Loading…' : '↻ Refresh'}
            </button>
            {batch && <span style={{ fontSize: 10, color: colors.captionGray }}>Showing {filtered.length} of {batch.total_generated} preview records</span>}
          </div>

          {/* Column headers */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '160px minmax(0,1fr) 100px 140px 80px 28px', padding: '8px 18px', borderBottom: '1px solid rgba(255,255,255,0.08)', gap: 8 }}>
              {['CHALLAN ID', 'VIOLATION / LOCATION', 'VEHICLE REG.', 'STATUS', 'SCORE', ''].map((h, i) => (
                <span key={i} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: colors.captionGray }}>{h}</span>
              ))}
            </div>
          )}

          {loading ? (
            <div style={{ paddingTop: 24 }}>{[1,2,3,4,5].map(i => <Skel key={i} h={56} />)}</div>
          ) : offline ? (
            <div style={{ paddingTop: 40 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f85149', marginBottom: 10 }}>BACKEND OFFLINE</p>
              <p style={{ fontSize: 13, color: colors.captionGray }}>Start the FastAPI server at localhost:8000 to load challan records.</p>
            </div>
          ) : (
            <div style={{ paddingTop: 16 }}>
              {filtered.map((rec, i) => <ChallanCard key={rec.challan_id} rec={rec} index={i} />)}
              {filtered.length === 0 && <p style={{ paddingTop: 32, fontSize: 13, color: colors.captionGray }}>No records match the search.</p>}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
