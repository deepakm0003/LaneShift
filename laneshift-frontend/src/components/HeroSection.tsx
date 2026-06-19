/**
 * HeroSection
 * ════════════
 * Full-viewport-height black hero for LaneShift.
 *
 * Sections:
 *  1. Animated headline reveal — "ENFORCEMENT, REORDERED."
 *  2. One-sentence subhead
 *  3. Live counting number (0 → 298,450) with "VIOLATIONS ANALYZED" label
 *  4. Primary CTA button
 *  5. Vehicle tracker animation (background layer)
 *  6. Scroll-down indicator
 *
 * All animation via Framer Motion. No color except white/black + amber accent.
 */

import { motion } from 'framer-motion'
import { useCounter } from '../hooks/useCounter'
import { colors } from '../designTokens'

/* ── Static abstract logo-mark (replaces moving car) ─────────────────────── */
function LogoMark() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        right: 'clamp(24px, 8vw, 120px)',
        top: '50%',
        transform: 'translateY(-50%)',
        opacity: 0.22,
        pointerEvents: 'none',
      }}
    >
      <svg width="360" height="360" viewBox="0 0 320 320" fill="none">
        {/* Outer ring */}
        <circle cx="160" cy="160" r="148" stroke="white" strokeWidth="1.5" />
        {/* Inner ring */}
        <circle cx="160" cy="160" r="100" stroke="white" strokeWidth="1" />
        {/* Cross-hairs */}
        <line x1="160" y1="12" x2="160" y2="308" stroke="white" strokeWidth="1" />
        <line x1="12" y1="160" x2="308" y2="160" stroke="white" strokeWidth="1" />
        {/* Diagonal marks */}
        <line x1="55" y1="55" x2="265" y2="265" stroke="white" strokeWidth="0.75" />
        <line x1="265" y1="55" x2="55" y2="265" stroke="white" strokeWidth="0.75" />
        {/* Tick marks at cardinal points */}
        {[0, 90, 180, 270].map(deg => {
          const rad = (deg * Math.PI) / 180
          const x1 = 160 + 148 * Math.cos(rad)
          const y1 = 160 + 148 * Math.sin(rad)
          const x2 = 160 + 128 * Math.cos(rad)
          const y2 = 160 + 128 * Math.sin(rad)
          return <line key={deg} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="2.5" />
        })}
        {/* Center dot */}
        <circle cx="160" cy="160" r="5" fill="white" />
        {/* Bracket corners */}
        <polyline points="60,40 40,40 40,60"   stroke="white" strokeWidth="2" fill="none" />
        <polyline points="260,40 280,40 280,60" stroke="white" strokeWidth="2" fill="none" />
        <polyline points="60,280 40,280 40,260" stroke="white" strokeWidth="2" fill="none" />
        <polyline points="260,280 280,280 280,260" stroke="white" strokeWidth="2" fill="none" />
      </svg>
    </div>
  )
}

/* ── Word-by-word reveal ─────────────────────────────────────────────────── */
const HEADLINE = 'ENFORCEMENT, REORDERED.'

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08, delayChildren: 0.2 },
  },
}

const wordVariants = {
  hidden:  { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] },
  },
}

const fadeUp = {
  hidden:  { opacity: 0, y: 20 },
  visible: (delay: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1], delay },
  }),
}

/* ── Scroll chevron ──────────────────────────────────────────────────────── */
function ScrollChevron() {
  return (
    <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1">
      <span
        className="label-caps"
        style={{ color: colors.captionGray, fontSize: 10 }}
      >
        SCROLL
      </span>
      <svg
        className="chevron-bounce"
        width="18"
        height="10"
        viewBox="0 0 18 10"
        fill="none"
        aria-hidden="true"
      >
        <polyline
          points="1,1 9,9 17,1"
          stroke={colors.captionGray}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  )
}

