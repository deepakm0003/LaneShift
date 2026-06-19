/**
 * ModuleSection — reusable wrapper for each "How it works" module.
 *
 * Props:
 *   num        "01" – "05"
 *   name       Module name headline
 *   desc       One-sentence description
 *   sub        Short supporting line (optional)
 *   visual     JSX element — the visual component
 *   visualLeft if true, visual is on the left (alternates per module)
 *   dark       true = black bg / white text, false = white bg / black text
 *   id         section anchor id
 */
import { useRef, type ReactNode } from 'react'
import { motion, useInView } from 'framer-motion'
import { colors } from '../../designTokens'

interface Props {
  num: string
  name: string
  desc: string
  sub?: string
  tag?: string
  visual: ReactNode
  visualLeft?: boolean
  dark?: boolean
  id?: string
  ctaHref?: string
  ctaLabel?: string
}

const EASE = [0.22, 1, 0.36, 1] as const

export default function ModuleSection({
  num, name, desc, sub, tag, visual,
  visualLeft = false, dark = true, id,
  ctaHref, ctaLabel,
}: Props) {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '0px 0px -80px 0px', amount: 0.1 })

  const bg      = dark ? colors.black : colors.white
  const fg      = dark ? colors.white : colors.black
  const dimFg   = dark ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)'
  const dimNum  = dark ? 'rgba(255,255,255,0.13)' : 'rgba(0,0,0,0.10)'
  const border  = dark ? colors.borderDark : colors.borderLight

  const textBlock = (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: EASE, delay: 0.1 }}
      style={{ flex: 1, minWidth: 260, maxWidth: 480 }}
    >
      {/* Module tag */}
      {tag && (
        <p style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
          textTransform: 'uppercase', color: colors.amber, marginBottom: 14,
        }}>
          {tag}
        </p>
      )}

      {/* Module label */}
      <p style={{
        fontSize: 9, fontWeight: 700, letterSpacing: '0.2em',
        textTransform: 'uppercase', color: colors.captionGray, marginBottom: 10,
      }}>
        Module {num}
      </p>

      {/* Name */}
      <h2 style={{
        fontSize: 'clamp(24px, 3.8vw, 52px)',
        fontWeight: 900,
        letterSpacing: '-0.03em',
        lineHeight: 1.0,
        color: fg,
        marginBottom: 20,
      }}>
        {name}
      </h2>

      {/* Thin rule */}
      <div style={{ height: 1, background: border, marginBottom: 20, width: 48 }} />

      {/* Description */}
      <p style={{
        fontSize: 'clamp(15px, 1.6vw, 18px)',
        fontWeight: 400,
        color: fg,
        opacity: 0.75,
        lineHeight: 1.7,
        marginBottom: sub ? 14 : 0,
        maxWidth: 440,
      }}>
        {desc}
      </p>

      {/* Supporting line */}
      {sub && (
        <p style={{
          fontSize: 13,
          color: colors.captionGray,
          lineHeight: 1.6,
          maxWidth: 420,
          marginBottom: ctaHref ? 20 : 0,
        }}>
          {sub}
        </p>
      )}

      {/* Optional CTA button */}
      {ctaHref && ctaLabel && (
        <a
          href={ctaHref}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            fontSize: 11, fontWeight: 800, letterSpacing: '0.12em',
            textTransform: 'uppercase', textDecoration: 'none',
            color: dark ? colors.black : colors.black,
            background: colors.amber,
            padding: '10px 22px',
            transition: 'background 0.18s',
          }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = dark ? colors.white : '#e0e0e0')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = colors.amber)}
        >
          {ctaLabel}
        </a>
      )}
    </motion.div>
  )

  const visualBlock = (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: EASE, delay: 0.22 }}
      style={{ flex: 1, minWidth: 260, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}
    >
      {visual}
    </motion.div>
  )

  return (
    <section
      id={id}
      style={{
        background: bg,
        position: 'relative',
        overflow: 'hidden',
        padding: 'clamp(80px, 10vw, 130px) clamp(24px, 6vw, 120px)',
      }}
    >
      {/* Giant watermark number */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: '-0.05em',
          right: '-0.05em',
          fontSize: 'clamp(160px, 22vw, 320px)',
          fontWeight: 900,
          letterSpacing: '-0.06em',
          lineHeight: 1,
          color: 'transparent',
          WebkitTextStroke: `2px ${dimNum}`,
          userSelect: 'none',
          pointerEvents: 'none',
          zIndex: 0,
          opacity: 1,
        }}
      >
        {num}
      </div>

      {/* Content */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          gap: 'clamp(40px, 6vw, 100px)',
          alignItems: 'center',
          flexWrap: 'wrap',
          flexDirection: visualLeft ? 'row-reverse' : 'row',
        }}
      >
        {textBlock}
        {visualBlock}
      </div>
    </section>
  )
}
