/**
 * Visual 4 — Before/After Pipeline Comparison
 * Left: old pipeline → stuck. Right: LaneShift gate → resolved.
 */
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const AMBER = '#FFC700'
const WHITE = '#FFFFFF'
const GRAY  = '#888888'
const RED   = '#f85149'
const EASE  = [0.22, 1, 0.36, 1] as const

function Node({
  label, sub, color = WHITE, delay = 0, inView = false,
}: {
  label: string; sub?: string; color?: string; delay?: number; inView?: boolean
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={inView ? { opacity: 1, scale: 1 } : {}}
      transition={{ duration: 0.4, ease: EASE, delay }}
      style={{
        border: `1px solid ${color === WHITE ? 'rgba(0,0,0,0.15)' : color}`,
        padding: '10px 14px',
        background: color === AMBER ? `${AMBER}18` : color === RED ? `${RED}12` : 'rgba(0,0,0,0.03)',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: 120,
        textAlign: 'center',
      }}
    >
      <span style={{ fontSize: 11, fontWeight: 800, color: color === WHITE ? '#000' : color }}>{label}</span>
      {sub && <span style={{ fontSize: 9, color: GRAY, marginTop: 3 }}>{sub}</span>}
    </motion.div>
  )
}

function Arrow({ delay = 0, inView = false, color = GRAY }: { delay?: number; inView?: boolean; color?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={inView ? { opacity: 1 } : {}}
      transition={{ delay }}
      style={{ fontSize: 18, color, margin: '0 2px', userSelect: 'none', lineHeight: 1 }}
    >
      →
    </motion.div>
  )
}

export default function Visual4Validation() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <div ref={ref} style={{ width: '100%', maxWidth: 480 }}>
      {/* BEFORE */}
      <motion.p
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0 }}
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: RED, marginBottom: 12 }}
      >
        Today — Manual Pipeline
      </motion.p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 32 }}>
        <Node label="Violation" sub="Flagged" delay={0.1} inView={inView} />
        <Arrow delay={0.25} inView={inView} />
        <Node label="Officer" sub="Manual review" delay={0.35} inView={inView} />
        <Arrow delay={0.5} inView={inView} />
        <Node label="???" sub="Rejected / Stuck" color={RED} delay={0.6} inView={inView} />
      </div>
      <motion.p
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.7 }}
        style={{ fontSize: 12, color: RED, marginBottom: 32, lineHeight: 1.5 }}
      >
        57,476 violations rejected, stuck, or silently dropped each cycle.
      </motion.p>

      {/* Divider */}
      <motion.div
        initial={{ scaleX: 0 }} animate={inView ? { scaleX: 1 } : {}}
        transition={{ delay: 0.8, duration: 0.4 }}
        style={{ height: 1, background: 'rgba(0,0,0,0.1)', marginBottom: 28, transformOrigin: 'left' }}
      />

      {/* AFTER */}
      <motion.p
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 0.9 }}
        style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AMBER, marginBottom: 12 }}
      >
        LaneShift — Auto-Validation Gate
      </motion.p>
      <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 16 }}>
        <Node label="Violation" sub="Flagged" delay={1.0} inView={inView} />
        <Arrow delay={1.15} inView={inView} color={AMBER} />
        <Node label="Auto-Gate" sub="4-criteria check" color={AMBER} delay={1.25} inView={inView} />
        <Arrow delay={1.4} inView={inView} color={AMBER} />
        <Node label="Resolved" sub="Challan issued" color={AMBER} delay={1.5} inView={inView} />
      </div>
      <motion.p
        initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}} transition={{ delay: 1.7 }}
        style={{ fontSize: 12, color: GRAY, lineHeight: 1.5 }}
      >
        85.17% of rejected/stuck cases were objectively clean — unambiguous violation type,
        confirmed vehicle identity, passed SCITA, below high-severity threshold.
      </motion.p>
    </div>
  )
}
