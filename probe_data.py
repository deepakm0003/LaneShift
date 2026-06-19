import sqlite3

conn = sqlite3.connect('violations.db')
cur = conn.cursor()

print('=== data_sent_to_scita distinct values ===')
cur.execute('SELECT data_sent_to_scita, COUNT(*) FROM violations GROUP BY data_sent_to_scita ORDER BY COUNT(*) DESC')
for row in cur.fetchall():
    print(row)

print()
print('=== violation_count distribution ===')
cur.execute('SELECT violation_count, COUNT(*) FROM violations GROUP BY violation_count ORDER BY violation_count')
for row in cur.fetchall():
    print(row)

print()
print('=== vehicle_number nulls ===')
cur.execute("SELECT COUNT(*) FROM violations WHERE vehicle_number IS NULL OR vehicle_number = ''")
print('vehicle_number null/empty:', cur.fetchone()[0])

print()
print('=== updated_vehicle_number populated ===')
cur.execute("SELECT COUNT(*) FROM violations WHERE updated_vehicle_number IS NOT NULL AND updated_vehicle_number != ''")
print('updated_vehicle_number non-empty:', cur.fetchone()[0])

print()
print('=== vehicle number dispute (updated differs from original) ===')
cur.execute("""
    SELECT COUNT(*) FROM violations
    WHERE updated_vehicle_number IS NOT NULL
      AND updated_vehicle_number != ''
      AND updated_vehicle_number != vehicle_number
""")
print('dispute count:', cur.fetchone()[0])

print()
print('=== offence codes containing 109 (severity=10) or 107 (severity=9) ===')
cur.execute("SELECT COUNT(*) FROM violations WHERE offence_code LIKE '%109%'")
print('records with offence_code 109 (DOUBLE PARKING, sev=10):', cur.fetchone()[0])
cur.execute("SELECT COUNT(*) FROM violations WHERE offence_code LIKE '%107%'")
print('records with offence_code 107 (PARKING IN MAIN ROAD, sev=9):', cur.fetchone()[0])

print()
print('=== rejected + stuck counts ===')
cur.execute("SELECT validation_status, COUNT(*) FROM violations WHERE validation_status IN ('rejected','created1','processing') GROUP BY validation_status")
for row in cur.fetchall():
    print(row)

print()
print('=== sample data_sent_to_scita raw values ===')
cur.execute('SELECT data_sent_to_scita FROM violations LIMIT 15')
for row in cur.fetchall():
    print(repr(row[0]))

print()
print('=== lat/lon null check ===')
cur.execute('SELECT COUNT(*) FROM violations WHERE latitude IS NULL OR longitude IS NULL')
print('records with null lat or lon:', cur.fetchone()[0])

print()
print('=== sample violation rows for nudge endpoint ===')
cur.execute("SELECT id, latitude, longitude, location, police_station FROM violations WHERE latitude IS NOT NULL AND longitude IS NOT NULL LIMIT 5")
for row in cur.fetchall():
    print(row)

conn.close()
