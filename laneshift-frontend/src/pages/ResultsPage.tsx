/**
 * ResultsPage — /results
 * ══════════════════════
 * Full dataset results page. Shows all 10 generated charts with
 * context copy explaining each finding. Same black/white/amber design system.
 */
import { useRef } from 'react'
import { Link } from 'react-router-dom'
import { motion, useInView } from 'framer-motion'
import { colors } from '../designTokens'

const EASE = [0.22, 1, 0.36, 1] as const

function useReveal() {
  const ref    = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.1, margin: '0px 0px -60px 0px' })
  return { ref, inView }
}

/* ── Chart entry data ─────────────────────────────────────────────────────── */
const CHARTS = [
  {
    file:    '10_kpi_summary.png',
    module:  'Summary',
    title:   'Key Metrics at a Glance',
    dark:    true,
    findings: [
      '298,450 violations analyzed across 5 months of Bengaluru BTP data',
      '57,476 violations rejected or stuck in the validation pipeline',
      '85.17% of those rejected/stuck cases were objectively auto-validatable',
      '125,254 records (42%) have null validation_status — never entered review at all',
      'Peak congestion score 820/1000 at BTP051 Safina Plaza Junction',
    ],
  },
  {
    file:    '01_top_violation_types.png',
    module:  'Module 1',
    title:   'Top Violation Types — Detection Layer',
    dark:    false,
    findings: [
      'WRONG PARKING (164,977) and NO PARKING (139,050) together account for 93%+ of all flags',
      'These are not edge cases — they are the dominant operational reality every day',
      '27 total violation categories tracked across 3,070 deployed camera devices',
      'DOUBLE PARKING (2,037) has the highest severity score (10/10) despite lower volume',
      'Two violation types, massive scale: the detection problem is already solved',
    ],
  },
  {
    file:    '02_validation_pipeline_funnel.png',
    module:  'Module 4',
    title:   'Validation Pipeline — Where Violations Go',
    dark:    true,
    findings: [
      '298,450 total flagged — only 115,400 (38.7%) reach an approved outcome',
      '125,254 records (41.97%) have null status — silently never processed',
      '49,754 explicitly rejected by human reviewers',
      '7,044 stuck in created1 state (never processed at all)',
      '678 stuck in processing state — entered review but never resolved',
    ],
  },
  {
    file:    '03_rejection_rate_by_station.png',
    module:  'Module 4',
    title:   'Rejection Rate by Station',
    dark:    false,
    findings: [
      'Kodigehalli worst at 39.9% rejection rate — nearly 40 of every 100 submitted violations rejected',
      'Range spans 20.3% (Jnanabharathi) to 39.9% (Kodigehalli) — a 2× variance across stations',
      'This variance is the strongest evidence of inconsistent manual review standards, not data quality issues',
      'If case quality drove rejection, rates would cluster tightly — they do not',
      'Stations above 35% rejection are flagged as requiring immediate process audit',
    ],
  },
  {
    file:    '04_violations_by_hour.png',
    module:  'Module 2',
    title:   'Violation Volume by Hour (IST) — Time-of-Day Scoring Basis',
    dark:    true,
    findings: [
      'Sharp peak at 10:00–12:00 IST — over 20% of all violations occur in just 2 hours',
      'The 8 AM–12 PM window accounts for the majority of enforcement demand',
      'Off-peak hours (7 PM–6 AM) show minimal violation activity',
      'Time-of-day weight contributes 35% of the congestion-cost score formula',
      'A violation at 10:30 AM has fundamentally different congestion impact than the same violation at 2 AM',
    ],
  },
  {
    file:    '05_stations_congestion_score.png',
    module:  'Module 3',
    title:   'Stations — Aggregate Congestion Score',
    dark:    false,
    findings: [
      'Upparpet ranks #1 with 75M+ aggregate congestion score across all-time data',
      'Shivajinagar #2 with highest average congestion score per violation (718/1000)',
      'Score combines time-of-day, junction density, violation severity, and stacking — not just volume',
      'A station with fewer violations but higher-severity peak-hour incidents can outscore a high-volume station',
      'This ranking is what powers the dispatch priority queue',
    ],
  },
  {
    file:    '06_congestion_score_distribution.png',
    module:  'Module 2',
    title:   'Congestion Score Distribution — All 298,450 Violations',
    dark:    true,
    findings: [
      'Score range 0–1000 applied to every violation in the dataset',
      'RED zone (≥700): "Dispatch immediately" — top-priority enforcement action',
      'AMBER zone (400–699): "Route on standard patrol" — scheduled enforcement',
      'BLUE zone (<400): "Monitor" — low-priority, data collection only',
      'The distribution shows the vast majority of violations cluster in the 400–800 range',
    ],
  },
  {
    file:    '07_auto_validation_recovery.png',
    module:  'Module 4',
    title:   'Auto-Validation Recovery Rate by Station',
    dark:    false,
    findings: [
      'Hulimavu 97.93% — nearly all rejected violations were objectively auto-validatable',
      'Overall average 85.17% — verified against all 57,476 rejected/stuck records',
      'Worst station (Whitefield) still 42.32% recoverable — even the outlier shows significant recovery potential',
      'Zero severity-9/10 violations (DOUBLE PARKING, PARKING IN MAIN ROAD) leaked into the auto-validatable set',
      'The four criteria: single violation type, uncontested vehicle number, passed SCITA, below severity 9',
    ],
  },
  {
    file:    '08_top_junctions_congestion.png',
    module:  'Module 3',
    title:   'Top Junctions — Aggregate Congestion Score',
    dark:    true,
    findings: [
      'BTP051 Safina Plaza Junction ranks #1 with 2.28M aggregate score and 2,785 violations',
      'Average score per violation at Safina Plaza: 820/1000 — highest in dataset',
      'BTP082 KR Market and BTP040 Elite Junction complete the top 3',
      'Named junctions get density-weighted scoring — historical violation count amplifies their score',
      'These are the "Dispatch immediately" locations in the live queue',
    ],
  },
  {
    file:    '09_monthly_trend.png',
    module:  'Module 1',
    title:   'Monthly Violation Volume — Nov 2023 to Apr 2024',
    dark:    false,
    findings: [
      'Consistent high volume across all 6 months — this is not seasonal variation',
      'No month drops below 40,000 violations — enforcement demand is structural, not episodic',
      'March 2024 shows the highest single-month volume',
      '3,070 unique camera devices flagging violations continuously across this period',
      'This confirms the detection infrastructure is already operating at scale — the gap is downstream',
    ],
  },
]

