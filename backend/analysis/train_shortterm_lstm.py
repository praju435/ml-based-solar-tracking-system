# train_shortterm_lstm.py
import os
import numpy as np
import pandas as pd
import joblib

from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_absolute_error
from sklearn.preprocessing import StandardScaler

import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import EarlyStopping, ReduceLROnPlateau

DATA_PATH = "solar_seq_data.csv"   # path to your time-series CSV
OUT_DIR = "models_lstm"
os.makedirs(OUT_DIR, exist_ok=True)

SEQ_LEN = 24   # past 24 timesteps (~6h if 15-min intervals)
STEP = 1
BATCH = 128
EPOCHS = 15

def main():
    print("Loading sequence data from:", DATA_PATH)
    df = pd.read_csv(DATA_PATH)

    # Sort by device + time
    df["ts_dt"] = pd.to_datetime(df["ts"])
    df = df.sort_values(["device_id", "ts_dt"]).reset_index(drop=True)

    feature_cols = ["ldr", "temp", "humidity", "panel_angle", "voltage", "current"]
    target_col = "voltage"  # next-step voltage

    # ---- Standardize features (very important for LSTM) ----
    scaler = StandardScaler()
    df[feature_cols] = scaler.fit_transform(df[feature_cols])

    # ---- Build sliding windows per device ----
    X_list, y_list = [], []
    for dev_id, ddev in df.groupby("device_id"):
        vals = ddev[feature_cols + [target_col]].values  # last column is voltage (standardized)
        n = len(vals)
        for i in range(0, n - SEQ_LEN, STEP):
            window = vals[i:i+SEQ_LEN, :len(feature_cols)]   # seq of features
            target = vals[i+SEQ_LEN, -1]                     # next-step voltage
            X_list.append(window)
            y_list.append(target)

    X = np.array(X_list, dtype=np.float32)
    y = np.array(y_list, dtype=np.float32)

    print("Sliding windows built:")
    print("  X shape:", X.shape, "(samples, seq_len, features)")
    print("  y shape:", y.shape)

    # ---- Train/validation split ----
    X_train, X_val, y_train, y_val = train_test_split(
        X, y, test_size=0.12, random_state=42
    )
    print("Train samples:", X_train.shape[0], "Val samples:", X_val.shape[0])

    # ---- Build LSTM model ----
    n_features = X.shape[2]
    model = Sequential([
        LSTM(64, input_shape=(SEQ_LEN, n_features), return_sequences=False),
        Dropout(0.2),
        Dense(32, activation="relu"),
        Dense(1, activation="linear"),
    ])

    model.compile(optimizer="adam", loss="mse", metrics=["mae"])

    callbacks = [
        EarlyStopping(monitor="val_loss", patience=3, restore_best_weights=True),
        ReduceLROnPlateau(monitor="val_loss", factor=0.5, patience=2, min_lr=1e-5, verbose=1),
    ]

    print("Starting LSTM training...")
    history = model.fit(
        X_train, y_train,
        validation_data=(X_val, y_val),
        epochs=EPOCHS,
        batch_size=BATCH,
        callbacks=callbacks,
        verbose=2,
    )

    # ---- Evaluate in standardized space then convert MAE to volts ----
    y_val_pred = model.predict(X_val, batch_size=BATCH).flatten()

    mae_std = mean_absolute_error(y_val, y_val_pred)
    # recover std of original voltage
    voltage_index = feature_cols.index("voltage")
    voltage_std = scaler.scale_[voltage_index]
    mae_volts = mae_std * voltage_std

    print(f"\nValidation MAE (standardized units): {mae_std:.4f}")
    print(f"Approx Validation MAE in volts: {mae_volts:.4f} V")

    # ---- Save model + scaler ----
    model_path = os.path.join(OUT_DIR, "shortterm_lstm_voltage.h5")
    scaler_path = os.path.join(OUT_DIR, "shortterm_lstm_scaler.joblib")

    model.save(model_path)
    joblib.dump(scaler, scaler_path)

    print("\nSaved LSTM model to:", model_path)
    print("Saved scaler to:", scaler_path)

    # Print last few epochs
    print("\nLast 5 epochs (loss / val_loss):")
    losses = history.history["loss"]
    vlosses = history.history["val_loss"]
    for i in range(max(0, len(losses)-5), len(losses)):
        print(f"Epoch {i+1}: loss={losses[i]:.4f}, val_loss={vlosses[i]:.4f}")

if __name__ == "__main__":
    main()
