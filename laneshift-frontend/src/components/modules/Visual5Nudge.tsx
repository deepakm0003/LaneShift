/**
 * Visual 5 — Driver Nudge Phone Mock
 * Line-art phone outline with a notification sliding in.
 */
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'

const AMBER = '#FFC700'
const WHITE = '#FFFFFF'
const GRAY  = '#888888'
const EASE  = [0.22, 1, 0.36, 1] as const

export default function Visual5Nudge() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })

  return (
    <div ref={ref} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
      {/* Phone outline */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 0.5, ease: EASE }}
        style={{
          width: 220,
          height: 400,
          border: `2px solid rgba(255,255,255,0.25)`,
          borderRadius: 28,
          position: 'relative',
          background: '#0a0a0a',
          overflow: 'hidden',
          flexShrink: 0,
        }}
      >
        {/* Speaker notch */}
        <div style={{
          width: 60, height: 5, borderRadius: 3,
          background: 'rgba(255,255,255,0.15)',
          margin: '14px auto 0',
        }} />

        {/* Status bar */}
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          padding: '8px 16px 0',
        }}>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>10:14</span>
          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.4)' }}>●●●</span>
        </div>

        {/* Lock screen placeholder */}
        <div style={{ padding: '24px 16px 0', textAlign: 'center' }}>
          <p style={{ fontSize: 28, fontWeight: 900, color: 'rgba(255,255,255,0.1)', letterSpacing: '-0.04em' }}>
            10:14
          </p>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.08)' }}>17 June 2026</p>
        </div>

        {/* Notification card sliding in */}
        <motion.div
          initial={{ y: -80, opacity: 0 }}
          animate={inView ? { y: 0, opacity: 1 } : {}}
          transition={{ duration: 0.55, ease: EASE, delay: 0.7 }}
          style={{
            position: 'absolute',
            top: 90,
            left: 10,
            right: 10,
            background: 'rgba(255,255,255,0.96)',
            borderRadius: 12,
            padding: '12px 14px',
            boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
          }}
        >
          {/* App name row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
            <div style={{
              width: 22, height: 22, background: '#000', borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 8, fontWeight: 900, color: AMBER, letterSpacing: '0.05em' }}>LS</span>
            </div>
            <span style={{ fontSize: 9, fontWeight: 700, color: '#444', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              LaneShift
            </span>
            <span style={{ fontSize: 9, color: '#aaa', marginLeft: 'auto' }}>now</span>
          </div>

          {/* Notification body */}
          <p style={{ fontSize: 12, fontWeight: 800, color: '#000', marginBottom: 4, lineHeight: 1.3 }}>
            Parking violation flagged
          </p>
          <p style={{ fontSize: 11, color: '#333', lineHeight: 1.5, marginBottom: 10 }}>
            Nearest legal parking: <strong>140m</strong><br />
            <span style={{ color: '#000' }}>BBMP Lot C — ₹20/hr</span>
          </p>

          {/* Map pin row */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '7px 10px',
            background: AMBER,
            borderRadius: 4,
          }}>
            <svg width="12" height="14" viewBox="0 0 12 14" fill="none">
              <path d="M6 0C3.24 0 1 2.24 1 5c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5z" fill="#000"/>
              <circle cx="6" cy="5" r="1.8" fill={AMBER}/>
            </svg>
            <span style={{ fontSize: 10, fontWeight: 800, color: '#000', letterSpacing: '0.06em' }}>
              VIEW DIRECTIONS
            </span>
          </div>
        </motion.div>

        {/* Home bar */}
        <div style={{
          position: 'absolute', bottom: 8, left: '50%',
          transform: 'translateX(-50%)',
          width: 80, height: 4, borderRadius: 2,
          background: 'rgba(255,255,255,0.2)',
        }} />
      </motion.div>

      {/* Caption */}
      <motion.p
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : {}}
        transition={{ delay: 1.4 }}
        style={{
          fontSize: 11, color: GRAY, textAlign: 'center',
          letterSpacing: '0.06em', lineHeight: 1.5, maxWidth: 220,
          fontStyle: 'italic',
        }}
      >
        Sent before the challan locks in.<br />
        Move the vehicle, avoid the fine.
      </motion.p>
    </div>
  )
}
