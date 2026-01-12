# train_daily_rf.py
import os
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestRegressor
from sklearn.preprocessing import StandardScaler

# ---------------- CONFIG ----------------
TRAIN_CSV = "large_solar_daily_train.csv"
MODEL_DIR = "models_daily"
os.makedirs(MODEL_DIR, exist_ok=True)

MODEL_PATH = f"{MODEL_DIR}/daily_voltage_rf.joblib"
SCALER_PATH = f"{MODEL_DIR}/daily_rf_scaler.joblib"

FEATURE_COLS = [
    "avg_ldr","max_ldr","avg_temp","max_temp","avg_humidity",
    "avg_angle","std_angle","mean_voltage","max_voltage",
    "sum_current","mean_current","samples"
]
TARGET_COL = "mean_voltage"

# ---------------- LOAD DATA ----------------
df = pd.read_csv(TRAIN_CSV)

X = df[FEATURE_COLS].astype(float)
y = df[TARGET_COL].astype(float)

# ---------------- SCALE ----------------
scaler = StandardScaler()
X_scaled = scaler.fit_transform(X)

# ---------------- TRAIN ----------------
rf = RandomForestRegressor(
    n_estimators=150,
    max_depth=12,
    random_state=42,
    n_jobs=-1
)
rf.fit(X_scaled, y)

# ---------------- SAVE ----------------
joblib.dump(rf, MODEL_PATH)
joblib.dump(scaler, SCALER_PATH)

print("✅ Daily RF model trained and saved")
print("Model:", MODEL_PATH)
print("Scaler:", SCALER_PATH)
