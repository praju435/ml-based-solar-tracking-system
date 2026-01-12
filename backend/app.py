from flask import Flask, jsonify, request
from flask_cors import CORS
from datetime import datetime, timedelta
from collections import deque
import threading
import os
import requests
import pandas as pd

# ================= ML IMPORTS =================
from analysis.short_term_predict_and_angle import run_short_term_prediction
from analysis.daily_forecast_recursive import run_daily_forecast

# ================= FIREBASE =================
try:
    import firebase_admin
    from firebase_admin import credentials, db
    FIREBASE_AVAILABLE = True
except:
    FIREBASE_AVAILABLE = False

# ================= CONFIG =================
ARDUINO_HTTP_URL = "http://192.168.4.1/command"

SEQ_LEN = 24
MAX_LOG = 3000

FIREBASE_DB_URL = "https://solar-tracker-44963-default-rtdb.firebaseio.com"
FIREBASE_SA_PATH = "serviceAccountKey.json"

RAW_BASE = "telemetry/raw"
LATEST_BASE = "telemetry/latest"
PREDICTIONS_BASE = "telemetry/predictions"

# ================= APP =================
app = Flask(__name__)
CORS(app)

# ================= MEMORY =================
device_seq = {}
data_log = []

def append_log(rec):
    data_log.append(rec)
    if len(data_log) > MAX_LOG:
        data_log.pop(0)

def push_seq(device_id, rec):
    if device_id not in device_seq:
        device_seq[device_id] = deque(maxlen=SEQ_LEN)
    device_seq[device_id].append(rec)

# ================= FIREBASE INIT =================
use_firebase = False
if FIREBASE_AVAILABLE and os.path.exists(FIREBASE_SA_PATH):
    try:
        cred = credentials.Certificate(FIREBASE_SA_PATH)
        firebase_admin.initialize_app(cred, {"databaseURL": FIREBASE_DB_URL})
        use_firebase = True
        print("✅ Firebase connected")
    except Exception as e:
        print("❌ Firebase init failed:", e)
def get_latest_sequence_from_firebase(device_id, limit=24):
    if not use_firebase:
        print("❌ Firebase not available for ML input")
        return []

    try:
        ref = db.reference(f"{RAW_BASE}/{device_id}")
        data = ref.order_by_key().limit_to_last(limit).get()

        if not data:
            print("⚠️ No telemetry data found in Firebase")
            return []

        records = sorted(
            data.values(),
            key=lambda x: x.get("ts", "")
        )

        cleaned = []
        for rec in records:
            cleaned.append({
                "ts": rec.get("ts"),
                "device_id": device_id,
                "voltage": float(rec.get("voltage", 0)),
                "ldr": float(rec.get("ldr", 0)),
                "temp": float(rec.get("temp", rec.get("temperature", 0))),
                "humidity": float(rec.get("humidity", 0)),
                "panel_angle": float(rec.get("panel_angle", 0)),
                "current": float(rec.get("current", 0))
            })

        return cleaned

    except Exception as e:
        print("❌ Firebase ML read failed:", e)
        return []

# ================= ESP32 =================
def send_angle_to_esp32(angle, confidence=0.85):
    try:
        requests.post(
            ARDUINO_HTTP_URL,
            json={
                "recommended_angle": float(angle),
                "confidence": float(confidence)
            },
            timeout=3
        )
        print("📡 Sent ML angle to ESP32:", angle, "conf:", confidence)
    except Exception as e:
        print("❌ ESP32 send failed:", e)


