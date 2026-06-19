import sys
sys.path.insert(0, '.')
from persistent_hotspots import build_escalation_report

r = build_escalation_report('../violations.db')
t1 = [x for x in r if 'TIER 1' in x['escalation_tier']]
t2 = [x for x in r if 'TIER 2' in x['escalation_tier']]
t3 = [x for x in r if 'TIER 3' in x['escalation_tier']]

print('=== TIER 1 (top 3) ===')
for loc in sorted(t1, key=lambda x: -x['severity_score'])[:3]:
    print('%s | sev=%.1f avg=%.0f trend=%s' % (
        loc['location_name'][:45], loc['severity_score'],
        loc['average_weekly_violations'], loc['trend_direction']))
    print('  ', loc['escalation_recommendation'][:200])
    print()

print('=== TIER 2 (mid 2) ===')
mid = t2[len(t2)//2:len(t2)//2+2]
for loc in mid:
    print('%s | sev=%.1f avg=%.0f trend=%s' % (
        loc['location_name'][:45], loc['severity_score'],
        loc['average_weekly_violations'], loc['trend_direction']))
    print('  ', loc['escalation_recommendation'][:200])
    print()

print('=== TIER 3 (bottom 2) ===')
for loc in sorted(t3, key=lambda x: x['severity_score'])[:2]:
    print('%s | sev=%.1f avg=%.0f trend=%s' % (
        loc['location_name'][:45], loc['severity_score'],
        loc['average_weekly_violations'], loc['trend_direction']))
    print('  ', loc['escalation_recommendation'][:200])
    print()
