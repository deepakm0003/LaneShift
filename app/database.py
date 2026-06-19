"""
LaneShift — Database Layer
===========================
Two-table architecture (as of this version):

  violations_foundation  — PERMANENT, READ-ONLY from app code.
                           The original 298,450-row BTP dataset (Nov 2023–Apr 2024).
                           NEVER deleted, truncated, or modified by any upload endpoint.
                           All existing dashboard/dispatch/forecast/hotspot endpoints
                           query THIS table only.

  violations_uploaded    — Receives user-uploaded CSV batches.
                           Tagged with upload_batch_id + upload_timestamp.
                           Completely separate from the foundation data.
                           Upload analytics are computed entirely from this table.

The ORM model `Violation` maps to `violations_foundation`.
Upload writes go through raw SQL to `violations_uploaded` (separate model below).
"""

import json
import os
import uuid
from datetime import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Float, DateTime,
    Boolean, Text, Index, text, inspect as sa_inspect
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import logging

from data_loader import load_and_clean_violations

logger = logging.getLogger(__name__)

Base = declarative_base()

# ── FOUNDATION TABLE (permanent BTP dataset) ──────────────────────────────────

class Violation(Base):
    """
    The permanent, protected foundation dataset.
    Table name: violations_foundation
    Maps to the original 298,450-row BTP dataset.
    """
    __tablename__ = "violations_foundation"

    id = Column(String, primary_key=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location = Column(String, nullable=True)
    vehicle_number = Column(String, nullable=True, index=True)
    vehicle_type = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    violation_type = Column(Text, nullable=True)
    offence_code = Column(Text, nullable=True)
    created_datetime = Column(DateTime, nullable=True, index=True)
    closed_datetime = Column(DateTime, nullable=True)
    modified_datetime = Column(DateTime, nullable=True)
    device_id = Column(String, nullable=True, index=True)
    created_by_id = Column(String, nullable=True)
    center_code = Column(String, nullable=True)
    police_station = Column(String, nullable=True, index=True)
    data_sent_to_scita = Column(String, nullable=True)
    junction_name = Column(String, nullable=True, index=True)
    action_taken_timestamp = Column(DateTime, nullable=True)
    data_sent_to_scita_timestamp = Column(DateTime, nullable=True)
    updated_vehicle_number = Column(String, nullable=True)
    updated_vehicle_type = Column(String, nullable=True)
    validation_status = Column(String, nullable=True, index=True)
    validation_timestamp = Column(DateTime, nullable=True)
    created_ist = Column(DateTime, nullable=True)
    hour_ist = Column(Float, nullable=True, index=True)
    primary_violation = Column(String, nullable=True, index=True)
    violation_count = Column(Integer, nullable=True)
    is_named_junction = Column(Boolean, nullable=True)
    congestion_cost_score = Column(Integer, nullable=True, index=True)

    __table_args__ = (
        Index('ix_fdn_hour_violation', 'hour_ist', 'primary_violation'),
        Index('ix_fdn_station_junction', 'police_station', 'junction_name'),
    )


# ── UPLOADED DATA TABLE (user uploads — never touches foundation) ─────────────

class UploadedViolation(Base):
    """
    Uploaded CSV data. Same schema as foundation but separate table.
    Tagged with upload_batch_id so multiple uploads don't collide.
    """
    __tablename__ = "violations_uploaded"

    row_pk = Column(Integer, primary_key=True, autoincrement=True)
    upload_batch_id = Column(String, nullable=False, index=True)
    upload_timestamp = Column(DateTime, nullable=False)
    source_filename = Column(String, nullable=True)

    id = Column(String, nullable=True, index=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    location = Column(String, nullable=True)
    vehicle_number = Column(String, nullable=True)
    vehicle_type = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    violation_type = Column(Text, nullable=True)
    offence_code = Column(Text, nullable=True)
    created_datetime = Column(DateTime, nullable=True)
    closed_datetime = Column(DateTime, nullable=True)
    modified_datetime = Column(DateTime, nullable=True)
    device_id = Column(String, nullable=True)
    created_by_id = Column(String, nullable=True)
    center_code = Column(String, nullable=True)
    police_station = Column(String, nullable=True)
    data_sent_to_scita = Column(String, nullable=True)
    junction_name = Column(String, nullable=True)
    action_taken_timestamp = Column(DateTime, nullable=True)
    data_sent_to_scita_timestamp = Column(DateTime, nullable=True)
    updated_vehicle_number = Column(String, nullable=True)
    updated_vehicle_type = Column(String, nullable=True)
    validation_status = Column(String, nullable=True)
    validation_timestamp = Column(DateTime, nullable=True)
    created_ist = Column(DateTime, nullable=True)
    hour_ist = Column(Float, nullable=True)
    primary_violation = Column(String, nullable=True)
    violation_count = Column(Integer, nullable=True)
    is_named_junction = Column(Boolean, nullable=True)
    congestion_cost_score = Column(Integer, nullable=True)


# ── Engine / session helpers ──────────────────────────────────────────────────

def get_engine(db_path: str = "violations.db"):
    return create_engine(f"sqlite:///{db_path}", echo=False)


def init_db(db_path: str = "violations.db"):
    engine = get_engine(db_path)
    Base.metadata.create_all(engine)
    logger.info(f"Database schema initialised at {db_path}")
    return engine


# ── Foundation migration (violations → violations_foundation) ─────────────────

def _migrate_old_violations_table(engine) -> int:
    """
    If the old `violations` table still exists (from before this refactor),
    copy its data into `violations_foundation` and drop the old table.
    Returns number of rows migrated (0 if nothing to do).
    """
    with engine.connect() as conn:
        inspector = sa_inspect(engine)
        tables = inspector.get_table_names()

        if "violations" not in tables:
            return 0  # nothing to migrate

        # Check foundation is empty (avoid double-migration)
        if "violations_foundation" in tables:
            count = conn.execute(
                text("SELECT COUNT(*) FROM violations_foundation")
            ).scalar() or 0
            if count > 0:
                # Foundation already populated — just drop the old table
                conn.execute(text("DROP TABLE IF EXISTS violations"))
                conn.commit()
                logger.info("Dropped legacy `violations` table (foundation already populated)")
                return 0

        # Copy everything from violations → violations_foundation
        logger.info("Migrating `violations` → `violations_foundation` …")
        conn.execute(text(
            "INSERT OR IGNORE INTO violations_foundation "
            "SELECT id, latitude, longitude, location, vehicle_number, vehicle_type, "
            "description, violation_type, offence_code, created_datetime, closed_datetime, "
            "modified_datetime, device_id, created_by_id, center_code, police_station, "
            "data_sent_to_scita, junction_name, action_taken_timestamp, "
            "data_sent_to_scita_timestamp, updated_vehicle_number, updated_vehicle_type, "
            "validation_status, validation_timestamp, created_ist, hour_ist, "
            "primary_violation, violation_count, is_named_junction, congestion_cost_score "
            "FROM violations"
        ))
        migrated = conn.execute(
            text("SELECT COUNT(*) FROM violations_foundation")
        ).scalar() or 0
        conn.execute(text("DROP TABLE IF EXISTS violations"))
        conn.commit()
        logger.info(f"Migration complete: {migrated:,} rows in violations_foundation")
        return migrated


# ── Foundation integrity check ────────────────────────────────────────────────

FOUNDATION_EXPECTED_COUNT = 298450

def verify_foundation_integrity(db_path: str = "violations.db") -> bool:
    """
    Checks violations_foundation has the expected row count.
    Logs a loud WARNING if the count is wrong.
    Called at startup — silent pass if table is empty (DB not yet loaded).
    """
    try:
        engine = get_engine(db_path)
        with engine.connect() as conn:
            inspector = sa_inspect(engine)
            if "violations_foundation" not in inspector.get_table_names():
                return True  # table doesn't exist yet — first run
            count = conn.execute(
                text("SELECT COUNT(*) FROM violations_foundation")
            ).scalar() or 0

        if count == 0:
            return True  # not yet loaded — OK
        if count == FOUNDATION_EXPECTED_COUNT:
            logger.info(f"✓ Foundation integrity OK: {count:,} rows")
            return True
        else:
            logger.warning(
                "⚠ FOUNDATION INTEGRITY MISMATCH: expected %d rows, found %d. "
                "The foundation dataset may have been modified. "
                "Restore violations.db from backup or reload the original CSV.",
                FOUNDATION_EXPECTED_COUNT, count
            )
            return False
    except Exception as e:
        logger.error("Foundation integrity check failed: %s", e)
        return False


# ── Foundation loader (called at startup only) ────────────────────────────────

def load_csv_into_db(csv_path: str, db_path: str = "violations.db"):
    """
    Load and clean the BTP violations CSV into violations_foundation.
    Only writes if the foundation table is currently empty.
    NEVER deletes existing foundation data.
    """
    if not os.path.exists(csv_path):
        raise FileNotFoundError(f"CSV not found: {csv_path}")

    engine = init_db(db_path)

    # Migrate old `violations` table if it exists
    _migrate_old_violations_table(engine)

    # Check if foundation already has data — if so, skip
    with engine.connect() as conn:
        count = conn.execute(
            text("SELECT COUNT(*) FROM violations_foundation")
        ).scalar() or 0
    if count > 0:
        logger.info(f"Foundation already has {count:,} rows — skipping CSV load.")
        return engine

    logger.info(f"Loading foundation CSV: {csv_path}")
    df = load_and_clean_violations(csv_path)
    df['violation_type'] = df['violation_type'].apply(json.dumps)
    df['offence_code']   = df['offence_code'].apply(json.dumps)

    df.to_sql('violations_foundation', engine, if_exists='append', index=False,
              chunksize=10000)
    logger.info(f"Foundation loaded: {len(df):,} rows into violations_foundation")

    # Ensure congestion_cost_score column exists
    with engine.connect() as conn:
        cols = [c['name'] for c in sa_inspect(engine).get_columns('violations_foundation')]
        if 'congestion_cost_score' not in cols:
            conn.execute(text(
                "ALTER TABLE violations_foundation ADD COLUMN congestion_cost_score INTEGER"
            ))
            conn.commit()

    return engine


# ── Count helpers ─────────────────────────────────────────────────────────────

def get_violation_count(db_path: str = "violations.db") -> int:
    """Returns foundation row count."""
    try:
        engine = get_engine(db_path)
        with engine.connect() as conn:
            inspector = sa_inspect(engine)
            # Support both old and new table names during transition
            if "violations_foundation" in inspector.get_table_names():
                return conn.execute(
                    text("SELECT COUNT(*) FROM violations_foundation")
                ).scalar() or 0
            elif "violations" in inspector.get_table_names():
                return conn.execute(
                    text("SELECT COUNT(*) FROM violations")
                ).scalar() or 0
            return 0
    except Exception as e:
        logger.error("get_violation_count error: %s", e)
        return 0


def db_exists_and_has_data(db_path: str = "violations.db") -> bool:
    if not os.path.exists(db_path):
        return False
    try:
        return get_violation_count(db_path) > 0
    except Exception as e:
        logger.error(f"Error checking database: {e}")
        return False
