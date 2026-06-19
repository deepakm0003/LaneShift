/**
 * ProblemSection
 * ═══════════════
 * White-background section establishing the enforcement intelligence gap.
 *
 * Uses three generic "approach" archetypes instead of competitor names —
 * describing categories of existing solutions and their shared blind spot.
 */

import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

function useReveal(threshold = 0.15) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -40px 0px', amount: threshold })
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

/* ── Approach card ───────────────────────────────────────────────────────── */
interface CardProps {
  tag: string
  title: string
  description: string
  solved: string[]
  delay: number
}

function ApproachCard({ tag, title, description, solved, delay }: CardProps) {
  const { ref, inView } = useReveal()
  return (
    <motion.div
      ref={ref}
      variants={fadeUpVariant(delay)}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      whileHover={{ y: -3, transition: { duration: 0.2 } }}
      style={{
        border: `1px solid ${colors.borderLight}`,
        padding: 'clamp(28px, 3vw, 44px)',
        flex: 1,
        minWidth: 240,
        background: colors.white,
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Tag */}
      <p
        style={{
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: colors.captionGray,
          marginBottom: 10,
        }}
      >
        {tag}
      </p>

      {/* Title */}
      <h3
        style={{
          fontSize: 'clamp(17px, 1.8vw, 22px)',
          fontWeight: 800,
          color: colors.black,
          letterSpacing: '-0.02em',
          lineHeight: 1.2,
          marginBottom: 12,
        }}
      >
        {title}
      </h3>

      {/* Description */}
      <p
        style={{
          fontSize: 14,
          color: colors.black,
          opacity: 0.6,
          lineHeight: 1.6,
          marginBottom: 24,
          flexGrow: 1,
        }}
      >
        {description}
      </p>

      {/* What it solves */}
      <div style={{ marginBottom: 20 }}>
        {solved.map((item, i) => (
          <p
            key={i}
            style={{
              fontSize: 13,
              color: colors.black,
              lineHeight: 1.5,
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              marginBottom: 6,
            }}
          >
            <span style={{ color: '#16a34a', fontWeight: 700, flexShrink: 0, marginTop: 1 }}>✓</span>
            {item}
          </p>
        ))}
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: colors.borderLight, margin: '4px 0 16px' }} />

      {/* The shared gap */}
      <p
        style={{
          fontSize: 13,
          color: colors.captionGray,
          lineHeight: 1.5,
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
        }}
      >
        <span style={{ color: '#dc2626', fontWeight: 700, flexShrink: 0 }}>✕</span>
        <span style={{ textDecoration: 'line-through', textDecorationColor: '#dc2626' }}>
          Ranks violations by real congestion impact
        </span>
      </p>
    </motion.div>
  )
}

/* ── Insight row ─────────────────────────────────────────────────────────── */
interface InsightProps {
  number: string
  label: string
  description: string
  delay: number
}

function InsightRow({ number, label, description, delay }: InsightProps) {
  const { ref, inView } = useReveal()
  return (
    <motion.div
      ref={ref}
      variants={fadeUpVariant(delay)}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      style={{
        display: 'flex',
        gap: 'clamp(16px, 2.5vw, 36px)',
        alignItems: 'flex-start',
        padding: '20px 0',
        borderTop: `1px solid ${colors.borderLight}`,
      }}
    >
      <span
        style={{
          fontSize: 'clamp(28px, 4vw, 48px)',
          fontWeight: 900,
          color: colors.black,
          letterSpacing: '-0.04em',
          lineHeight: 1,
          minWidth: 80,
          flexShrink: 0,
        }}
      >
        {number}
      </span>
      <div>
        <p
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: colors.captionGray,
            marginBottom: 4,
          }}
        >
          {label}
        </p>
        <p style={{ fontSize: 15, color: colors.black, opacity: 0.7, lineHeight: 1.55 }}>
          {description}
        </p>
      </div>
    </motion.div>
  )
}

