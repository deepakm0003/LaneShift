/**
 * Footer — black background, minimal, 80–100px height.
 */
import { colors } from '../designTokens'

export default function Footer() {
  return (
    <footer
      style={{
        background: colors.black,
        borderTop: `1px solid ${colors.borderDark}`,
        padding: '28px clamp(24px, 6vw, 120px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12,
        minHeight: 80,
      }}
    >
      <span style={{
        fontSize: 13, fontWeight: 900,
        letterSpacing: '0.22em', color: colors.white,
      }}>
        LANESHIFT
      </span>

      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
        textTransform: 'uppercase', color: colors.captionGray,
        textAlign: 'center', lineHeight: 1.6,
      }}>
        Gridlock Hackathon 2.0 · Flipkart × Bengaluru Traffic Police · Theme 1
      </p>

      <p style={{ fontSize: 10, color: colors.captionGray }}>
        298,450 records · Nov 2023 – Apr 2024
      </p>
    </footer>
  )
}
