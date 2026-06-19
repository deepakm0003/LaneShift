/**
 * Visual 2 — Congestion-Cost Score Builder
 * 4 bars fill up with stagger, then final score counts up in amber.
 */
import { useRef, useState, useEffect } from 'react'
import { motion, useInView } from 'framer-motion'
import AnimatedCounter from '../AnimatedCounter'

const AMBER  = '#FFC700'
const WHITE  = '#FFFFFF'
const GRAY   = '#888888'
const EASE   = [0.22, 1, 0.36, 1] as const

const BARS = [
  { label: 'Time-of-Day Weight',      pct: 88, weight: '35%' },
  { label: 'Junction Density',        pct: 72, weight: '30%' },
  { label: 'Violation Severity',      pct: 80, weight: '25%' },
  { label: 'Stacking Multiplier',     pct: 60, weight: '10%' },
]

export default function Visual2Score() {
  const ref  = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const [showScore, setShowScore] = useState(false)

  useEffect(() => {
    if (!inView) return
    const t = setTimeout(() => setShowScore(true), 1800)
    return () => clearTimeout(t)
  }, [inView])

  return (
    <div ref={ref} style={{ width: '100%', maxWidth: 420 }}>
      {/* Bars */}
      {BARS.map((bar, i) => (
        <div key={bar.label} style={{ marginBottom: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 7 }}>
            <span style={{
              fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: GRAY,
            }}>
              {bar.label}
            </span>
            <span style={{ fontSize: 10, fontWeight: 700, color: GRAY }}>
              {bar.weight}
            </span>
          </div>
          <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', position: 'relative' }}>
            <motion.div
              initial={{ width: 0 }}
              animate={inView ? { width: `${bar.pct}%` } : {}}
              transition={{ duration: 0.7, ease: EASE, delay: 0.2 * i + 0.3 }}
              style={{ position: 'absolute', top: 0, left: 0, height: '100%', background: WHITE }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
            <span style={{ fontSize: 10, color: GRAY }}>{bar.pct}/100</span>
          </div>
        </div>
      ))}

      {/* Divider + formula */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 1.4 }}
        style={{ height: 1, background: 'rgba(255,255,255,0.12)', margin: '24px 0' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE, delay: 1.6 }}
        style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}
      >
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
          textTransform: 'uppercase', color: GRAY,
        }}>
          Congestion Score →
        </span>

        {/* Animated final score */}
        <span style={{ fontSize: 'clamp(52px, 8vw, 84px)', fontWeight: 900, color: AMBER, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {showScore
            ? <AnimatedCounter target={847} duration={1200} color={AMBER} />
            : <span style={{ color: AMBER }}>0</span>
          }
        </span>
        <span style={{ fontSize: 22, fontWeight: 700, color: GRAY, letterSpacing: '-0.02em' }}>
          /1000
        </span>
      </motion.div>

      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 2.2 }}
        style={{ fontSize: 11, color: GRAY, marginTop: 6, fontStyle: 'italic' }}
      >
        WRONG PARKING · Koramangala · 10:14 IST · Single violation
      </motion.p>
    </div>
  )
}
