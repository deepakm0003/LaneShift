/**
 * LiveDataSection — Main page teaser
 * ════════════════════════════════════
 * Stripped to essentials on the landing page:
 *  - Headline + live badge
 *  - Recovery stat (the single most powerful number)
 *  - Two CTA buttons: "Open Live Dashboard" + "View Dataset Results"
 *
 * All detail lives on /live and /results pages.
 */
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { useDashboard } from '../hooks/useDashboard'
import AnimatedCounter from './AnimatedCounter'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

function useReveal() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px', amount: 0.1 })
  return { ref, inView }
}

/* ── LIVE badge ──────────────────────────────────────────────────────────── */
function LiveBadge() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 16 }}>
      <motion.span
        animate={{ opacity: [1, 0.3, 1] }}
        transition={{ duration: 1.2, repeat: Infinity }}
        style={{ width: 6, height: 6, borderRadius: '50%', background: colors.amber, display: 'inline-block' }}
      />
      <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: colors.amber }}>
        LIVE
      </span>
    </span>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function LiveDataSection() {
  const { data, loading, isLive, refetch } = useDashboard()
  const { ref: headRef, inView: headIn }   = useReveal()
  const { ref: statRef, inView: statIn }   = useReveal()

  const recoveryPct = data?.validation_leak_summary?.projected_void_recovery_pct ?? 23.75

  return (
    <section
      id="livedata"
      style={{
        background: colors.black,
        color: colors.white,
        padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 120px)',
      }}
    >
      {/* ── Section label ─────────────────────────────────────────── */}
      <motion.p
        ref={headRef}
        initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 20 }}
      >
        Live System Output · Bengaluru BTP Dataset · Nov 2023 – Apr 2024
      </motion.p>

      {/* ── Headline ──────────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE, delay: 0.07 }}
        style={{ marginBottom: 16 }}
      >
        <h2 style={{
          fontSize: 'clamp(28px, 5vw, 72px)', fontWeight: 900,
          letterSpacing: '-0.03em', lineHeight: 1.0, display: 'inline',
        }}>
          THIS IS RUNNING ON<br /><span style={{ color: colors.amber }}>REAL DATA.</span>
        </h2>
        {isLive && <LiveBadge />}
      </motion.div>

      <motion.p
        initial={{ opacity: 0, y: 16 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE, delay: 0.14 }}
        style={{ fontSize: 'clamp(14px, 1.5vw, 17px)', color: 'rgba(255,255,255,0.6)', maxWidth: 540, lineHeight: 1.65, marginBottom: 40 }}
      >
        Not a mockup. Live from Bengaluru Traffic Police's own Nov 2023 – Apr 2024 dataset. 298,450 violations, 6 months, 27 violation categories.
      </motion.p>

      {/* ── Recovery hero stat ────────────────────────────────────── */}
      <motion.div
        ref={statRef}
        initial={{ opacity: 0, y: 16 }} animate={statIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          padding: 'clamp(24px, 3vw, 40px)',
          border: `1px solid rgba(255,199,0,0.25)`,
          maxWidth: 560,
          marginBottom: 40,
        }}
      >
        <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.amber, marginBottom: 10 }}>
          LaneShift Recovery Projection
        </p>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
          <span style={{ fontSize: 'clamp(40px, 6vw, 72px)', fontWeight: 900, letterSpacing: '-0.04em', color: colors.amber, lineHeight: 1 }}>
            {statIn
              ? <AnimatedCounter target={recoveryPct} decimals={2} suffix="%" duration={1600} color={colors.amber} />
              : <span style={{ color: colors.amber }}>0%</span>
            }
          </span>
        </div>
        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
          of all 298,450 violations — currently falling into a null-status void — would have been auto-approved under LaneShift governance.
        </p>
      </motion.div>

      {/* ── CTA buttons ───────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={statIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.4, ease: EASE, delay: 0.15 }}
        style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}
      >
        {/* Primary — live dashboard */}
        <a
          href="/live"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 12, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
            color: colors.black, background: colors.amber,
            padding: '12px 28px', transition: 'background 0.18s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = colors.white)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = colors.amber)}
        >
          Open Live Dashboard →
        </a>

        {/* Secondary — dataset results */}
        <a
          href="/results"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
            color: colors.white, background: 'transparent',
            border: `1px solid rgba(255,255,255,0.2)`, padding: '12px 24px',
            transition: 'border-color 0.18s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = colors.white)}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.2)')}
        >
          View Dataset Results →
        </a>

        {/* Refresh (small, subtle) */}
        <button
          onClick={refetch}
          disabled={loading}
          style={{
            background: 'none', border: 'none', cursor: loading ? 'default' : 'pointer',
            fontSize: 11, color: loading ? colors.captionGray : 'rgba(255,255,255,0.35)',
            fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
            padding: 0, fontFamily: 'inherit',
          }}
        >
          {loading ? '↻ Loading...' : '↻ Refresh'}
        </button>
      </motion.div>
    </section>
  )
}
