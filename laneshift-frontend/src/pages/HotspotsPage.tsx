/**
 * HotspotsPage — /hotspots
 * Module 6: Persistent Hotspot Escalation Engine
 *
 * Shows ALL 221 locations across three tiers:
 *   Tier 1 — Escalate to Civic Authority (57 locations)
 *   Tier 2 — Adjust Enforcement Approach (134 locations)
 *   Tier 3 — Standard Monitoring (30 locations)
 *
 * Each location is expandable to show full escalation recommendation.
 * Searchable by name or station.
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Nav from '../components/Nav'
import Footer from '../components/Footer'
import { colors } from '../designTokens'
import { API_BASE } from '../config'

const EASE = [0.22, 1, 0.36, 1] as const

/* ── Types ─────────────────────────────────────────────────────────────────── */
interface HotspotLocation {
  location_name: string
  police_station: string
  persistence_ratio: number
  weeks_present: number
  weeks_in_dataset: number
  trend_direction: 'worsening' | 'improving' | 'stable'
  escalation_tier: string
  escalation_recommendation: string
  severity_score: number
  average_weekly_violations: number
  min_weekly_violations: number
  max_weekly_violations: number
  dominant_violation_type: string
}

interface Report {
  generated_at: string
  dataset_weeks: number
  total_locations: number
  tier_1_count: number
  tier_2_count: number
  tier_3_count: number
  scope_note: string
  locations: HotspotLocation[]
}

/* ── Tier config ─────────────────────────────────────────────────────────────── */
const TIER_CONFIG = {
  'TIER 1 - ESCALATE TO CIVIC AUTHORITY': {
    label: 'TIER 1',
    shortLabel: 'Civic Escalation Required',
    color: '#f85149',
    bgColor: 'rgba(248,81,73,0.08)',
    borderColor: 'rgba(248,81,73,0.25)',
    desc: 'Present ≥85% of all 23 weeks, trend not improving. Repeated enforcement has not resolved these locations — requires civic escalation to BBMP/Urban Planning.',
  },
  'TIER 2 - ADJUST ENFORCEMENT APPROACH': {
    label: 'TIER 2',
    shortLabel: 'Adjust Enforcement',
    color: '#FFC700',
    bgColor: 'rgba(255,199,0,0.06)',
    borderColor: 'rgba(255,199,0,0.2)',
    desc: 'Present ≥60% of weeks, or improving under current enforcement. Recurring pattern — warranting a change in patrol timing, frequency, or signage.',
  },
  'TIER 3 - STANDARD MONITORING': {
    label: 'TIER 3',
    shortLabel: 'Standard Monitoring',
    color: 'rgba(255,255,255,0.4)',
    bgColor: 'transparent',
    borderColor: 'rgba(255,255,255,0.08)',
    desc: 'Present <60% of weeks. Not yet showing a chronic persistent pattern. Continue standard enforcement monitoring.',
  },
}

function getTierConfig(tier: string) {
  return TIER_CONFIG[tier as keyof typeof TIER_CONFIG] ?? TIER_CONFIG['TIER 3 - STANDARD MONITORING']
}

/* ── Helpers ────────────────────────────────────────────────────────────────── */
function trendIcon(t: string) { return t === 'worsening' ? '↑' : t === 'improving' ? '↓' : '→' }
function trendColor(t: string) {
  return t === 'worsening' ? '#f85149' : t === 'improving' ? '#3fb950' : colors.captionGray
}

/* ── Skeleton ───────────────────────────────────────────────────────────────── */
function Skel({ w = '100%', h = 12 }: { w?: string | number; h?: number }) {
  return (
    <motion.div
      animate={{ opacity: [0.08, 0.22, 0.08] }}
      transition={{ duration: 1.4, repeat: Infinity }}
      style={{ width: w, height: h, background: 'rgba(255,255,255,0.09)', marginBottom: 10 }}
    />
  )
}

/* ── Persistence bar ────────────────────────────────────────────────────────── */
function PBar({ ratio, color }: { ratio: number; color: string }) {
  return (
    <div style={{ minWidth: 90 }}>
      <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', marginBottom: 4 }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${ratio * 100}%` }}
          transition={{ duration: 0.7, ease: EASE }}
          style={{ height: '100%', background: color }}
        />
      </div>
      <span style={{ fontSize: 9, fontWeight: 800, color, letterSpacing: '0.06em' }}>
        {Math.round(ratio * 100)}% · {Math.round(ratio * 23)}/23 wk
      </span>
    </div>
  )
}