/* ── Chart card ────────────────────────────────────────────────────────────── */
function ChartCard({ chart }: { chart: typeof CHARTS[0] }) {
  const { ref, inView } = useReveal()
  const bg = chart.dark ? colors.black : colors.white
  const fg = chart.dark ? colors.white : colors.black

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 32 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.55, ease: EASE }}
      style={{
        background: bg,
        border: `1px solid ${chart.dark ? colors.borderDark : colors.borderLight}`,
        overflow: 'hidden',
      }}
    >
      {/* Module tag */}
      <div style={{
        padding: '14px 24px',
        borderBottom: `1px solid ${chart.dark ? colors.borderDark : colors.borderLight}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
      }}>
        <span style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: colors.amber,
        }}>
          {chart.module}
        </span>
        <span style={{
          fontSize: 10, fontWeight: 700, letterSpacing: '0.12em',
          textTransform: 'uppercase', color: chart.dark ? colors.captionGray : colors.captionGray,
        }}>
          {chart.title}
        </span>
      </div>

      {/* Chart image */}
      <div style={{ background: '#0d1117', padding: '4px 0' }}>
        <img
          src={`/charts/${chart.file}`}
          alt={chart.title}
          style={{ width: '100%', display: 'block', maxHeight: 380, objectFit: 'contain' }}
          loading="lazy"
        />
      </div>

      {/* Findings */}
      <div style={{ padding: '20px 24px' }}>
        <p style={{
          fontSize: 9, fontWeight: 700, letterSpacing: '0.18em',
          textTransform: 'uppercase', color: colors.captionGray, marginBottom: 14,
        }}>
          Key Findings
        </p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {chart.findings.map((f, i) => (
            <li key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ color: colors.amber, fontWeight: 700, flexShrink: 0, fontSize: 12, marginTop: 1 }}>—</span>
              <span style={{ fontSize: 13, color: fg, opacity: 0.8, lineHeight: 1.55 }}>{f}</span>
            </li>
          ))}
        </ul>
      </div>
    </motion.div>
  )
}

/* ── Page ─────────────────────────────────────────────────────────────────── */
export default function ResultsPage() {
  return (
    <div style={{ background: colors.black, minHeight: '100vh', fontFamily: "'Inter', sans-serif" }}>

      {/* ── Top nav bar ────────────────────────────────────────────────── */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: colors.black,
        borderBottom: `1px solid ${colors.borderDark}`,
        padding: '0 clamp(20px, 5vw, 80px)',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <Link to="/" style={{ textDecoration: 'none' }}>
          <span style={{ fontSize: 13, fontWeight: 900, letterSpacing: '0.22em', color: colors.white }}>
            LANESHIFT
          </span>
        </Link>
        <Link
          to="/"
          style={{
            fontSize: 10, fontWeight: 700, letterSpacing: '0.14em',
            textTransform: 'uppercase', color: colors.captionGray,
            textDecoration: 'none',
          }}
        >
          ← Back to Overview
        </Link>
      </div>

      {/* ── Page header ────────────────────────────────────────────────── */}
      <div style={{
        padding: 'clamp(60px, 8vw, 100px) clamp(24px, 6vw, 120px) clamp(40px, 5vw, 64px)',
        borderBottom: `1px solid ${colors.borderDark}`,
      }}>
        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: colors.amber, marginBottom: 16 }}
        >
          Bengaluru BTP Dataset · Nov 2023 – Apr 2024 · 298,450 Records
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: EASE, delay: 0.07 }}
          style={{
            fontSize: 'clamp(32px, 6vw, 88px)', fontWeight: 900,
            letterSpacing: '-0.03em', lineHeight: 1.0, color: colors.white,
            marginBottom: 20,
          }}
        >
          DATASET RESULTS.<br />
          <span style={{ color: colors.amber }}>ALL FIVE MODULES.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.15 }}
          style={{
            fontSize: 'clamp(15px, 1.6vw, 18px)', color: colors.white,
            opacity: 0.65, lineHeight: 1.7, maxWidth: 600,
          }}
        >
          Every chart below is generated directly from the Bengaluru Traffic Police violation
          dataset — no synthetic data, no illustrations. These are the real numbers the
          LaneShift scoring engine runs on.
        </motion.p>

        {/* Stats row */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE, delay: 0.22 }}
          style={{ display: 'flex', gap: 'clamp(24px, 4vw, 48px)', marginTop: 36, flexWrap: 'wrap' }}
        >
          {[
            ['10', 'Charts Generated'],
            ['298,450', 'Records Analyzed'],
            ['5', 'Modules Covered'],
            ['48', 'Tests Passing'],
          ].map(([num, label]) => (
            <div key={label}>
              <p style={{ fontSize: 'clamp(20px, 3vw, 36px)', fontWeight: 900, color: colors.amber, letterSpacing: '-0.03em', lineHeight: 1 }}>
                {num}
              </p>
              <p style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: colors.captionGray, marginTop: 4 }}>
                {label}
              </p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Chart grid ────────────────────────────────────────────────── */}
      <div style={{ padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)' }}>
        {/* Summary card full width */}
        <div style={{ marginBottom: 'clamp(24px, 3vw, 40px)' }}>
          <ChartCard chart={CHARTS[0]} />
        </div>

        {/* Remaining 9 in 2-col grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 480px), 1fr))',
          gap: 'clamp(16px, 2.5vw, 32px)',
        }}>
          {CHARTS.slice(1).map(chart => (
            <ChartCard key={chart.file} chart={chart} />
          ))}
        </div>
      </div>

      {/* ── Bottom CTA ────────────────────────────────────────────────── */}
      <div style={{
        padding: 'clamp(48px, 6vw, 80px) clamp(24px, 6vw, 120px)',
        borderTop: `1px solid ${colors.borderDark}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: 24,
        background: colors.black,
      }}>
        <div>
          <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.captionGray, marginBottom: 8 }}>
            Generated by scripts/generate_charts.py
          </p>
          <p style={{ fontSize: 13, color: colors.white, opacity: 0.6, lineHeight: 1.6, maxWidth: 480 }}>
            All charts are output by running Python + matplotlib directly against violations.db.
            Re-run <code style={{ fontSize: 11, color: colors.amber }}>python scripts/generate_charts.py</code> from
            the project root to regenerate.
          </p>
        </div>
        <Link
          to="/"
          style={{
            display: 'inline-block',
            background: colors.amber,
            color: colors.black,
            fontWeight: 800,
            fontSize: 13,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            padding: '14px 36px',
            textDecoration: 'none',
          }}
        >
          ← Back to Overview
        </Link>
      </div>
    </div>
  )
}
