# backend/analysis/daily_forecast_recursive.py

import os
import joblib
import numpy as np
import pandas as pd
from datetime import timedelta

# ================= PATHS =================
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DAILY_MODEL_PATH = os.path.join(
    BASE_DIR,
    "models_daily",
    "daily_voltage_rf.joblib"
)

DAILY_SCALER_PATH = os.path.join(
    BASE_DIR,
    "models_daily",
    "daily_rf_scaler.joblib"
)

# ================= LOAD MODELS =================
rf = joblib.load(DAILY_MODEL_PATH)
scaler = joblib.load(DAILY_SCALER_PATH)

FEATURE_COLS = [
    "avg_ldr", "max_ldr",
    "avg_temp", "max_temp",
    "avg_humidity",
    "avg_angle", "std_angle",
    "mean_voltage", "max_voltage",
    "sum_current", "mean_current",
    "samples"
]

# ================= DAILY FORECAST =================
def run_daily_forecast(seq_df, horizon=7):
    """
    seq_df: recent telemetry DataFrame
    horizon: number of days
    """

    forecasts = []

    # Use last known values as base
    last = seq_df.iloc[-1]

    base = {
        "avg_ldr": last.get("ldr", 600),
        "max_ldr": last.get("ldr", 600),
        "avg_temp": last.get("temperature", 30),
        "max_temp": last.get("temperature", 32),
        "avg_humidity": last.get("humidity", 50),
        "avg_angle": last.get("panel_angle", 30),
        "std_angle": 2,
        "mean_voltage": last.get("voltage", 12),
        "max_voltage": last.get("voltage", 12),
        "sum_current": last.get("current", 1.2),
        "mean_current": last.get("current", 1.2),
        "samples": len(seq_df)
    }

    for d in range(1, horizon + 1):
        X = pd.DataFrame([base], columns=FEATURE_COLS)
        Xs = scaler.transform(X)
        pred_v = float(rf.predict(Xs)[0])

        forecasts.append({
            "day": d,
            "predicted_voltage": round(pred_v, 3)
        })

        # simple decay feedback loop
        base["mean_voltage"] = pred_v
        base["max_voltage"] = pred_v

    return forecasts



if __name__ == "__main__":
    main()


