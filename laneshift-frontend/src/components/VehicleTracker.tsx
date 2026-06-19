/**
 * VehicleTracker — fixed version
 * Uses CSS keyframe animation for the path (no async loop issues in StrictMode)
 * and Framer Motion only for the bounding-box overlays.
 */
import { motion } from 'framer-motion'

const AMBER = '#FFC700'
const WHITE = '#FFFFFF'

/* Top-down car silhouette */
function CarIcon({ size = 32, opacity = 1 }: { size?: number; opacity?: number }) {
  return (
    <svg width={size} height={size * 1.9} viewBox="0 0 32 60" fill="none" aria-hidden="true" style={{ opacity }}>
      <rect x="4" y="8" width="24" height="44" rx="3" fill={WHITE} />
      <rect x="7" y="10" width="18" height="10" rx="2" fill="#000" opacity="0.75" />
      <rect x="7" y="40" width="18" height="8" rx="2" fill="#000" opacity="0.75" />
      <rect x="0" y="12" width="5" height="9" rx="2" fill={WHITE} opacity="0.6" />
      <rect x="0" y="39" width="5" height="9" rx="2" fill={WHITE} opacity="0.6" />
      <rect x="27" y="12" width="5" height="9" rx="2" fill={WHITE} opacity="0.6" />
      <rect x="27" y="39" width="5" height="9" rx="2" fill={WHITE} opacity="0.6" />
    </svg>
  )
}

/* Amber corner-bracket bounding box */
function BoundingBox({ size = 72, delay = 0, repeatDelay = 2.5 }: { size?: number; delay?: number; repeatDelay?: number }) {
  const s = size
  return (
    <motion.svg
      width={s} height={s} viewBox={`0 0 ${s} ${s}`} fill="none"
      style={{ position: 'absolute', top: -s / 2 + 30, left: -s / 2 + 16 }}
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: [0, 1, 1, 0], scale: [0.8, 1, 1, 0.95] }}
      transition={{ duration: 2, delay, repeat: Infinity, repeatDelay, ease: 'easeOut' }}
      aria-hidden="true"
    >
      <polyline points={`0,14 0,0 14,0`}               stroke={AMBER} strokeWidth="1.5" />
      <polyline points={`${s-14},0 ${s},0 ${s},14`}    stroke={AMBER} strokeWidth="1.5" />
      <polyline points={`0,${s-14} 0,${s} 14,${s}`}    stroke={AMBER} strokeWidth="1.5" />
      <polyline points={`${s-14},${s} ${s},${s} ${s},${s-14}`} stroke={AMBER} strokeWidth="1.5" />
      <line x1={s/2-5} y1={s/2} x2={s/2+5} y2={s/2} stroke={AMBER} strokeWidth="1" opacity="0.5" />
      <line x1={s/2} y1={s/2-5} x2={s/2} y2={s/2+5} stroke={AMBER} strokeWidth="1" opacity="0.5" />
    </motion.svg>
  )
}

/* DETECTED label */
function DetectedTag({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      style={{
        position: 'absolute', top: -22, left: 0,
        background: AMBER, color: '#000',
        fontSize: 8, fontWeight: 800, letterSpacing: '0.12em',
        padding: '2px 6px', lineHeight: 1.5,
        whiteSpace: 'nowrap',
      }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 1, 0] }}
      transition={{ duration: 1.6, delay: delay + 0.4, repeat: Infinity, repeatDelay: 2.9 }}
    >
      DETECTED
    </motion.div>
  )
}

export default function VehicleTracker() {
  return (
    <>
      {/* Inject keyframe CSS for the car path animation */}
      <style>{`
        @keyframes carPath {
          0%   { transform: translate(8vw,  20vh) rotate(0deg);   }
          15%  { transform: translate(30vw, 35vh) rotate(8deg);   }
          30%  { transform: translate(55vw, 22vh) rotate(4deg);   }
          45%  { transform: translate(68vw, 48vh) rotate(12deg);  }
          60%  { transform: translate(52vw, 62vh) rotate(-5deg);  }
          75%  { transform: translate(28vw, 52vh) rotate(-10deg); }
          90%  { transform: translate(10vw, 38vh) rotate(-4deg);  }
          100% { transform: translate(8vw,  20vh) rotate(0deg);   }
        }
        @keyframes ghostPath {
          0%   { transform: translate(62vw, 58vh) rotate(-6deg);  }
          25%  { transform: translate(42vw, 68vh) rotate(4deg);   }
          50%  { transform: translate(22vw, 52vh) rotate(8deg);   }
          75%  { transform: translate(48vw, 38vh) rotate(-4deg);  }
          100% { transform: translate(62vw, 58vh) rotate(-6deg);  }
        }
        .car-mover {
          position: absolute;
          top: 0; left: 0;
          animation: carPath 20s linear infinite;
          will-change: transform;
        }
        .ghost-mover {
          position: absolute;
          top: 0; left: 0;
          animation: ghostPath 26s linear infinite;
          will-change: transform;
          opacity: 0.22;
        }
      `}</style>

      <div
        aria-hidden="true"
        style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}
      >
        {/* Faint city-grid background */}
        <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.04 }}>
          <defs>
            <pattern id="ls-grid" width="64" height="64" patternUnits="userSpaceOnUse">
              <path d="M 64 0 L 0 0 0 64" fill="none" stroke="white" strokeWidth="0.5" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#ls-grid)" />
        </svg>

        {/* Primary vehicle */}
        <div className="car-mover">
          <div style={{ position: 'relative' }}>
            <BoundingBox size={76} delay={0.8} repeatDelay={2.2} />
            <BoundingBox size={56} delay={2.2} repeatDelay={3.4} />
            <DetectedTag delay={1.0} />
            <CarIcon size={34} />
          </div>
        </div>

        {/* Ghost vehicle — secondary, dimmer */}
        <div className="ghost-mover">
          <CarIcon size={26} opacity={0.7} />
        </div>
      </div>
    </>
  )
}
