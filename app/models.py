from pydantic import BaseModel
from datetime import datetime
from typing import List, Optional, Dict, Any


class HealthResponse(BaseModel):
    """Response model for health check endpoint."""
    status: str
    total_records: int
    database_path: str
    timestamp: datetime


class ComputeScoresResponse(BaseModel):
    """Response model for compute-scores endpoint."""
    status: str
    records_scored: int
    computation_time_seconds: float


class ScoreBreakdown(BaseModel):
    """Detailed breakdown of how a score was computed."""
    time_of_day_weight: float
    junction_density_weight: float
    severity_weight: float
    stacking_multiplier: float
    methodology: str


class ViolationScoreResponse(BaseModel):
    """Response model for violation score lookup endpoint."""
    violation_id: str
    location: Optional[str]
    junction_name: Optional[str]
    vehicle_number: Optional[str]
    vehicle_type: Optional[str]
    primary_violation: Optional[str]
    violation_type: Optional[List[str]]
    offence_code: Optional[List[int]]
    created_ist: Optional[str]
    hour_ist: Optional[float]
    police_station: Optional[str]
    validation_status: Optional[str]
    congestion_cost_score: Optional[int]
    score_breakdown: ScoreBreakdown


class ViolationResponse(BaseModel):
    """Response model for a violation record."""
    id: int
    latitude: Optional[float]
    longitude: Optional[float]
    location: Optional[str]
    vehicle_number: Optional[str]
    vehicle_type: Optional[str]
    violation_type: Optional[List[str]]
    primary_violation: Optional[str]
    violation_count: Optional[int]
    created_datetime: Optional[datetime]
    created_ist: Optional[datetime]
    hour_ist: Optional[int]
    junction_name: Optional[str]
    is_named_junction: Optional[bool]
    police_station: Optional[str]
    validation_status: Optional[str]
    offence_code: Optional[List[int]]
    
    class Config:
        from_attributes = True


class StationRanking(BaseModel):
    """Single police station ranking."""
    police_station: str
    total_violations: int
    aggregate_congestion_score: int
    average_congestion_score: float
    dispatch_priority_rank: int
    top_violation_type: str
    pending_validation_count: int


class JunctionRanking(BaseModel):
    """Single junction ranking."""
    junction_name: str
    police_station: Optional[str]
    total_violations: int
    aggregate_congestion_score: int
    average_congestion_score: float
    dispatch_priority_rank: int
    top_violation_types: List[str]
    pending_validation_count: int


class MidblockHotspot(BaseModel):
    """Single mid-block geographic cluster."""
    grid_cell_lat: float
    grid_cell_lon: float
    violation_count: int
    aggregate_congestion_score: int
    jurisdictions: List[str]
    pending_validation_count: int
    hotspot_rank: int


class LiveQueueItem(BaseModel):
    """Single item in the live dispatch queue."""
    rank: int
    location_type: str  # "junction" or "midblock_cluster"
    location_name: str
    police_station_jurisdiction: Optional[str]
    aggregate_congestion_score: int
    violation_count: int
    recommended_action: str  # "Dispatch immediately", "Route on standard patrol", "Monitor"
    pending_validations: int = 0
    top_violation_types: Optional[List[str]] = None
    grid_cell_lat: Optional[float] = None
    grid_cell_lon: Optional[float] = None


class LiveQueueResponse(BaseModel):
    """Response model for live dispatch queue."""
    generated_at: str
    queue: List[LiveQueueItem]


class ValidationLeakItem(BaseModel):
    """Single station's validation pipeline metrics."""
    police_station: str
    total_submitted: int
    approved_count: int
    rejected_count: int
    stuck_count: int
    approval_rate_pct: float
    rejection_rate_pct: float