/* ── CTA Button ──────────────────────────────────────────────────────────── */
function CTAButton() {
  return (
    <motion.a
      href="#dispatch"
      custom={1.4}
      initial="hidden"
      animate="visible"
      variants={fadeUp}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      style={{
        display: 'inline-block',
        background: colors.amber,
        color: colors.black,
        fontWeight: 800,
        fontSize: 14,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        padding: '14px 36px',
        textDecoration: 'none',
        borderRadius: 2,
        transition: 'background 0.18s, color 0.18s',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLElement).style.background = colors.white
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.background = colors.amber
      }}
    >
      See the live dispatch →
    </motion.a>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function HeroSection() {
  const count = useCounter(298450, 2400, 800)
  const words = HEADLINE.split(' ')

  return (
    <section
      className="relative flex flex-col justify-center overflow-hidden"
      style={{
        minHeight: '100vh',
        background: colors.black,
        paddingLeft: 'clamp(24px, 6vw, 120px)',
        paddingRight: 'clamp(24px, 6vw, 120px)',
        /* 60px nav height + 40px breathing room */
        paddingTop: 120,
        paddingBottom: 80,
      }}
    >
      {/* ── Static logo-mark watermark ────────────────────────────────── */}
      <LogoMark />

      {/* ── Main content stack ───────────────────────────────────────── */}
      <div className="relative z-10 max-w-5xl">
        {/* Pre-label */}
        <motion.p
          className="label-caps mb-6"
          style={{ color: colors.amber }}
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
        >
          AI-Driven Parking Intelligence · Bengaluru Traffic Police
        </motion.p>

        {/* ── Headline — word-by-word reveal ──────────────────────── */}
        <motion.h1
          className="hero-headline"
          style={{ color: colors.white }}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          aria-label={HEADLINE}
        >
          {words.map((word, i) => (
            <motion.span
              key={i}
              variants={wordVariants}
              className="inline-block mr-[0.2em]"
              style={{
                color: word === 'REORDERED.' ? colors.amber : colors.white,
              }}
            >
              {word}
            </motion.span>
          ))}
        </motion.h1>

        {/* ── Subhead ─────────────────────────────────────────────── */}
        <motion.p
          custom={0.85}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{
            marginTop: 'clamp(20px, 3vw, 36px)',
            fontSize: 'clamp(16px, 1.8vw, 22px)',
            fontWeight: 400,
            color: colors.white,
            opacity: 0.78,
            maxWidth: 620,
            lineHeight: 1.65,
          }}
        >
          Bengaluru generates{' '}
          <span style={{ color: colors.white, fontWeight: 700 }}>298,450</span>{' '}
          parking violations in five months. LaneShift tells you which ones
          matter first.
        </motion.p>

        {/* ── Live counter ────────────────────────────────────────── */}
        <motion.div
          custom={1.05}
          initial="hidden"
          animate="visible"
          variants={fadeUp}
          style={{ marginTop: 'clamp(36px, 5vw, 64px)' }}
        >
          <div className="flex items-end gap-6 flex-wrap">
            {/* Counter column */}
            <div>
              <div
                className="counter-number"
                aria-live="polite"
                aria-label={`${count.toLocaleString()} violations analyzed`}
              >
                {count.toLocaleString()}
              </div>
              <p
                className="label-caps mt-2"
                style={{ color: colors.captionGray }}
              >
                Violations Analyzed
              </p>
            </div>

            {/* Vertical divider */}
            <div
              style={{
                width: 1,
                height: 64,
                background: colors.borderDark,
                marginBottom: 24,
              }}
            />

            {/* Side stats */}
            <div className="flex flex-col gap-3">
              <div>
                <span
                  style={{
                    fontSize: 'clamp(22px, 3vw, 36px)',
                    fontWeight: 900,
                    color: colors.white,
                    letterSpacing: '-0.03em',
                  }}
                >
                  61.23%
                </span>
                <p className="label-caps mt-1" style={{ color: colors.captionGray }}>
                  Pipeline Leak Rate Today
                </p>
              </div>
              <div>
                <span
                  style={{
                    fontSize: 'clamp(22px, 3vw, 36px)',
                    fontWeight: 900,
                    color: colors.amber,
                    letterSpacing: '-0.03em',
                  }}
                >
                  85.17%
                </span>
                <p className="label-caps mt-1" style={{ color: colors.captionGray }}>
                  Auto-Recoverable Under LaneShift
                </p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── CTA ─────────────────────────────────────────────────── */}
        <div style={{ marginTop: 'clamp(32px, 4vw, 56px)' }}>
          <CTAButton />
        </div>
      </div>

      {/* ── Scroll indicator ─────────────────────────────────────── */}
      <ScrollChevron />

      {/* ── Bottom metadata bar ──────────────────────────────────── */}
      <motion.div
        className="absolute bottom-10 right-0"
        style={{ paddingRight: 'clamp(24px, 6vw, 120px)' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 0.6 }}
      >
        <p className="label-caps" style={{ color: colors.captionGray }}>
          Nov 2023 – Apr 2024 · 3,070 Camera Devices · SQLite + FastAPI
        </p>
      </motion.div>
    </section>
  )
}
