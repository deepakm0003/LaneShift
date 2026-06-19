/**
 * SystemSection — "THE SYSTEM" — black background
 * Shows the 5 modules of LaneShift as a numbered vertical timeline.
 */
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

function useReveal() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px', amount: 0.15 })
  return { ref, inView }
}

const MODULES = [
  {
    num: '01',
    title: 'Detection → Data Pipeline',
    status: 'Infrastructure',
    description:
      'Camera devices across Bengaluru flag violations — 3,070 devices, 298,450 events across 5 months. LaneShift ingests, cleans, and normalises this stream: vehicle number, violation type, location, timestamp, junction context.',
    tag: 'Module already exists at scale. LaneShift layers on top — no new hardware.',
  },
  {
    num: '02',
    title: 'Congestion-Cost Scoring',
    status: 'Core IP',
    description:
      'Every violation receives a 0–1000 score built from four weighted factors: time-of-day weight (peak 10 AM IST = 100), junction density weight (normalised violation history), violation severity weight (1–10 by carriageway obstruction), and a stacking multiplier for multi-violation records.',
    tag: 'Formula: (time×0.35 + junction×0.30 + severity×0.25 + stack×0.10) × stacking_multiplier × 10',
  },
  {
    num: '03',
    title: 'Live Dispatch Ranking',
    status: 'Operational',
    description:
      'Named-junction hotspots and mid-block geographic clusters (lat/lon rounded to 100m grid cells) are merged into one unified priority queue. Top 10% → Dispatch immediately. Next 30% → Route on standard patrol. Rest → Monitor.',
    tag: 'Single API call returns a ranked queue. No heatmap. An actual ranked list.',
  },
  {
    num: '04',
    title: 'Auto-Validation Engine',
    status: 'Simulated',
    description:
      'Low-ambiguity violations — single violation type, uncontested vehicle identity, passed upstream SCITA check, below severity tier 9 — auto-validate and route straight to challan. 85.17% of currently rejected/stuck records met all four criteria.',
    tag: 'Simulation verified against all 57,476 rejected/stuck records. Zero severity-9 leaks.',
  },
  {
    num: '05',
    title: 'Driver Nudge',
    status: 'Stub',
    description:
      'At flag-time, before a challan locks in, the vehicle owner receives the nearest available legal parking option. Converts the platform from pure punishment to citizen-assistive. Requires VAHAN/RTO API integration for production.',
    tag: 'Forward-looking module. Production requires vehicle registry API + live parking feed.',
  },
]

export default function SystemSection() {
  const { ref: headRef, inView: headIn } = useReveal()

  return (
    <section
      id="system"
      style={{
        background: colors.black,
        color: colors.white,
        padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 120px)',
      }}
    >
      {/* Label */}
      <motion.p
        ref={headRef}
        initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 20 }}
      >
        The Architecture
      </motion.p>

      {/* Headline */}
      <motion.h2
        initial={{ opacity: 0, y: 24 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE, delay: 0.07 }}
        style={{ fontSize: 'clamp(32px, 5.5vw, 80px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.0, maxWidth: 760, marginBottom: 'clamp(52px, 8vw, 96px)' }}
      >
        FIVE MODULES.<br />ONE DECISION.
      </motion.h2>

      {/* Module timeline */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        {MODULES.map((mod, i) => {
          const { ref, inView } = useReveal()
          return (
            <motion.div
              key={mod.num}
              ref={ref}
              initial={{ opacity: 0, y: 24 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.5, ease: EASE, delay: 0.05 * i }}
              style={{
                display: 'grid',
                gridTemplateColumns: '64px 1px 1fr',
                gap: '0 28px',
                paddingBottom: 48,
              }}
            >
              {/* Number */}
              <div style={{ paddingTop: 4 }}>
                <span style={{
                  fontSize: 'clamp(28px, 3.5vw, 44px)', fontWeight: 900,
                  color: mod.status === 'Core IP' ? colors.amber : colors.captionGray,
                  letterSpacing: '-0.04em', lineHeight: 1,
                }}>
                  {mod.num}
                </span>
              </div>

              {/* Vertical line */}
              <div style={{ background: colors.borderDark, width: 1, alignSelf: 'stretch' }} />

              {/* Content */}
              <div style={{ paddingLeft: 4 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ fontSize: 'clamp(16px, 2vw, 22px)', fontWeight: 800, color: colors.white, letterSpacing: '-0.02em' }}>
                    {mod.title}
                  </h3>
                  <span style={{
                    fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
                    textTransform: 'uppercase', padding: '3px 8px',
                    border: `1px solid ${mod.status === 'Core IP' ? colors.amber : mod.status === 'Simulated' ? colors.captionGray : colors.borderDark}`,
                    color: mod.status === 'Core IP' ? colors.amber : colors.captionGray,
                  }}>
                    {mod.status}
                  </span>
                </div>
                <p style={{ fontSize: 15, color: colors.white, opacity: 0.7, lineHeight: 1.65, maxWidth: 640, marginBottom: 10 }}>
                  {mod.description}
                </p>
                <p style={{ fontSize: 12, color: colors.captionGray, lineHeight: 1.5, fontStyle: 'italic' }}>
                  {mod.tag}
                </p>
              </div>
            </motion.div>
          )
        })}
      </div>
    </section>
  )
}
