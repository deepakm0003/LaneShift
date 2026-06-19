/**
 * LaneShift Design Tokens
 * ========================
 * Single source of truth for every color, font, and spacing value used
 * across the frontend. Import this file instead of hardcoding values.
 */

export const colors = {
  /** Pure black — hero backgrounds, dark sections */
  black: '#000000',

  /** Pure white — content sections, light backgrounds */
  white: '#FFFFFF',

  /**
   * Amber accent — used SPARINGLY:
   * - Primary CTA button fill
   * - Numbers that "matter" (key statistics)
   * - Active/hover indicator
   * - Scan-line / bounding box in the vehicle animation
   * Never use decoratively. One accent, one purpose at a time.
   */
  amber: '#FFC700',

  /**
   * Caption gray — de-emphasized captions, secondary labels only.
   * Never use for body text.
   */
  captionGray: '#888888',

  /** Subtle border / divider on dark backgrounds */
  borderDark: '#1A1A1A',

  /** Subtle border / divider on light backgrounds */
  borderLight: '#E5E5E5',
} as const

export const fonts = {
  /** Primary typeface — all headings, body, UI */
  sans: "'Inter', system-ui, -apple-system, sans-serif",
} as const

export const fontWeights = {
  regular: 400,
  medium: 500,
  bold: 700,
  extraBold: 800,
  black: 900,
} as const

export const motion = {
  /** Standard scroll-reveal: fast, mechanical, no bounce */
  fadeUp: {
    initial: { opacity: 0, y: 24 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  },
  /** Staggered children delay step */
  staggerDelay: 0.08,
} as const
