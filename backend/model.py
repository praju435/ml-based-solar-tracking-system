# ml_models.py
"""
ML helpers for solar voltage prediction.

Provides:
- load_csv / generate_synthetic_data
- train_rf, train_xgb (if available), train_lstm (if TF available)
- save_model / load_model helpers
- predict_single (RF/XGB)
- predict_sequence_lstm
- ensemble_predict (combines available models)

Usage:
  from ml_models import train_rf, load_model, predict_single, ensemble_predict, generate_synthetic_data
"""

import os
import joblib
import random
import numpy as np
import pandas as pd
from datetime import datetime
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error

# Optional imports
try:
    from sklearn.ensemble import RandomForestRegressor
    SKLEARN_AVAILABLE = True
except Exception:
    SKLEARN_AVAILABLE = False

try:
    import xgboost as xgb
    XGB_AVAILABLE = True
except Exception:
    XGB_AVAILABLE = False

try:
    import tensorflow as tf
    from tensorflow.keras import Sequential
    from tensorflow.keras.layers import LSTM, Dense, Dropout
    TF_AVAILABLE = True
except Exception:
    TF_AVAILABLE = False

# Default model directory
MODEL_DIR = os.environ.get("MODEL_DIR", "./models")
os.makedirs(MODEL_DIR, exist_ok=True)

RF_MODEL_PATH = os.path.join(MODEL_DIR, "voltage_model_rf.joblib")
XGB_MODEL_PATH = os.path.join(MODEL_DIR, "voltage_model_xgb.joblib")
LSTM_MODEL_PATH = os.path.join(MODEL_DIR, "lstm_model.h5")

# Sequence length for LSTM / flattened XGB usage
SEQ_LEN = int(os.environ.get("SEQ_LEN", 24))

# -------------------------
# Data helpers
# -------------------------
def generate_synthetic_data(n=2500, seed=42):
    """Generate synthetic dataset similar to your app's generator."""
    random.seed(seed)
    np.random.seed(seed)
    rows = []
    for _ in range(n):
        ldr = random.uniform(200, 900)
        temp = random.uniform(20, 50)
        humidity = random.uniform(10, 90)
        angle = random.uniform(0, 90)
        voltage = (ldr / 1000) * 24 - 0.12 * (temp - 25) - (abs(angle - 45) / 45) * 2.2 - 0.02 * (humidity - 50)
        voltage = max(0.0, voltage + random.gauss(0, 0.35))
        rows.append([ldr, temp, humidity, angle, round(voltage, 3)])
    df = pd.DataFrame(rows, columns=["ldr", "temp", "humidity", "angle", "voltage"])
    return df

def load_csv(path):
    """Load CSV into a DataFrame and validate expected columns."""
    df = pd.read_csv(path)
    expected = {"ldr", "temp", "humidity", "angle", "voltage"}
    if not expected.issubset(set(df.columns)):
        raise ValueError(f"CSV must contain columns: {expected}. Found: {df.columns.tolist()}")
    return df

# -------------------------
# Save / load helpers
# -------------------------
def save_rf_model(model, path=RF_MODEL_PATH):
    joblib.dump(model, path)
    return path

def load_rf_model(path=RF_MODEL_PATH):
    if not os.path.exists(path):
        return None
    return joblib.load(path)

def save_xgb_model(model, path=XGB_MODEL_PATH):
    joblib.dump(model, path)
    return path

def load_xgb_model(path=XGB_MODEL_PATH):
    if not os.path.exists(path):
        return None
    return joblib.load(path)

def save_lstm_model(model, path=LSTM_MODEL_PATH):
    model.save(path)
    return path

def load_lstm_model(path=LSTM_MODEL_PATH):
    if not TF_AVAILABLE or not os.path.exists(path):
        return None
    return tf.keras.models.load_model(path, compile=False)

# -------------------------
# Training functions
# -------------------------
def train_rf(df, n_estimators=200, save_path=RF_MODEL_PATH, random_state=42, test_size=0.12):
    """Train RandomForest on tabular data.
       df: DataFrame with columns ldr,temp,humidity,angle,voltage
    """
    if not SKLEARN_AVAILABLE:
        raise RuntimeError("scikit-learn not available")
    X = df[["ldr", "temp", "humidity", "angle"]].values
    y = df["voltage"].values
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=test_size, random_state=random_state)
    model = RandomForestRegressor(n_estimators=n_estimators, random_state=random_state, n_jobs=-1)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_val)
    mae = mean_absolute_error(y_val, y_pred)
    save_rf_model(model, save_path)
    return model, mae