# ================= ML PIPELINE =================
def run_ml_pipeline(device_id):
    try:
        print("🧠 ML PIPELINE STARTED for", device_id)

        # 🔥 READ LATEST DATA FROM FIREBASE
        seq = get_latest_sequence_from_firebase(device_id, limit=24)
        print("📊 Firebase sequence length:", len(seq))

        if len(seq) < 5:
            print("⛔ Not enough Firebase data for ML")
            return

        seq_df = pd.DataFrame(seq)
        print("📄 seq_df columns:", seq_df.columns.tolist())

        # ---- SHORT TERM ----
        short_term = run_short_term_prediction(seq_df)
        print("🔮 Short-term:", short_term)

        # ---- SEND ML COMMAND TO ESP32 ----
        send_angle_to_esp32(
            short_term["recommended_angle"],
            confidence=0.85
        )

        # ---- DAILY FORECAST ----
        raw_daily = run_daily_forecast(seq_df, horizon=7)

        daily_forecast = []
        for i, item in enumerate(raw_daily):
            if isinstance(item, dict):
                voltage = item.get("voltage") or item.get("predicted_voltage")
                date = item.get("date")
            else:
                voltage = item
                date = None

            if not date:
                date = (datetime.utcnow() + timedelta(days=i + 1)).strftime("%Y-%m-%d")

            daily_forecast.append({
                "date": date,
                "voltage": float(voltage)
            })

        prediction = {
            "ts": datetime.utcnow().isoformat(),
            "device_id": device_id,
            "model": "lstm_daily_v1",
            "short_term": {
                "predicted_voltage": float(short_term["predicted_voltage"]),
                "recommended_angle": float(short_term["recommended_angle"]),
                "pred_voltage_at_recommended_angle": float(
                    short_term["pred_voltage_at_recommended_angle"]
                )
            },
            "daily_forecast": daily_forecast
        }

        if use_firebase:
            db.reference(f"{PREDICTIONS_BASE}/{device_id}/latest").set(prediction)
            db.reference(f"{LATEST_BASE}/{device_id}/prediction").set(prediction)

        print("🔥 Prediction stored & angle sent")

    except Exception as e:
        print("❌ ML PIPELINE ERROR:", e)



# ================= TELEMETRY =================
@app.route("/telemetry", methods=["POST"])
def telemetry():
    payload = request.get_json(force=True)
    device_id = payload.get("device_id", "panel-01")

    rec = {
        "ts": datetime.utcnow().isoformat(),
        "device_id": device_id,
        "voltage": float(payload["voltage"]),
        "ldr": float(payload["ldr"]),
        "temp": float(payload.get("temp", payload.get("temperature"))),
        "humidity": float(payload["humidity"]),
        "panel_angle": float(payload["panel_angle"]),
        "current": float(payload.get("current", payload.get("cur", 0.0)))
    }

    append_log({**rec, "type": "telemetry"})
    push_seq(device_id, rec)

    if use_firebase:
        db.reference(f"{RAW_BASE}/{device_id}").push(rec)
        db.reference(f"{LATEST_BASE}/{device_id}").set(rec)

    threading.Thread(
        target=lambda: run_ml_pipeline(device_id),
        daemon=True
    ).start()

    return jsonify({"status": "ok"})

# ================= FORECAST API =================
@app.route("/forecast", methods=["GET"])
def forecast():
    device_id = request.args.get("device", "panel-01")
    days = int(request.args.get("h", 7))

    if use_firebase:
        pred = db.reference(
            f"{PREDICTIONS_BASE}/{device_id}/latest"
        ).get()

        if pred and "daily_forecast" in pred:
            return jsonify(pred["daily_forecast"][:days])

    return jsonify([])

# ================= DASHBOARD DATA =================
@app.route("/data", methods=["GET"])
def data():
    device_id = request.args.get("device", "panel-01")

    telemetry = {}
    prediction = {}

    if use_firebase:
        telemetry = db.reference(f"{LATEST_BASE}/{device_id}").get() or {}
        prediction = db.reference(
            f"{PREDICTIONS_BASE}/{device_id}/latest"
        ).get() or {}

    daily = prediction.get("daily_forecast", [])

    return jsonify({
        "status": "ok",
        "telemetry": telemetry,
        "today_voltage_prediction": prediction.get("short_term", {}).get("predicted_voltage"),
        "tomorrow_voltage_prediction": daily[0] if len(daily) > 0 else None,
        "next_7_days_prediction": daily[:7],
        "prediction_raw": prediction
    })

# ================= HEALTH =================
@app.route("/health")
def health():
    return jsonify({
        "status": "ok",
        "firebase": use_firebase,
        "devices": list(device_seq.keys())
    })

# ================= RUN =================
if __name__ == "__main__":
    print("🚀 ML server running on http://0.0.0.0:5000")
    app.run(host="0.0.0.0", port=5000, debug=True)
