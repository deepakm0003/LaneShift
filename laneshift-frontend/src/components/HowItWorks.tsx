/**
 * HowItWorks — assembles all 6 ModuleSections.
 * Alternating black/white backgrounds. Visual side alternates left/right.
 */
import ModuleSection    from './modules/ModuleSection'
import Visual1Detection from './modules/Visual1Detection'
import Visual2Score     from './modules/Visual2Score'
import Visual3Dispatch  from './modules/Visual3Dispatch'
import Visual4Validation from './modules/Visual4Validation'
import Visual5Nudge     from './modules/Visual5Nudge'
import Visual6Hotspot   from './modules/Visual6Hotspot'

export default function HowItWorks() {
  return (
    <div id="system">
      {/* ── Section header ──────────────────────────────────────────── */}
      <div style={{
        background: '#000',
        padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px) 0',
        textAlign: 'center',
      }}>
        <p style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.22em',
          textTransform: 'uppercase', color: '#888', marginBottom: 16,
        }}>
          How LaneShift Works
        </p>
        <h2 style={{
          fontSize: 'clamp(28px, 5vw, 64px)',
          fontWeight: 900,
          letterSpacing: '-0.03em',
          color: '#fff',
          lineHeight: 1.0,
          marginBottom: 0,
        }}>
          SIX MODULES.<br />
          <span style={{ color: '#FFC700' }}>ONE DECISION.</span>
        </h2>
      </div>

      {/* Module 1 — black, visual right */}
      <ModuleSection
        num="01"
        name="Detection-to-Decision Engine"
        desc="Camera devices across Bengaluru flag violations in real time — LaneShift ingests, cleans, and scores every event the moment it fires."
        sub="3,070 deployed devices · 298,450 events · zero new hardware required."
        tag="The Input Layer"
        visual={<Visual1Detection />}
        visualLeft={false}
        dark={true}
        id="module-1"
        ctaHref="/detect"
        ctaLabel="Try Detection Demo →"
      />

      {/* Module 2 — white, visual left */}
      <ModuleSection
        num="02"
        name="Congestion-Cost Score"
        desc="Every violation gets a single 0–1000 number built from four weighted signals: time of day, junction density, violation severity, and stacking multiplier."
        sub="Not just a location pin — a ranked, defensible priority score. The core IP."
        tag="The Core IP"
        visual={<Visual2Score />}
        visualLeft={true}
        dark={false}
        id="module-2"
      />

      {/* Module 3 — black, visual right */}
      <ModuleSection
        num="03"
        name="Live Dispatch Ranking"
        desc="Named-junction hotspots and mid-block geographic clusters are merged into one unified priority queue — the actual answer to 'which zone needs enforcement now'."
        sub="Top 10% → Dispatch immediately. Next 30% → Standard patrol. Rest → Monitor."
        tag="The Operational Layer"
        visual={<Visual3Dispatch />}
        visualLeft={false}
        dark={true}
        id="module-3"
        ctaHref="/live"
        ctaLabel="View Live Dispatch →"
      />

      {/* Module 4 — white, visual left */}
      <ModuleSection
        num="04"
        name="Anti-Corruption Auto-Validation"
        desc="Low-ambiguity violations auto-validate and route straight to challan issuance — removing the manual review surface where inconsistency (and bribery) enters."
        sub="85.17% of rejected/stuck violations met all four objective auto-validation criteria."
        tag="The Pipeline Fix"
        visual={<Visual4Validation />}
        visualLeft={true}
        dark={false}
        id="module-4"
      />

      {/* Module 5 — black, visual right */}
      <ModuleSection
        num="05"
        name="Driver Nudge"
        desc="At flag-time, before the challan locks in, the vehicle owner receives the nearest available legal parking option — converting punishment into a citizen-assistive nudge."
        sub="Requires VAHAN/RTO API + live parking feed for production. Simulated in this prototype."
        tag="The Behavior Layer"
        visual={<Visual5Nudge />}
        visualLeft={false}
        dark={true}
        id="module-5"
      />

      {/* Module 6 — white, visual left — Persistent Hotspot Escalation */}
      <ModuleSection
        num="06"
        name="Persistent Hotspot Escalation"
        desc="Where repeated ticketing at the same location for months hasn't worked — LaneShift identifies these locations using objective persistence data and routes the right escalation to the right authority."
        sub="57 locations identified as requiring civic escalation · 134 requiring enforcement adjustment."
        tag="The Escalation Layer"
        visual={<Visual6Hotspot />}
        visualLeft={true}
        dark={false}
        id="module-6"
        ctaHref="/hotspots"
        ctaLabel="View All 221 Locations →"
      />
    </div>
  )
}