def train_xgb(df, params=None, num_round=100, save_path=XGB_MODEL_PATH, test_size=0.12, random_state=42):
    """Train an XGBoost regressor (sklearn API if available)."""
    if not XGB_AVAILABLE:
        raise RuntimeError("xgboost not available")
    if params is None:
        params = {"objective": "reg:squarederror", "tree_method": "auto", "n_jobs": -1}
    X = df[["ldr", "temp", "humidity", "angle"]].values
    y = df["voltage"].values
    X_train, X_val, y_train, y_val = train_test_split(X, y, test_size=test_size, random_state=random_state)
    model = xgb.XGBRegressor(**params, n_estimators=num_round)
    model.fit(X_train, y_train, eval_set=[(X_val, y_val)], verbose=False)
    y_pred = model.predict(X_val)
    mae = mean_absolute_error(y_val, y_pred)
    save_xgb_model(model, save_path)
    return model, mae

def create_sequences(df, seq_len=SEQ_LEN, step=1):
    """
    Create overlapping sequences for LSTM.
    Returns X (num_samples, seq_len, features) and y (num_samples,)
    Uses columns: ldr,temp,humidity,angle,voltage
    """
    arr = df[["ldr", "temp", "humidity", "angle", "voltage"]].values
    n_samples = (len(arr) - seq_len) // step + 1
    if n_samples <= 0:
        raise ValueError("Not enough rows to create sequences. Increase data or reduce seq_len.")
    X = []
    y = []
    for i in range(0, len(arr) - seq_len + 1, step):
        seq = arr[i:i+seq_len, :4]    # features (ldr,temp,humidity,angle)
        target = arr[i+seq_len-1, 4]  # voltage at last timestep
        X.append(seq)
        y.append(target)
    X = np.array(X, dtype=np.float32)
    y = np.array(y, dtype=np.float32)
    return X, y

def build_lstm_model(input_shape, units=64, dropout=0.1):
    model = Sequential()
    model.add(LSTM(units, input_shape=input_shape, return_sequences=False))
    if dropout and dropout > 0:
        model.add(Dropout(dropout))
    model.add(Dense(32, activation="relu"))
    model.add(Dense(1, activation="linear"))
    model.compile(optimizer="adam", loss="mse", metrics=["mae"])
    return model

def train_lstm(df, seq_len=SEQ_LEN, epochs=30, batch_size=32, save_path=LSTM_MODEL_PATH, verbose=1):
    """Train an LSTM sequence model (requires TF)."""
    if not TF_AVAILABLE:
        raise RuntimeError("TensorFlow not available")
    X, y = create_sequences(df, seq_len=seq_len)
    input_shape = (X.shape[1], X.shape[2])  # (seq_len, features)
    model = build_lstm_model(input_shape)
    history = model.fit(X, y, epochs=epochs, batch_size=batch_size, validation_split=0.12, verbose=verbose)
    save_lstm_model(model, save_path)
    # compute validation MAE on held-out portion (approx)
    val_mae = history.history.get("val_mae")[-1] if "val_mae" in history.history else None
    return model, val_mae, history

# -------------------------
# Prediction functions
# -------------------------
def predict_single_rf(model, ldr, temp, humidity, angle):
    X = np.array([[ldr, temp, humidity, angle]])
    return float(model.predict(X)[0])

def predict_single_xgb(model, ldr, temp, humidity, angle):
    X = np.array([[ldr, temp, humidity, angle]])
    return float(model.predict(X)[0])

def predict_sequence_lstm(model, seq):
    """
    seq: shape (seq_len, features=4) or (1, seq_len, features)
    returns scalar prediction
    """
    if seq.ndim == 2:
        arr = np.expand_dims(seq, 0)
    else:
        arr = seq
    p = model.predict(arr)
    return float(p[0][0])

