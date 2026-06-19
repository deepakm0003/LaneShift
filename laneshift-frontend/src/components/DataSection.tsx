/**
 * DataSection
 * ════════════
 * Black-background section dramatizing the real dataset numbers.
 *
 * Layout:
 *  1. Section label
 *  2. Four stat blocks in a row (stack on mobile) — each with AnimatedCounter
 *  3. Short paragraph explaining the 61.23% finding
 *  4. Thin divider + data provenance label
 */

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import AnimatedCounter from './AnimatedCounter'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -60px 0px', amount: threshold })
  return { ref, inView }
}

function fadeUpVariant(delay = 0) {
  return {
    hidden: { opacity: 0, y: 24 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.5, ease: EASE, delay },
    },
  }
}

/* ── Single stat block ───────────────────────────────────────────────────── */
interface StatProps {
  target: number
  suffix?: string
  prefix?: string
  decimals?: number
  label: string
  sublabel?: string
  accent?: boolean   // amber color on the number
  delay: number
}

function StatBlock({ target, suffix = '', prefix = '', decimals = 0, label, sublabel, accent = false, delay }: StatProps) {
  const { ref, inView } = useReveal()

  return (
    <motion.div
      ref={ref}
      variants={fadeUpVariant(delay)}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      style={{
        flex: 1,
        minWidth: 180,
        padding: 'clamp(24px, 2.5vw, 36px) 0',
        borderTop: `1px solid ${colors.borderDark}`,
      }}
    >
      {/* Number */}
      <div
        style={{
          fontSize: 'clamp(44px, 6.5vw, 96px)',
          fontWeight: 900,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          fontVariantNumeric: 'tabular-nums',
          color: accent ? colors.amber : colors.white,
          marginBottom: 12,
        }}
      >
        {inView ? (
          <AnimatedCounter
            target={target}
            suffix={suffix}
            prefix={prefix}
            decimals={decimals}
            duration={1800}
            color={accent ? colors.amber : colors.white}
          />
        ) : (
          <span style={{ color: accent ? colors.amber : colors.white }}>
            {prefix}0{suffix}
          </span>
        )}
      </div>

      {/* Primary label */}
      <p
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: accent ? colors.amber : colors.captionGray,
          lineHeight: 1.4,
        }}
      >
        {label}
      </p>

      {/* Sublabel */}
      {sublabel && (
        <p
          style={{
            marginTop: 6,
            fontSize: 13,
            color: colors.captionGray,
            lineHeight: 1.5,
            maxWidth: 200,
          }}
        >
          {sublabel}
        </p>
      )}
    </motion.div>
  )
}

/* ── Main section ────────────────────────────────────────────────────────── */
export default function DataSection() {
  const labelReveal = useReveal()
  const parasReveal = useReveal()

  return (
    <section
      id="stats"
      style={{
        background: colors.black,
        color: colors.white,
        padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 120px)',
      }}
    >
      {/* Section label */}
      <motion.p
        ref={labelReveal.ref}
        variants={fadeUpVariant(0)}
        initial="hidden"
        animate={labelReveal.inView ? 'visible' : 'hidden'}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: colors.captionGray,
          marginBottom: 48,
        }}
      >
        Real Numbers · Bengaluru BTP Dataset · Nov 2023 – Apr 2024
      </motion.p>

      {/* Stat blocks */}
      <div
        style={{
          display: 'flex',
          gap: 'clamp(32px, 4vw, 64px)',
          flexWrap: 'wrap',
          marginBottom: 'clamp(56px, 8vw, 96px)',
        }}
      >
        <StatBlock
          target={298450}
          label="Violations, 5 months"
          sublabel="Across 27 violation categories and 3,070 deployed cameras"
          delay={0.0}
        />
        <StatBlock
          target={61.23}
          suffix="%"
          decimals={2}
          label="Never reach a resolved outcome"
          sublabel="Rejected, stuck in pipeline, or never given a status at all"
          accent
          delay={0.1}
        />
        <StatBlock
          target={27}
          label="Violation categories tracked"
          sublabel="From DOUBLE PARKING (severity 10) to mobile phone use (severity 2)"
          delay={0.2}
        />
        <StatBlock
          target={3070}
          label="Active detection devices"
          sublabel="Already deployed — LaneShift needs no new hardware"
          delay={0.3}
        />
      </div>

      {/* Explanation paragraph */}
      <motion.div
        ref={parasReveal.ref}
        variants={fadeUpVariant(0)}
        initial="hidden"
        animate={parasReveal.inView ? 'visible' : 'hidden'}
        style={{ maxWidth: 680 }}
      >
        <div style={{ height: 1, background: colors.borderDark, marginBottom: 36 }} />

        <p
          style={{
            fontSize: 'clamp(16px, 1.8vw, 20px)',
            fontWeight: 400,
            color: colors.white,
            opacity: 0.8,
            lineHeight: 1.7,
          }}
        >
          Bengaluru's existing system flags violations constantly. But validation,
          review, and resolution lag badly — most flagged violations are{' '}
          <span style={{ color: colors.white, fontWeight: 600 }}>
            rejected, stuck, or never given a status at all.
          </span>{' '}
          LaneShift doesn't add more detection. It fixes what happens after detection.
        </p>

        {/* Recovery stat */}
        <div
          style={{
            marginTop: 40,
            padding: '24px 28px',
            border: `1px solid ${colors.borderDark}`,
            display: 'inline-block',
          }}
        >
          <p
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: colors.captionGray,
              marginBottom: 8,
            }}
          >
            Under LaneShift Governance
          </p>
          <p
            style={{
              fontSize: 'clamp(22px, 3vw, 36px)',
              fontWeight: 900,
              color: colors.amber,
              letterSpacing: '-0.03em',
              lineHeight: 1.1,
            }}
          >
            85.17% of rejected/stuck violations
          </p>
          <p
            style={{
              fontSize: 14,
              color: colors.captionGray,
              marginTop: 6,
              lineHeight: 1.5,
            }}
          >
            met all four objective auto-validation criteria — unambiguous violation type,
            uncontested vehicle identity, passed upstream SCITA check, below top-2
            severity tiers. Reviewed and verified against all 57,476 records.
          </p>
        </div>
      </motion.div>
    </section>
  )
}
