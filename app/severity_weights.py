"""
Offence Code → Congestion Severity Weight Mapping

This mapping is a TUNABLE HEURISTIC, not derived from sensor data.
It weights violations by their structural impact on carriageway capacity and traffic flow,
on a 1-10 scale, where:
  - 10 = completely blocks a lane/junction
  - 5-6 = moderate obstruction, high volume
  - 1-3 = no direct carriageway obstruction (compliance/safety violations)

IMPORTANT: This dataset contains NO ground-truth congestion measurement (queue length, delay, etc.).
These weights are based on domain reasoning about carriageway geometry and typical Indian traffic patterns.
In production, these should be recalibrated against actual sensor data (e.g., GPS delay patterns, queue lengths).

The formula normalizes these 1-10 values to 0-100 for the final scoring function.
"""

OFFENCE_CODE_SEVERITY = {
    # High-obstruction violations: directly block lanes or critical junctions (7-10)
    104: 8,   # PARKING NEAR ROAD CROSSING — blocks junction entry/exit, forces merging
    106: 8,   # PARKING NEAR TRAFFIC LIGHT OR ZEBRA CROSS — similar to above
    107: 9,   # PARKING IN A MAIN ROAD — removes entire lane width on high-capacity road
    109: 10,  # DOUBLE PARKING — two vehicles blocking one lane; maximum structural impact
    135: 7,   # AGAINST ONE WAY/NO ENTRY — oncoming vehicle severely disrupts flow
    146: 8,   # STOPPING ON WHITE/STOP LINE — blocks intersection control point
    
    # Pedestrian-safety violations with moderate carriageway impact (6-7)
    105: 6,   # PARKING ON FOOTPATH — pedestrians displaced to road; indirect spillover
    111: 7,   # PARKING NEAR BUSTOP/SCHOOL/HOSPITAL — high activity zones, frequent stops/starts
    
    # Highest-volume violations: moderate per-instance impact, critical because of frequency (5-6)
    112: 5,   # WRONG PARKING — most common violation; single-vehicle minor displacement
    113: 6,   # NO PARKING — similar to WRONG PARKING but in explicit no-parking zones
    
    # Other location-based violations (4-7)
    108: 5,   # PARKING OPPOSITE TO ANOTHER PARKED VEHICLE — moderate obstruction
    139: 5,   # PARKING OTHER THAN BUS STOP — busses blocked; high-volume public transit impact
    
    # Driving behavior violations: traffic flow impact (5-7)
    130: 5,   # VIOLATING LANE DISCIPLINE — causes merging; moderate disruption
    134: 6,   # U TURN PROHIBITED — forces traffic around prohibited area
    147: 4,   # H T V PROHIBITED — heavy/transport vehicle in restricted zone; spillover
    
    # Compliance/safety violations: NO direct carriageway obstruction (1-3)
    110: 2,   # FAIL TO USE SAFETY BELTS — occupant safety, not traffic flow
    116: 2,   # DEFECTIVE NUMBER PLATE — identification compliance, not traffic flow
    123: 3,   # CARRYING LENGTHY MATERIAL — slightly increases effective vehicle width
    124: 1,   # REFUSE TO GO FOR HIRE — taxi-specific regulation, minimal traffic impact
    125: 1,   # DEMANDING EXCESS FARE — taxi-specific regulation, minimal traffic impact
    133: 2,   # USING BLACK FILM/OTHER MATERIALS — visibility compliance, not traffic flow
    136: 4,   # OBSTRUCTING DRIVER — unclear definition in context, conservative moderate weight
    140: 2,   # RIDER NOT WEARING HELMET — occupant safety, not traffic flow
    144: 2,   # WITHOUT SIDE MIRROR — visibility compliance, not traffic flow
    237: 2,   # 2W/3W - USING MOBILE PHONE — distracted driving; no immediate physical obstruction
    437: 2,   # OTHER - USING MOBILE PHONE — similar to above
    
    # Signal violations: traffic control disruption (6-8)
    115: 7,   # JUMPING TRAFFIC SIGNAL — creates oncoming/perpendicular collision risk, forces emergency stops
}

# For any offence_code not in this table, default to moderate severity
DEFAULT_SEVERITY = 4
