/**
 * Visual 1 — Detection Scene
 * Top-down street with 3 parked cars. One gets scanned with amber bounding box.
 * Loops every 5 seconds. Pure SVG + Framer Motion. No moving car paths.
 */
import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

const AMBER = '#FFC700'
const WHITE = '#FFFFFF'
const DIM   = 'rgba(255,255,255,0.18)'
const EASE  = [0.22, 1, 0.36, 1] as const

export default function Visual1Detection() {
  const [phase, setPhase] = useState<'idle' | 'scanning' | 'detected' | 'reset'>('idle')

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>
    const cycle = () => {
      setPhase('scanning')
      t = setTimeout(() => { setPhase('detected') }, 900)
      t = setTimeout(() => { setPhase('reset') },    3200)
      t = setTimeout(() => { setPhase('idle');  cycle() }, 4200)
    }
    const start = setTimeout(cycle, 600)
    return () => { clearTimeout(t); clearTimeout(start) }
  }, [])

  const scanning  = phase === 'scanning' || phase === 'detected'
  const detected  = phase === 'detected'

  return (
    <svg width="100%" viewBox="0 0 420 300" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">

      {/* ── Road lanes ─────────────────────────────────────────────── */}
      <rect x="60"  y="0"   width="300" height="300" fill="rgba(255,255,255,0.03)" rx="2" />
      {/* Lane dividers */}
      <line x1="160" y1="0"   x2="160" y2="300" stroke={DIM} strokeWidth="1" strokeDasharray="12 10" />
      <line x1="260" y1="0"   x2="260" y2="300" stroke={DIM} strokeWidth="1" strokeDasharray="12 10" />
      {/* Kerb lines */}
      <line x1="60"  y1="0"   x2="60"  y2="300" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      <line x1="360" y1="0"   x2="360" y2="300" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {/* Road edge markings */}
      <line x1="60"  y1="0"   x2="360" y2="0"   stroke="rgba(255,255,255,0.12)" strokeWidth="1" />
      <line x1="60"  y1="300" x2="360" y2="300" stroke="rgba(255,255,255,0.12)" strokeWidth="1" />

      {/* ── Car 1 — parked left kerb (passive) ────────────────────── */}
      <g transform="translate(72, 60)">
        <rect x="0" y="0" width="24" height="44" rx="3" fill={WHITE} opacity="0.55" />
        <rect x="3" y="3" width="18" height="12" rx="1.5" fill="#000" opacity="0.5" />
        <rect x="3" y="30" width="18" height="10" rx="1.5" fill="#000" opacity="0.5" />
      </g>

      {/* ── Car 2 — parked left kerb (passive) ────────────────────── */}
      <g transform="translate(72, 180)">
        <rect x="0" y="0" width="24" height="44" rx="3" fill={WHITE} opacity="0.55" />
        <rect x="3" y="3" width="18" height="12" rx="1.5" fill="#000" opacity="0.5" />
        <rect x="3" y="30" width="18" height="10" rx="1.5" fill="#000" opacity="0.5" />
      </g>

      {/* ── Car 3 — HIGHLIGHTED target (right side, mid-block) ────── */}
      <g transform="translate(325, 118)">
        <rect x="0" y="0" width="24" height="44" rx="3"
          fill={scanning ? WHITE : 'rgba(255,255,255,0.55)'}
          opacity={scanning ? 1 : 0.55}
        />
        <rect x="3" y="3" width="18" height="12" rx="1.5" fill="#000" opacity="0.5" />
        <rect x="3" y="30" width="18" height="10" rx="1.5" fill="#000" opacity="0.5" />
      </g>

      {/* ── Bounding box around Car 3 ─────────────────────────────── */}
      <AnimatePresence>
        {scanning && (
          <motion.g
            key="bbox"
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            style={{ originX: '349px', originY: '140px' } as React.CSSProperties}
          >
            {/* Corner brackets */}
            <polyline points="305,102 305,112 315,112" stroke={AMBER} strokeWidth="1.8" fill="none" />
            <polyline points="375,102 375,112 365,112" stroke={AMBER} strokeWidth="1.8" fill="none" />
            <polyline points="305,178 305,168 315,168" stroke={AMBER} strokeWidth="1.8" fill="none" />
            <polyline points="375,178 375,168 365,168" stroke={AMBER} strokeWidth="1.8" fill="none" />
            {/* Scan line sweeping */}
            <motion.line
              x1="305" x2="375"
              initial={{ y1: 108, y2: 108 }}
              animate={{ y1: [108, 172, 108], y2: [108, 172, 108] }}
              transition={{ duration: 1.2, ease: 'linear', repeat: detected ? 0 : Infinity }}
              stroke={AMBER} strokeWidth="1" opacity="0.7"
            />
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Detected label ─────────────────────────────────────────── */}
      <AnimatePresence>
        {detected && (
          <motion.g
            key="label"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
          >
            <rect x="192" y="102" width="108" height="30" fill={AMBER} rx="0" />
            <text
              x="246" y="121"
              textAnchor="middle"
              fill="#000"
              fontSize="9"
              fontWeight="800"
              fontFamily="'Inter', monospace"
              letterSpacing="0.1"
            >
              WRONG PARKING
            </text>
            <text
              x="246" y="131"
              textAnchor="middle"
              fill="rgba(0,0,0,0.65)"
              fontSize="7.5"
              fontWeight="700"
              fontFamily="'Inter', monospace"
              letterSpacing="0.08"
            >
              DETECTED · 10:14 IST
            </text>
            {/* Arrow pointing right to car */}
            <polyline points="300,117 310,117" stroke="#000" strokeWidth="1.5" fill="none" markerEnd="url(#arrow)" />
          </motion.g>
        )}
      </AnimatePresence>

      {/* ── Device label ───────────────────────────────────────────── */}
      <text x="66" y="296" fill="rgba(255,255,255,0.2)" fontSize="8" fontFamily="'Inter',monospace" letterSpacing="0.1">
        DEVICE · BTP-CAM-1847
      </text>
    </svg>
  )
}
