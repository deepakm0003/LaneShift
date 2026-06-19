/**
 * useDashboard
 * ═════════════
 * Fetches GET /api/dashboard/summary from the backend.
 * Falls back to FALLBACK_DATA if the request fails (backend offline).
 *
 * Returns { data, loading, error, isLive, refetch, lastUpdated }
 *   isLive = true only when data came from the real backend
 */

import { useCallback, useEffect, useState } from 'react'
import { API_BASE } from '../config'

/* ── Types ─────────────────────────────────────────────────────────────── */
export interface ViolationType  { type: string; count: number }
export interface QueueItem {
  rank: number
  location_type: string
  location_name: string
  police_station_jurisdiction: string
  aggregate_congestion_score: number
  violation_count: number
  recommended_action: string
  pending_validations: number
}
export interface StationAttention {
  police_station: string
  total_submitted: number
  approved_count: number
  rejected_count: number
  stuck_count: number
  approval_rate_pct: number
  rejection_rate_pct: number
}
export interface ValidationLeakSummary {
  total_records: number
  records_with_validation_status: number
  records_with_null_status: number
  null_status_pct: number
  of_processed_records: { total_rejected_or_stuck: number; leak_rate_pct: number }
  of_all_records: { total_rejected_stuck_or_unprocessed: number; overall_leak_rate_pct: number }
  potential_recovery_via_auto_validation_pct: number
  projected_void_recovery_pct: number
}
export interface DashboardData {
  total_violations_analyzed: number
  date_range: { start: string; end: string }
  top_violation_types: ViolationType[]
  validation_leak_summary: ValidationLeakSummary
  live_dispatch_queue_top_10: QueueItem[]
  stations_requiring_attention: StationAttention[]
  midblock_violation_share_pct: number
}

/* ── Fallback snapshot ─────────────────────────────────────────────────── */
const FALLBACK: DashboardData = {
  total_violations_analyzed: 298450,
  date_range: { start: '2023-11-09T19:11:46', end: '2024-04-08T17:30:46' },
  top_violation_types: [
    { type: 'WRONG PARKING',       count: 164977 },
    { type: 'NO PARKING',          count: 139050 },
    { type: 'PARKING IN A MAIN ROAD', count: 23943 },
    { type: 'PARKING NEAR ROAD CROSSING', count: 14821 },
    { type: 'PARKING ON FOOTPATH', count: 8420  },
  ],
  validation_leak_summary: {
    total_records: 298450,
    records_with_validation_status: 173196,
    records_with_null_status: 125254,
    null_status_pct: 41.97,
    of_processed_records: { total_rejected_or_stuck: 57476, leak_rate_pct: 33.19 },
    of_all_records: { total_rejected_stuck_or_unprocessed: 182730, overall_leak_rate_pct: 61.23 },
    potential_recovery_via_auto_validation_pct: 85.17,
    projected_void_recovery_pct: 23.75,
  },
  live_dispatch_queue_top_10: [
    { rank:1, location_type:'junction',         location_name:'BTP051 — Safina Plaza Jn',  police_station_jurisdiction:'Shivajinagar', aggregate_congestion_score:2283581, violation_count:2785, recommended_action:'Dispatch immediately', pending_validations:0 },
    { rank:2, location_type:'junction',         location_name:'BTP082 — KR Market Jn',     police_station_jurisdiction:'City Market',  aggregate_congestion_score:1494848, violation_count:2388, recommended_action:'Route on standard patrol', pending_validations:0 },
    { rank:3, location_type:'junction',         location_name:'BTP040 — Elite Jn',         police_station_jurisdiction:'Upparpet',     aggregate_congestion_score:1438909, violation_count:2045, recommended_action:'Route on standard patrol', pending_validations:0 },
    { rank:4, location_type:'midblock_cluster', location_name:'Grid cell · 13.071, 77.588',police_station_jurisdiction:'Kodigehalli',  aggregate_congestion_score:473277,  violation_count:726,  recommended_action:'Monitor', pending_validations:0 },
    { rank:5, location_type:'junction',         location_name:'BTP044 — Sagar Theatre Jn', police_station_jurisdiction:'Upparpet',     aggregate_congestion_score:1219261, violation_count:1736, recommended_action:'Monitor', pending_validations:0 },
  ],
  stations_requiring_attention: [
    { police_station:'Kodigehalli',    total_submitted:4172,  approved_count:2354, rejected_count:1664, stuck_count:154, approval_rate_pct:56.4, rejection_rate_pct:39.9 },
    { police_station:'Madiwala',       total_submitted:808,   approved_count:492,  rejected_count:311,  stuck_count:3,   approval_rate_pct:60.9, rejection_rate_pct:38.5 },
    { police_station:'K.G. Halli',     total_submitted:558,   approved_count:299,  rejected_count:214,  stuck_count:45,  approval_rate_pct:53.6, rejection_rate_pct:38.4 },
    { police_station:'Byatarayanapura',total_submitted:2794,  approved_count:1706, rejected_count:1041, stuck_count:43,  approval_rate_pct:61.1, rejection_rate_pct:37.3 },
    { police_station:'Electronic City',total_submitted:2078,  approved_count:1235, rejected_count:738,  stuck_count:100, approval_rate_pct:59.4, rejection_rate_pct:35.5 },
  ],
  midblock_violation_share_pct: 50.22,
}

/* ── Hook ─────────────────────────────────────────────────────────────── */
export function useDashboard() {
  const [data,        setData]        = useState<DashboardData | null>(null)
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(false)
  const [isLive,      setIsLive]      = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(false)
    try {
      const res  = await fetch(`${API_BASE}/api/dashboard/summary`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json() as DashboardData
      setData(json)
      setIsLive(true)
      setLastUpdated(new Date())
    } catch {
      setData(FALLBACK)
      setIsLive(false)
      setError(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  return { data, loading, error, isLive, refetch: fetchData, lastUpdated }
}
