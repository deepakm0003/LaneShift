/**
 * Visual6Hotspot
 * ══════════════
 * Animated visual for Module 06 — Persistent Hotspot Escalation Engine.
 * Shows a location climbing through escalation tiers with persistence bars.
 */
import { motion } from 'framer-motion'
import { colors } from '../../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

const LOCATIONS = [
  { name: 'BTP051 - Safina Plaza',   ratio: 1.00, tier: 1, weeks: 23, avg: 672 },
  { name: 'BTP040 - Elite Junction', ratio: 1.00, tier: 1, weeks: 23, avg: 466 },
  { name: 'BTP027 - Modi Bridge',    ratio: 1.00, tier: 2, weeks: 23, avg: 199 },
  { name: 'BTP082 - KR Market',      ratio: 0.78, tier: 2, weeks: 18, avg: 94  },
  { name: 'Mid-block, Malleshwaram', ratio: 0.48, tier: 3, weeks: 11, avg: 31  },
]

function tierColor(t: number) {
  if (t === 1) return '#f85149'
  if (t === 2) return colors.amber
  return 'rgba(255,255,255,0.35)'
}

function tierLabel(t: number) {
  if (t === 1) return 'TIER 1 — ESCALATE'
  if (t === 2) return 'TIER 2 — ADJUST'
  return 'TIER 3 — MONITOR'
}

export default function Visual6Hotspot() {
  return (
    <div style={{
      width: '100%', maxWidth: 420,
      fontFamily: "'Inter', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 6 }}>
          Persistence Report · 23 Weeks
        </p>
        <div style={{ display: 'flex', gap: 16 }}>
          {[
            { color: '#f85149', label: 'TIER 1  57 locations' },
            { color: colors.amber, label: 'TIER 2  134 locations' },
            { color: 'rgba(255,255,255,0.3)', label: 'TIER 3  30 locations' },
          ].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
              <div style={{ width: 8, height: 8, background: color, flexShrink: 0 }} />
              <span style={{ fontSize: 8, color: colors.captionGray, fontWeight: 600 }}>{label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Location rows */}
      <div>
        {LOCATIONS.map((loc, i) => (
          <motion.div
            key={loc.name}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.45, ease: EASE, delay: 0.15 * i + 0.2 }}
            style={{ marginBottom: 14 }}
          >
            {/* Name row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: colors.white, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {loc.name}
              </span>
              <span style={{ fontSize: 8, fontWeight: 800, color: tierColor(loc.tier), letterSpacing: '0.1em', flexShrink: 0 }}>
                {tierLabel(loc.tier)}
              </span>
            </div>

            {/* Persistence bar */}
            <div style={{ position: 'relative', height: 5, background: 'rgba(255,255,255,0.07)' }}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${loc.ratio * 100}%` }}
                transition={{ duration: 0.8, ease: EASE, delay: 0.15 * i + 0.35 }}
                style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: tierColor(loc.tier) }}
              />
            </div>

            {/* Stats */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
              <span style={{ fontSize: 8, color: colors.captionGray }}>
                {loc.weeks}/23 weeks · {loc.avg} avg/wk
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, color: tierColor(loc.tier) }}>
                {Math.round(loc.ratio * 100)}%
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '18px 0 14px' }} />

      {/* Bottom stat */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 4 }}>
            Requires Civic Escalation
          </p>
          <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: '#f85149', lineHeight: 1 }}>
            57
          </p>
          <p style={{ fontSize: 9, color: colors.captionGray, marginTop: 2 }}>locations · 5 months of evidence</p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <p style={{ fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 4 }}>
            Adjust Enforcement
          </p>
          <p style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.04em', color: colors.amber, lineHeight: 1 }}>
            134
          </p>
          <p style={{ fontSize: 9, color: colors.captionGray, marginTop: 2 }}>locations recurring</p>
        </div>
      </div>
    </div>
  )
}