# -------------------------
# Ensemble wrapper
# -------------------------
def ensemble_predict(device_seq, rf_model=None, xgb_model=None, lstm_model=None):
    """
    device_seq: list of sample dicts or numpy array sequence
      If list of dicts: expected keys ldr,temperature,humidity,panel_angle,voltage (or names convertible)
    Returns dict with pred_15m, pred_30m (same here), recommended_angle (grid search using RF), meta
    """
    preds = []
    meta = {"models": []}

    # normalize device_seq -> numpy seq (seq_len, features)
    seq_arr = None
    if device_seq is not None:
        if isinstance(device_seq, list):
            # convert list of dicts to numpy array [ldr, temp, hum, angle, voltage]
            rows = []
            for s in device_seq:
                ldr = s.get("ldr", s.get("ldr", s.get("LDR", 0.0)))
                temp = s.get("temperature", s.get("temp", 0.0))
                hum = s.get("humidity", s.get("hum", s.get("humidity", 0.0)))
                angle = s.get("panel_angle", s.get("angle", 0.0))
                voltage = s.get("voltage", 0.0)
                rows.append([ldr, temp, hum, angle, voltage])
            seq_arr = np.array(rows, dtype=np.float32)
        elif isinstance(device_seq, np.ndarray):
            seq_arr = device_seq.astype(np.float32)

    # LSTM prediction (needs full seq)
    if TF_AVAILABLE and lstm_model is not None and seq_arr is not None and seq_arr.shape[0] >= SEQ_LEN:
        # take last SEQ_LEN rows
        seq_input = seq_arr[-SEQ_LEN:, :4]   # features only
        try:
            p = predict_sequence_lstm(lstm_model, seq_input)
            preds.append(p)
            meta["models"].append(("lstm", round(p, 3)))
        except Exception as e:
            meta["lstm_error"] = str(e)

    # XGB using flattened sequence (if available)
    if XGB_AVAILABLE and xgb_model is not None and seq_arr is not None and seq_arr.shape[0] >= SEQ_LEN:
        flat = seq_arr[-SEQ_LEN:, :].reshape(1, -1)
        try:
            p = float(xgb_model.predict(flat)[0])
            preds.append(p)
            meta["models"].append(("xgboost", round(p, 3)))
        except Exception as e:
            meta["xgb_error"] = str(e)

    # RF fallback: either use last timestep features or if RF supports flattened features, attempt that
    if rf_model is not None:
        try:
            if seq_arr is not None and seq_arr.shape[0] >= 1:
                last = seq_arr[-1, :]  # last row
                p_rf = float(rf_model.predict(np.array([[last[0], last[1], last[2], last[3]]]))[0])
            else:
                # no seq: use average defaults
                p_rf = float(rf_model.predict(np.array([[500, 25, 45, 30]]))[0])
            preds.append(p_rf)
            meta["models"].append(("rf", round(p_rf, 3)))
        except Exception as e:
            meta["rf_error"] = str(e)

    if not preds:
        return None

    pred_15m = float(np.mean(preds))
    pred_30m = pred_15m  # placeholder

    # recommended angle: grid search maximizing RF prediction (fast)
    if rf_model is not None:
        # pick ldr/temp/humidity from last sample if available
        if seq_arr is not None and seq_arr.shape[0] >= 1:
            last = seq_arr[-1, :]
            ldr, temp, hum = float(last[0]), float(last[1]), float(last[2])
        else:
            ldr, temp, hum = 500.0, 25.0, 45.0
        best_ang = 0
        best_v = -1e9
        for a in range(0, 91):
            try:
                v = float(rf_model.predict(np.array([[ldr, temp, hum, a]]))[0])
            except Exception:
                v = -1e9
            if v > best_v:
                best_v = v
                best_ang = a
    else:
        best_ang = int(30)

    return {
        "pred_15m": round(pred_15m, 3),
        "pred_30m": round(pred_30m, 3),
        "recommended_angle": int(best_ang),
        "meta": meta
    }

# -------------------------
# Example quick CLI usage
# -------------------------
if __name__ == "__main__":
    # quick demonstration when run directly
    print("ML models helper demo")
    sample_csv = os.path.join(MODEL_DIR, "synthetic_demo.csv")
    if not os.path.exists(sample_csv):
        df_demo = generate_synthetic_data(1500)
        df_demo.to_csv(sample_csv, index=False)
        print("Saved synthetic CSV:", sample_csv)
    else:
        df_demo = load_csv(sample_csv)
    print("Training RF on demo csv...")
    rf, mae = train_rf(df_demo)
    print(f"RF trained. Validation MAE: {mae:.4f} V. Model saved to {RF_MODEL_PATH}")
    # If XGBoost available, train it (optional)
    if XGB_AVAILABLE:
        print("Training XGBoost (this may take longer)...")
        xgb_m, xgb_mae = train_xgb(df_demo, num_round=200)
        print(f"XGB trained. Validation MAE: {xgb_mae:.4f} V. Model saved to {XGB_MODEL_PATH}")
    if TF_AVAILABLE:
        print("Preparing LSTM training (this will take significantly longer)...")
        try:
            lstm_m, val_mae, _ = train_lstm(df_demo, seq_len=SEQ_LEN, epochs=10)
            print("LSTM trained. Validation MAE (approx):", val_mae)
        except Exception as e:
            print("LSTM train failed:", e)
    print("Done.")