/* ── Single location row ────────────────────────────────────────────────────── */
function LocationRow({ loc, index }: { loc: HotspotLocation; index: number }) {
  const [open, setOpen] = useState(false)
  const cfg = getTierConfig(loc.escalation_tier)

  return (
    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      {/* Collapsed row */}
      <div
        onClick={() => setOpen(o => !o)}
        role="button" tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '90px minmax(0,1fr) 120px 80px 100px 110px 24px',
          padding: '12px 16px',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
          background: open ? 'rgba(255,255,255,0.03)' : 'transparent',
          transition: 'background 0.15s',
        }}
      >
        {/* Tier pill */}
        <span style={{
          fontSize: 8, fontWeight: 800, letterSpacing: '0.12em',
          padding: '3px 8px', display: 'inline-block',
          background: cfg.bgColor, color: cfg.color,
          border: `1px solid ${cfg.borderColor}`,
          whiteSpace: 'nowrap',
        }}>
          {cfg.label}
        </span>

        {/* Name + station */}
        <div style={{ minWidth: 0 }}>
          <p style={{ fontSize: 12, fontWeight: 700, color: colors.white, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 1 }}>
            {loc.location_name}
          </p>
          <p style={{ fontSize: 9, color: colors.captionGray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {loc.police_station}
          </p>
        </div>

        {/* Persistence bar */}
        <PBar ratio={loc.persistence_ratio} color={cfg.color} />

        {/* Avg/week */}
        <span style={{ fontSize: 12, fontWeight: 700, color: colors.white, textAlign: 'right' }}>
          {Math.round(loc.average_weekly_violations)}/wk
        </span>

        {/* Dominant violation */}
        <span style={{ fontSize: 9, color: colors.captionGray, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {loc.dominant_violation_type}
        </span>

        {/* Trend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <span style={{ fontSize: 13, color: trendColor(loc.trend_direction), fontWeight: 900, lineHeight: 1 }}>
            {trendIcon(loc.trend_direction)}
          </span>
          <span style={{ fontSize: 8, fontWeight: 700, color: trendColor(loc.trend_direction), letterSpacing: '0.08em' }}>
            {loc.trend_direction.toUpperCase()}
          </span>
        </div>

        {/* Chevron */}
        <span style={{
          fontSize: 9, color: colors.captionGray,
          transform: open ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s', display: 'inline-block',
        }}>▼</span>
      </div>

      {/* Expanded detail */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '16px 16px 20px 106px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 24,
              background: 'rgba(255,255,255,0.02)',
              borderTop: '1px solid rgba(255,255,255,0.04)',
            }}>
              {/* Stats */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}>
                  Persistence Data
                </p>
                {[
                  ['Dominant Violation', loc.dominant_violation_type],
                  ['Severity Score', `${loc.severity_score.toFixed(1)} / 10`],
                  ['Avg Violations / Week', `${loc.average_weekly_violations.toFixed(1)}`],
                  ['Min / Week', String(loc.min_weekly_violations)],
                  ['Max / Week', String(loc.max_weekly_violations)],
                  ['Weeks Present', `${loc.weeks_present} of ${loc.weeks_in_dataset}`],
                  ['Trend', loc.trend_direction],
                ].map(([k, v]) => (
                  <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 10, color: colors.captionGray }}>{k}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: colors.white }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Recommendation — styled by severity */}
              <div>
                <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 12 }}>
                  Escalation Recommendation
                </p>

                {/* Severity badge */}
                {(() => {
                  const sev = loc.severity_score
                  const urgency = sev >= 8 ? 'CRITICAL' : sev >= 6 ? 'HIGH' : sev >= 4 ? 'MODERATE' : 'LOW'
                  const urgColor = sev >= 8 ? '#f85149' : sev >= 6 ? colors.amber : sev >= 4 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.3)'
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', color: urgColor, padding: '2px 7px', border: `1px solid ${urgColor}44` }}>
                          {urgency}
                        </span>
                        <span style={{ fontSize: 9, color: colors.captionGray }}>Severity score:</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: urgColor }}>{sev.toFixed(1)}/10</span>
                      </div>
                      {/* Mini severity bar */}
                      <div style={{ flex: 1, height: 3, background: 'rgba(255,255,255,0.08)' }}>
                        <div style={{ height: '100%', width: `${sev * 10}%`, background: urgColor, transition: 'width 0.6s' }} />
                      </div>
                    </div>
                  )
                })()}

                <p style={{
                  fontSize: 12,
                  color: loc.severity_score >= 8 ? 'rgba(255,255,255,0.8)' :
                         loc.severity_score >= 6 ? 'rgba(255,255,255,0.7)' : 'rgba(255,255,255,0.5)',
                  lineHeight: 1.8,
                }}>
                  {loc.escalation_recommendation}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Tier section ───────────────────────────────────────────────────────────── */
