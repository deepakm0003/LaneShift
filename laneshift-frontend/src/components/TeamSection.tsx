/**
 * TeamSection — "THE TEAM" — black background
 * Clean, minimal team + hackathon context section.
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

const FACTS = [
  { label: 'Dataset', value: '298,450 real BTP violation records' },
  { label: 'Period', value: 'Nov 2023 – Apr 2024' },
  { label: 'Camera devices', value: '3,070 unique device IDs' },
  { label: 'Violation categories', value: '27 offence codes analysed' },
  { label: 'Backend', value: 'FastAPI + SQLite · 16 endpoints' },
  { label: 'Tests', value: '48 automated assertions, all passing' },
]

export default function TeamSection() {
  const { ref: headRef, inView: headIn } = useReveal()
  const { ref: factsRef, inView: factsIn } = useReveal()

  return (
    <section
      id="team"
      style={{
        background: colors.black,
        color: colors.white,
        padding: 'clamp(80px, 10vw, 140px) clamp(24px, 6vw, 120px)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'clamp(48px, 6vw, 96px)', alignItems: 'start' }}>

        {/* Left: context */}
        <div ref={headRef}>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: EASE }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 20 }}
          >
            Gridlock Hackathon 2.0 · Flipkart · Theme 1
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 24 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: EASE, delay: 0.07 }}
            style={{ fontSize: 'clamp(28px, 4.5vw, 60px)', fontWeight: 900, letterSpacing: '-0.03em', lineHeight: 1.05, marginBottom: 24 }}
          >
            BUILT IN<br /><span style={{ color: colors.amber }}>72 HOURS.</span>
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: EASE, delay: 0.14 }}
            style={{ fontSize: 'clamp(15px, 1.6vw, 18px)', color: colors.white, opacity: 0.7, lineHeight: 1.7, maxWidth: 460 }}
          >
            LaneShift is a solo submission to Flipkart's Gridlock Hackathon 2.0,
            Theme 1: AI-driven parking enforcement intelligence for Bengaluru
            Traffic Police.
          </motion.p>

          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: EASE, delay: 0.2 }}
            style={{ marginTop: 16, fontSize: 'clamp(15px, 1.6vw, 18px)', color: colors.white, opacity: 0.7, lineHeight: 1.7, maxWidth: 460 }}
          >
            Every number on this site is derived from the actual BTP violation
            dataset — no synthetic data, no assumptions.
            The backend API is live, all 48 automated tests are passing, and
            the congestion-cost formula has been verified against all 298,450 records.
          </motion.p>

          <motion.a
            href="#contact"
            initial={{ opacity: 0, y: 20 }} animate={headIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.5, ease: EASE, delay: 0.28 }}
            style={{
              display: 'inline-block', marginTop: 32,
              color: colors.amber, fontSize: 13, fontWeight: 700,
              letterSpacing: '0.14em', textTransform: 'uppercase',
              textDecoration: 'none', border: `1px solid ${colors.amber}`,
              padding: '10px 24px',
            }}
          >
            Request a Demo
          </motion.a>
        </div>

        {/* Right: build facts */}
        <div ref={factsRef}>
          <motion.p
            initial={{ opacity: 0, y: 20 }} animate={factsIn ? { opacity: 1, y: 0 } : {}}
            transition={{ duration: 0.4, ease: EASE }}
            style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 24 }}
          >
            Build Facts
          </motion.p>

          {FACTS.map((fact, i) => (
            <motion.div
              key={fact.label}
              initial={{ opacity: 0, x: 16 }}
              animate={factsIn ? { opacity: 1, x: 0 } : {}}
              transition={{ duration: 0.4, ease: EASE, delay: 0.06 * i }}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
                padding: '14px 0', borderBottom: `1px solid ${colors.borderDark}`,
                gap: 16,
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.captionGray, flexShrink: 0 }}>
                {fact.label}
              </span>
              <span style={{ fontSize: 14, fontWeight: 600, color: colors.white, textAlign: 'right' }}>
                {fact.value}
              </span>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