/* ── Main section ────────────────────────────────────────────────────────── */
export default function ProblemSection() {
  const headlineReveal = useReveal()
  const conclusionReveal = useReveal()

  return (
    <section
      id="problem"
      style={{
        background: colors.white,
        color: colors.black,
        padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 120px)',
      }}
    >
      {/* Section label */}
      <motion.p
        ref={headlineReveal.ref}
        variants={fadeUpVariant(0)}
        initial="hidden"
        animate={headlineReveal.inView ? 'visible' : 'hidden'}
        style={{
          fontSize: 10,
          fontWeight: 700,
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: colors.captionGray,
          marginBottom: 20,
        }}
      >
        The Enforcement Gap
      </motion.p>

      {/* Headline */}
      <motion.h2
        variants={fadeUpVariant(0.07)}
        initial="hidden"
        animate={headlineReveal.inView ? 'visible' : 'hidden'}
        style={{
          fontSize: 'clamp(32px, 5.5vw, 80px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          lineHeight: 1.0,
          color: colors.black,
          maxWidth: 820,
          marginBottom: 20,
        }}
      >
        THE PROBLEM<br />ISN'T DETECTION.
      </motion.h2>

      {/* Subhead */}
      <motion.p
        variants={fadeUpVariant(0.14)}
        initial="hidden"
        animate={headlineReveal.inView ? 'visible' : 'hidden'}
        style={{
          fontSize: 'clamp(16px, 1.6vw, 20px)',
          fontWeight: 400,
          color: colors.black,
          opacity: 0.65,
          maxWidth: 580,
          lineHeight: 1.65,
          marginBottom: 'clamp(52px, 7vw, 80px)',
        }}
      >
        Every major enforcement system today stops at the moment of detection.
        None of them answer the harder question — which violation, among thousands
        flagged simultaneously, causes the most damage right now?
      </motion.p>

      {/* Three approach cards */}
      <div
        style={{
          display: 'flex',
          gap: 'clamp(14px, 2vw, 24px)',
          flexWrap: 'wrap',
          marginBottom: 'clamp(52px, 7vw, 80px)',
        }}
      >
        <ApproachCard
          tag="Approach 01 · Detection Layer"
          title="Real-Time Violation Monitoring"
          description="Computer-vision pipelines that flag illegal parking events the moment cameras see them. Fast, accurate, and already deployed at scale across major cities."
          solved={[
            'Flags violations in real time',
            'Eliminates manual patrol dependency',
            'High-confidence vehicle identification',
          ]}
          delay={0.0}
        />
        <ApproachCard
          tag="Approach 02 · Analytics Layer"
          title="Violation Identification & BI"
          description="Deep learning models that classify violation types and feed dashboards with aggregate patterns. Useful for strategy — not for deciding which patrol to dispatch now."
          solved={[
            'Classifies 27+ violation categories',
            'Historical pattern reporting',
            'Station-level compliance dashboards',
          ]}
          delay={0.1}
        />
        <ApproachCard
          tag="Approach 03 · Monetisation Layer"
          title="Legal Parking Payment Systems"
          description="Frictionless payment infrastructure for compliant parking. Solves revenue collection for operators — a fundamentally different problem from enforcement of illegal parking."
          solved={[
            'Seamless parking fee collection',
            'Vehicle fingerprint recognition',
            'Operator revenue optimization',
          ]}
          delay={0.2}
        />
      </div>

      {/* Three data insights from the actual dataset */}
      <div style={{ maxWidth: 860, marginBottom: 'clamp(48px, 6vw, 72px)' }}>
        <InsightRow
          number="164K"
          label="WRONG PARKING flags — same violation, every day"
          description="The top two violation types account for over 95% of all flags. This isn't a wide-net detection problem — it's a triage problem. Which of the 164,977 WRONG PARKING events is actively blocking Koramangala right now?"
          delay={0.0}
        />
        <InsightRow
          number="42%"
          label="Never enter the review pipeline at all"
          description="125,254 of 298,450 flagged violations have null validation status. They were detected, logged — and silently dropped. No existing system counts this loss, let alone prevents it."
          delay={0.08}
        />
        <InsightRow
          number="0"
          label="Systems that score violations by congestion impact"
          description="Not one funded product, academic paper, or deployed city system computes a per-violation congestion cost score and uses it to rank enforcement priority. That's the gap LaneShift fills."
          delay={0.16}
        />
      </div>

      {/* Amber conclusion */}
      <motion.div
        ref={conclusionReveal.ref}
        variants={fadeUpVariant(0)}
        initial="hidden"
        animate={conclusionReveal.inView ? 'visible' : 'hidden'}
        style={{ maxWidth: 760 }}
      >
        <div style={{ height: 1, background: colors.borderLight, marginBottom: 32 }} />
        <p
          style={{
            fontSize: 'clamp(18px, 2.4vw, 28px)',
            fontWeight: 800,
            color: colors.black,
            lineHeight: 1.35,
            letterSpacing: '-0.02em',
          }}
        >
          Nobody ranks violations by how much congestion they actually cause.{' '}
          <span style={{ color: colors.amber }}>That's the gap LaneShift closes.</span>
        </p>
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: colors.captionGray,
            lineHeight: 1.6,
            maxWidth: 560,
          }}
        >
          3,070 cameras are already running. The enforcement data already exists.
          What's missing is the layer that converts detection volume into a
          ranked, congestion-weighted dispatch queue — built on the same data
          Bengaluru Traffic Police already trusts.
        </p>
      </motion.div>
    </section>
  )
}