function TierSection({ tierKey, locations, defaultOpen }: {
  tierKey: string
  locations: HotspotLocation[]
  defaultOpen: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const cfg = getTierConfig(tierKey)

  if (locations.length === 0) return null

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Section header — collapsible */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', textAlign: 'left', cursor: 'pointer', border: 'none',
          padding: '18px 16px',
          background: cfg.bgColor,
          borderLeft: `3px solid ${cfg.color}`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, letterSpacing: '0.18em',
            color: cfg.color, textTransform: 'uppercase'
          }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: 12, fontWeight: 700, color: colors.white }}>
            {cfg.shortLabel}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 700,
            background: cfg.color + '22', color: cfg.color,
            padding: '2px 8px', letterSpacing: '0.1em',
          }}>
            {locations.length} location{locations.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 10, color: colors.captionGray, maxWidth: 420, textAlign: 'right', lineHeight: 1.4 }}>
            {cfg.desc.split('.')[0]}.
          </span>
          <span style={{ fontSize: 10, color: colors.captionGray, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s', display: 'inline-block' }}>▼</span>
        </div>
      </button>

      {/* Table header */}
      {open && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: '90px minmax(0,1fr) 120px 80px 100px 110px 24px',
          padding: '8px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(255,255,255,0.02)',
          gap: 8,
        }}>
          {['TIER', 'LOCATION', 'PERSISTENCE', 'AVG/WK', 'TOP VIOLATION', 'TREND', ''].map((h, i) => (
            <span key={i} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: colors.captionGray }}>
              {h}
            </span>
          ))}
        </div>
      )}

      {/* Rows */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ overflow: 'hidden' }}
          >
            {locations.map((loc, i) => (
              <LocationRow key={loc.location_name} loc={loc} index={i} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Main page ───────────────────────────────────────────────────────────────── */
export default function HotspotsPage() {
  const [report,  setReport]  = useState<Report | null>(null)
  const [loading, setLoading] = useState(true)
  const [offline, setOffline] = useState(false)
  const [search,  setSearch]  = useState('')
  const [tierFilter, setTierFilter] = useState<'all' | '1' | '2' | '3'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    setOffline(false)
    try {
      const res = await fetch(`${API_BASE}/api/hotspots/persistent-escalation-report`)
      if (!res.ok) throw new Error('api error')
      setReport(await res.json())
    } catch {
      setOffline(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { window.scrollTo(0, 0); load() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /* Filter locations */
  const filtered = useMemo(() => {
    if (!report) return []
    let locs = report.locations
    if (tierFilter !== 'all') {
      locs = locs.filter(l => l.escalation_tier.startsWith(`TIER ${tierFilter}`))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      locs = locs.filter(l =>
        l.location_name.toLowerCase().includes(q) ||
        l.police_station.toLowerCase().includes(q) ||
        l.dominant_violation_type.toLowerCase().includes(q)
      )
    }
    return locs
  }, [report, tierFilter, search])

  const tier1Locs = filtered.filter(l => l.escalation_tier.includes('TIER 1'))
  const tier2Locs = filtered.filter(l => l.escalation_tier.includes('TIER 2'))
  const tier3Locs = filtered.filter(l => l.escalation_tier.includes('TIER 3'))

  return (
    <>
      <Nav />
      <main style={{ background: colors.black, color: colors.white, minHeight: '100vh', paddingTop: 60 }}>

        {/* ── Page header ──────────────────────────────────────────── */}
        <div style={{
          padding: 'clamp(48px,6vw,80px) clamp(24px,6vw,120px) 40px',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
        }}>
          <motion.p
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 14 }}
          >
            Module 06 — Persistent Hotspot Escalation Engine · Nov 2023 – Apr 2024
          </motion.p>

          <motion.h1
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.06 }}
            style={{ fontSize: 'clamp(28px,5vw,72px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, marginBottom: 16 }}
          >
            PERSISTENT<br />
            <span style={{ color: colors.amber }}>HOTSPOTS.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.12 }}
            style={{ fontSize: 'clamp(13px,1.5vw,17px)', color: 'rgba(255,255,255,0.55)', maxWidth: 640, lineHeight: 1.7, marginBottom: 32 }}
          >
            Locations where violations recur every week despite ongoing enforcement. Detection and ticketing already happen here — repeatedly, for months. Where the data shows enforcement alone isn't working, LaneShift identifies the correct escalation path within BTP's actual authority.
          </motion.p>

          {/* KPI row */}
          {report && (
            <motion.div
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: EASE, delay: 0.18 }}
              style={{ display: 'flex', gap: 0, flexWrap: 'wrap', marginBottom: 32 }}
            >
              {[
                { num: report.tier_1_count, label: 'Civic Escalation Required', color: '#f85149', sub: '≥85% weeks, not improving' },
                { num: report.tier_2_count, label: 'Adjust Enforcement', color: colors.amber, sub: '≥60% weeks recurring' },
                { num: report.tier_3_count, label: 'Standard Monitoring', color: 'rgba(255,255,255,0.4)', sub: '<60% weeks, manageable' },
                { num: report.total_locations, label: 'Total Locations Analysed', color: colors.white, sub: `across ${report.dataset_weeks} weeks` },
              ].map((kpi, i) => (
                <div key={kpi.label} style={{
                  padding: '20px 28px',
                  borderTop: '1px solid rgba(255,255,255,0.07)',
                  borderRight: i < 3 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                  minWidth: 160,
                }}>
                  <p style={{ fontSize: 'clamp(28px,4vw,48px)', fontWeight: 900, letterSpacing: '-0.04em', color: kpi.color, lineHeight: 1, marginBottom: 6 }}>
                    {kpi.num}
                  </p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: colors.white, marginBottom: 3 }}>{kpi.label}</p>
                  <p style={{ fontSize: 10, color: colors.captionGray }}>{kpi.sub}</p>
                </div>
              ))}
            </motion.div>
          )}

          {/* Scope note */}
          <div style={{ maxWidth: 700, padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', gap: 12 }}>
            <div style={{ width: 2, background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>
              {report?.scope_note ?? 'Tier 1 = present ≥85% of weeks, not improving — warrants civic escalation. Tier 2 = present ≥60% of weeks — warrants enforcement adjustment. Tier 3 = present <60% of weeks — standard monitoring.'}
            </p>
          </div>
        </div>

        {/* ── Filters + search ─────────────────────────────────────── */}
        <div style={{
          padding: '20px clamp(24px,6vw,120px)',
          borderBottom: '1px solid rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap',
        }}>
          {/* Tier filter pills */}
          <div style={{ display: 'flex', gap: 6 }}>
            {([['all','All Tiers'], ['1','Tier 1'], ['2','Tier 2'], ['3','Tier 3']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setTierFilter(v)} style={{
                padding: '5px 14px', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em',
                textTransform: 'uppercase', cursor: 'pointer', fontFamily: 'inherit',
                background: tierFilter === v ? colors.white : 'transparent',
                color: tierFilter === v ? colors.black : colors.captionGray,
                border: `1px solid ${tierFilter === v ? colors.white : 'rgba(255,255,255,0.15)'}`,
                transition: 'all 0.15s',
              }}>
                {label}
              </button>
            ))}
          </div>

          {/* Search */}
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by location, station, or violation type…"
            style={{
              flex: 1, minWidth: 240, maxWidth: 400,
              padding: '7px 12px', background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.12)', color: colors.white,
              fontSize: 11, fontFamily: 'inherit', outline: 'none',
            }}
          />

          {/* Result count */}
          {(search || tierFilter !== 'all') && (
            <span style={{ fontSize: 10, color: colors.captionGray }}>
              {filtered.length} location{filtered.length !== 1 ? 's' : ''} shown
            </span>
          )}

          {/* Refresh */}
          <button onClick={load} disabled={loading} style={{
            marginLeft: 'auto', padding: '6px 16px', background: 'transparent',
            border: '1px solid rgba(255,255,255,0.15)', color: loading ? colors.captionGray : colors.white,
            fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
            cursor: loading ? 'default' : 'pointer', fontFamily: 'inherit',
          }}>
            {loading ? '↻ Loading…' : '↻ Refresh'}
          </button>
        </div>

        {/* ── Content ───────────────────────────────────────────────── */}
        <div style={{ padding: '0 clamp(24px,6vw,120px) clamp(64px,8vw,100px)' }}>
          {loading ? (
            <div style={{ paddingTop: 40 }}>
              {[1,2,3,4,5,6].map(i => <Skel key={i} h={14} />)}
            </div>
          ) : offline ? (
            <div style={{ paddingTop: 48, maxWidth: 480 }}>
              <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#f85149', marginBottom: 10 }}>
                BACKEND OFFLINE
              </p>
              <p style={{ fontSize: 13, color: colors.captionGray, lineHeight: 1.6 }}>
                Start the FastAPI server at localhost:8000 to load the escalation report.
              </p>
            </div>
          ) : (
            <div style={{ paddingTop: 24 }}>
              <TierSection
                tierKey="TIER 1 - ESCALATE TO CIVIC AUTHORITY"
                locations={tier1Locs}
                defaultOpen={true}
              />
              <TierSection
                tierKey="TIER 2 - ADJUST ENFORCEMENT APPROACH"
                locations={tier2Locs}
                defaultOpen={tierFilter === '2' || search !== ''}
              />
              <TierSection
                tierKey="TIER 3 - STANDARD MONITORING"
                locations={tier3Locs}
                defaultOpen={tierFilter === '3' || search !== ''}
              />

              {filtered.length === 0 && (
                <p style={{ paddingTop: 48, fontSize: 13, color: colors.captionGray, textAlign: 'center' }}>
                  No locations match the current filter.
                </p>
              )}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
