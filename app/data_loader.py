import ast
import pandas as pd
import numpy as np
from datetime import timedelta
import logging

logger = logging.getLogger(__name__)


def parse_stringified_list(value, fallback=[]):
    """
    Parse stringified list like ["WRONG PARKING","PARKING NEAR ROAD CROSSING"]
    into actual Python list. Return fallback (default []) on any parse error.
    """
    if pd.isna(value) or value == "NULL":
        return fallback
    
    if isinstance(value, list):
        return value
    
    try:
        parsed = ast.literal_eval(str(value).strip())
        if isinstance(parsed, list):
            return parsed
        else:
            return fallback
    except (ValueError, SyntaxError):
        logger.warning(f"Failed to parse stringified list: {value}")
        return fallback


def load_and_clean_violations(csv_path: str) -> pd.DataFrame:
    """
    Load and clean the parking violations CSV.
    
    Returns:
        pd.DataFrame: Cleaned violations data with derived columns
    """
    # Load CSV with low_memory=False to avoid dtype warnings
    df = pd.read_csv(csv_path, low_memory=False)
    
    logger.info(f"Loaded {len(df)} rows from {csv_path}")
    
    # Replace string "NULL" with actual NaN across all columns
    df = df.replace("NULL", np.nan)
    
    # Parse violation_type from stringified list
    df['violation_type'] = df['violation_type'].apply(lambda x: parse_stringified_list(x, []))
    
    # Parse offence_code from stringified list
    df['offence_code'] = df['offence_code'].apply(lambda x: parse_stringified_list(x, []))
    
    # Convert created_datetime to UTC-aware datetime, then add IST column
    df['created_datetime'] = pd.to_datetime(df['created_datetime'], utc=True, errors='coerce')
    df['created_ist'] = df['created_datetime'] + timedelta(hours=5, minutes=30)
    
    # Extract hour in IST (0-23)
    df['hour_ist'] = df['created_ist'].dt.hour
    
    # Convert modified_datetime to UTC-aware datetime
    df['modified_datetime'] = pd.to_datetime(df['modified_datetime'], utc=True, errors='coerce')
    
    # Add primary_violation: first item in violation_type list, or "UNKNOWN" if empty
    df['primary_violation'] = df['violation_type'].apply(
        lambda x: x[0] if x and len(x) > 0 else "UNKNOWN"
    )
    
    # Add violation_count: length of violation_type list
    df['violation_count'] = df['violation_type'].apply(len)
    
    # Add is_named_junction: boolean, True if junction_name != "No Junction"
    df['is_named_junction'] = df['junction_name'].notna() & (df['junction_name'] != "No Junction")
    
    logger.info(f"Cleaned {len(df)} rows. "
                f"Primary violations: {df['primary_violation'].nunique()} unique types. "
                f"Multi-violation records: {(df['violation_count'] > 1).sum()}. "
                f"Named junctions: {df['is_named_junction'].sum()}.")
    
    return df
