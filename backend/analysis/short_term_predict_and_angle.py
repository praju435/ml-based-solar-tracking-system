import joblib
import numpy as np
import pandas as pd
from tensorflow.keras.models import load_model

# =====================================================
# CONFIG
# =====================================================

import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

LSTM_MODEL = os.path.join(
    BASE_DIR,
    "models_lstm",
    "shortterm_lstm_voltage.h5"
)

SCALER_PATH = os.path.join(
    BASE_DIR,
    "models_lstm",
    "shortterm_lstm_scaler.joblib"
)

SEQ_LEN = 5

# =====================================================
# LOAD MODEL & SCALER (ONCE)
# =====================================================

model = load_model(LSTM_MODEL, compile=False)
scaler = joblib.load(SCALER_PATH)

FEATURE_COLS = list(scaler.feature_names_in_)

# =====================================================
# HELPER FUNCTIONS
# =====================================================

def get_voltage_params():
    """Always safely fetch voltage scaling"""
    idx = FEATURE_COLS.index("voltage")
    return scaler.mean_[idx], scaler.scale_[idx]


def get_last_window(df):
    arr = df[FEATURE_COLS].astype(float).values
    if len(arr) < SEQ_LEN:
        pad = np.repeat(arr[[0]], SEQ_LEN - len(arr), axis=0)
        arr = np.vstack([pad, arr])
    else:
        arr = arr[-SEQ_LEN:]
    return arr


def scale_windows(windows_3d):
    N, T, F = windows_3d.shape
    flat = pd.DataFrame(
        windows_3d.reshape(N * T, F),
        columns=FEATURE_COLS
    )
    scaled = scaler.transform(flat)
    return scaled.reshape(N, T, F)


def predict_voltage(scaled_window):
    mean_v, std_v = get_voltage_params()
    scaled_pred = float(model.predict(scaled_window, verbose=0)[0][0])
    return scaled_pred * std_v + mean_v


def recommend_angle(last_window, angle_idx):
    mean_v, std_v = get_voltage_params()
    angles = np.arange(0, 91)

    windows = []
    for a in angles:
        w = last_window.copy()
        w[-1, angle_idx] = a
        windows.append(w)

    windows = np.array(windows)
    scaled = scale_windows(windows)

    preds_scaled = model.predict(scaled, verbose=0).flatten()
    preds = preds_scaled * std_v + mean_v

    best = int(np.argmax(preds))
    return int(angles[best]), float(preds[best])

# =====================================================
# ✅ FUNCTION USED BY FLASK BACKEND
# =====================================================

def run_short_term_prediction(seq_df):
    last_window = get_last_window(seq_df)
    scaled_last = scale_windows(last_window.reshape(1, SEQ_LEN, -1))

    pred_voltage = predict_voltage(scaled_last)

    angle_idx = FEATURE_COLS.index("panel_angle")
    rec_angle, rec_pred = recommend_angle(last_window, angle_idx)

    return {
        "predicted_voltage": round(float(pred_voltage), 3),
        "recommended_angle": int(rec_angle),
        "pred_voltage_at_recommended_angle": round(float(rec_pred), 3)
    }

# =====================================================
# STANDALONE TEST
# =====================================================

if __name__ == "__main__":
    dummy = pd.DataFrame([{
        "ldr": 600,
        "temp": 30,
        "humidity": 45,
        "panel_angle": 25,
        "voltage": 12,
        "current": 1.2
    }])

    print(run_short_term_prediction(dummy))
