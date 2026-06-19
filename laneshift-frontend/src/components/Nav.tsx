/**
 * Nav
 * ════
 * Fixed top navigation bar.
 *
 * Behaviour:
 * - Transparent when at the top of the page (over black hero)
 * - Solid black with a 1px bottom border once hero is scrolled past
 * - Mobile: hamburger → full-black overlay with large centered links
 *
 * Design: no color except amber for the REQUEST DEMO CTA.
 */

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { colors } from '../designTokens'

const NAV_LINKS = [
  { label: 'THE PROBLEM', href: '/#problem'  },
  { label: 'THE SYSTEM',  href: '/#system'   },
  { label: 'LIVE DATA',   href: '/live'      },
  { label: 'DETECTION',   href: '/detect'    },
  { label: 'MONITOR',     href: '/monitor'   },
  { label: 'HOTSPOTS',    href: '/hotspots'  },
  { label: 'CHALLANS',    href: '/challan'   },
  { label: 'THE TEAM',    href: '/#team'     },
]

const EASE = [0.22, 1, 0.36, 1] as const

export default function Nav() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Prevent body scroll when overlay is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)

  return (
    <>
      {/* ── Main bar ─────────────────────────────────────────────── */}
      <motion.nav
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          background: scrolled ? colors.black : 'transparent',
          borderBottom: scrolled
            ? `1px solid rgba(255,255,255,0.08)`
            : '1px solid transparent',
          transition: 'background 0.3s ease, border-color 0.3s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 clamp(20px, 5vw, 80px)',
          height: 60,
        }}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE }}
      >
        {/* Wordmark */}
        <a
          href="/"
          style={{
            color: colors.white,
            fontWeight: 900,
            fontSize: 13,
            letterSpacing: '0.22em',
            textDecoration: 'none',
          }}
        >
          LANESHIFT
        </a>

        {/* Desktop links */}
        <ul
          className="hidden md:flex"
          style={{ gap: 36, listStyle: 'none', alignItems: 'center' }}
        >
          {NAV_LINKS.map(link => (
            <li key={link.href}>
              <a
                href={link.href}
                style={{
                  color: colors.captionGray,
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  textDecoration: 'none',
                  transition: 'color 0.18s',
                }}
                onMouseEnter={e =>
                  ((e.target as HTMLElement).style.color = colors.white)
                }
                onMouseLeave={e =>
                  ((e.target as HTMLElement).style.color = colors.captionGray)
                }
              >
                {link.label}
              </a>
            </li>
          ))}

          {/* CTA */}
          <li>
            <a
              href="#contact"
              style={{
                color: colors.amber,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                textDecoration: 'none',
                border: `1px solid ${colors.amber}`,
                padding: '6px 16px',
                transition: 'background 0.18s, color 0.18s',
              }}
              onMouseEnter={e => {
                const el = e.target as HTMLElement
                el.style.background = colors.amber
                el.style.color = colors.black
              }}
              onMouseLeave={e => {
                const el = e.target as HTMLElement
                el.style.background = 'transparent'
                el.style.color = colors.amber
              }}
            >
              Request Demo
            </a>
          </li>
        </ul>

        {/* Mobile hamburger */}
        <button
          className="flex md:hidden flex-col justify-center gap-1.5"
          onClick={() => setMenuOpen(o => !o)}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          {[0, 1, 2].map(i => (
            <motion.span
              key={i}
              style={{
                display: 'block',
                width: 22,
                height: 1.5,
                background: colors.white,
                transformOrigin: 'center',
              }}
              animate={
                menuOpen
                  ? i === 0
                    ? { rotate: 45, y: 6.5 }
                    : i === 1
                    ? { opacity: 0 }
                    : { rotate: -45, y: -6.5 }
                  : { rotate: 0, y: 0, opacity: 1 }
              }
              transition={{ duration: 0.22 }}
            />
          ))}
        </button>
      </motion.nav>

      {/* ── Mobile overlay ───────────────────────────────────────── */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            key="overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 99,
              background: colors.black,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 40,
            }}
          >
            {NAV_LINKS.map((link, i) => (
              <motion.a
                key={link.href}
                href={link.href}
                onClick={closeMenu}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.35, ease: EASE }}
                style={{
                  color: colors.white,
                  fontSize: 'clamp(28px, 7vw, 48px)',
                  fontWeight: 800,
                  letterSpacing: '0.08em',
                  textDecoration: 'none',
                  textTransform: 'uppercase',
                }}
              >
                {link.label}
              </motion.a>
            ))}
            <motion.a
              href="#contact"
              onClick={closeMenu}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: NAV_LINKS.length * 0.07 + 0.05, duration: 0.35, ease: EASE }}
              style={{
                color: colors.amber,
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textDecoration: 'none',
                textTransform: 'uppercase',
                border: `1px solid ${colors.amber}`,
                padding: '12px 32px',
                marginTop: 8,
              }}
            >
              Request Demo
            </motion.a>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
