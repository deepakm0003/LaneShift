/**
 * Visual 3 — Live Dispatch Queue
 * Rows animate in, then periodically re-sort to simulate live updates.
 */
import { useRef, useEffect, useState } from 'react'
import { motion, useInView, AnimatePresence } from 'framer-motion'

const AMBER = '#FFC700'
const WHITE = '#FFFFFF'
const GRAY  = '#888888'
const EASE  = [0.22, 1, 0.36, 1] as const

const INITIAL_ROWS = [
  { id: 'a', rank: 1, name: 'BTP051 — Safina Plaza Jn',   score: '2,283,581', action: 'DISPATCH IMMEDIATELY',     actionColor: AMBER  },
  { id: 'b', rank: 2, name: 'BTP082 — KR Market Jn',      score: '1,494,848', action: 'ROUTE ON STANDARD PATROL', actionColor: WHITE  },
  { id: 'c', rank: 3, name: 'Grid cell · 13.071, 77.588',  score: '473,277',  action: 'ROUTE ON STANDARD PATROL', actionColor: WHITE  },
  { id: 'd', rank: 4, name: 'BTP040 — Elite Jn',           score: '391,489',  action: 'MONITOR',                  actionColor: GRAY   },
]

type Row = typeof INITIAL_ROWS[0]

export default function Visual3Dispatch() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: false, amount: 0.3 })
  const [rows, setRows]   = useState<Row[]>(INITIAL_ROWS)
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (inView && !entered) setEntered(true)
  }, [inView, entered])

  // Occasionally swap rows 2 & 3 to simulate live re-sort
  useEffect(() => {
    if (!entered) return
    const t = setInterval(() => {
      setRows(prev => {
        const next = [...prev]
        // Swap ranks 1 and 2 (index 1 and 2)
        ;[next[1], next[2]] = [next[2], next[1]]
        return next.map((r, i) => ({ ...r, rank: i + 1 }))
      })
    }, 3200)
    return () => clearInterval(t)
  }, [entered])

  return (
    <div
      ref={ref}
      style={{
        width: '100%', maxWidth: 440,
        border: '1px solid rgba(255,255,255,0.1)',
        background: 'rgba(0,0,0,0.6)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.08)',
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AMBER }}>
          LIVE DISPATCH QUEUE
        </span>
        <span style={{ fontSize: 9, color: GRAY }}>
          ● UPDATING
        </span>
      </div>

      {/* Column headers */}
      <div style={{
        display: 'grid', gridTemplateColumns: '28px 1fr 96px 140px',
        padding: '6px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}>
        {['#', 'LOCATION', 'SCORE', 'ACTION'].map(h => (
          <span key={h} style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: GRAY }}>
            {h}
          </span>
        ))}
      </div>

      {/* Data rows */}
      <AnimatePresence mode="popLayout">
        {rows.map((row, i) => (
          <motion.div
            key={row.id}
            layout
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: entered ? 1 : 0, y: entered ? 0 : 16 }}
            transition={{ duration: 0.45, ease: EASE, delay: entered ? i * 0.1 : 0 }}
            style={{
              display: 'grid',
              gridTemplateColumns: '28px 1fr 96px 140px',
              padding: '12px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.05)',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 11, fontWeight: 800, color: GRAY }}>{String(row.rank).padStart(2,'0')}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: WHITE, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>
              {row.name}
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: WHITE, letterSpacing: '-0.02em' }}>
              {row.score}
            </span>
            <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', color: row.actionColor }}>
              {row.action}
            </span>
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer */}
      <div style={{ padding: '8px 16px', background: 'rgba(255,199,0,0.04)' }}>
        <span style={{ fontSize: 8.5, color: GRAY, fontStyle: 'italic' }}>
          window: last 30 days · anchored to dataset max date Apr 2024
        </span>
      </div>
    </div>
  )
}
