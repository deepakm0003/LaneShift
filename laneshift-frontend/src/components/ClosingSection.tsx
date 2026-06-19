/**
 * ClosingSection — white background, final section before footer.
 */
import { useRef } from 'react'
import { motion, useInView } from 'framer-motion'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

export default function ClosingSection() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.2 })

  return (
    <section
      id="contact"
      style={{
        background: colors.white,
        color: colors.black,
        padding: 'clamp(80px, 12vw, 160px) clamp(24px, 6vw, 120px)',
        textAlign: 'center',
      }}
    >
      <div ref={ref} style={{ maxWidth: 800, margin: '0 auto' }}>

        {/* Label */}
        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE }}
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.2em',
            textTransform: 'uppercase', color: colors.captionGray, marginBottom: 20,
          }}
        >
          Gridlock Hackathon 2.0 · Flipkart · Theme 1
        </motion.p>

        {/* Headline */}
        <motion.h2
          initial={{ opacity: 0, y: 28 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: EASE, delay: 0.07 }}
          style={{
            fontSize: 'clamp(32px, 6vw, 88px)',
            fontWeight: 900,
            letterSpacing: '-0.03em',
            lineHeight: 1.0,
            color: colors.black,
            marginBottom: 32,
          }}
        >
          BUILT FOR BENGALURU.<br />
          <span style={{ color: colors.amber }}>READY FOR ANYWHERE.</span>
        </motion.h2>

        {/* Body */}
        <motion.p
          initial={{ opacity: 0, y: 20 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE, delay: 0.16 }}
          style={{
            fontSize: 'clamp(16px, 1.8vw, 20px)',
            fontWeight: 400,
            color: colors.black,
            opacity: 0.7,
            lineHeight: 1.7,
            maxWidth: 600,
            margin: '0 auto 40px',
          }}
        >
          Detection is a solved problem. The gap is prioritisation — ranking which
          violation, among thousands flagged simultaneously, actually matters right now.
          LaneShift closes that gap using the data your enforcement system already has.
        </motion.p>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5, ease: EASE, delay: 0.24 }}
          style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}
        >
          <a
            href="#livedata"
            style={{
              display: 'inline-block',
              background: colors.black,
              color: colors.white,
              fontWeight: 800,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '14px 40px',
              textDecoration: 'none',
              transition: 'background 0.18s, color 0.18s',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = colors.amber
              ;(e.currentTarget as HTMLElement).style.color = colors.black
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = colors.black
              ;(e.currentTarget as HTMLElement).style.color = colors.white
            }}
          >
            View the live system →
          </a>

          <a
            href="#module-1"
            style={{
              display: 'inline-block',
              background: 'transparent',
              color: colors.black,
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              padding: '14px 40px',
              textDecoration: 'none',
              border: `1px solid ${colors.borderLight}`,
              transition: 'border-color 0.18s',
            }}
            onMouseEnter={e => ((e.currentTarget as HTMLElement).style.borderColor = colors.black)}
            onMouseLeave={e => ((e.currentTarget as HTMLElement).style.borderColor = colors.borderLight)}
          >
            How it works
          </a>
        </motion.div>

        {/* Credit */}
        <motion.p
          initial={{ opacity: 0 }} animate={inView ? { opacity: 1 } : {}}
          transition={{ delay: 0.5 }}
          style={{
            marginTop: 56,
            fontSize: 11,
            color: colors.captionGray,
            letterSpacing: '0.08em',
          }}
        >
          Solo submission · Gridlock Hackathon 2.0 · Jun 2026 ·{' '}
          Built entirely on Bengaluru Traffic Police's real violation dataset
        </motion.p>
      </div>
    </section>
  )
}
