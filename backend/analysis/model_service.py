from flask import Flask, request, jsonify
import pandas as pd

from short_term_predict_and_angle import run_short_term_prediction

from daily_forecast_recursive import run_daily_forecast

app = Flask(__name__)

@app.route("/predict", methods=["POST"])
def predict():
    """
    Input JSON:
    {
      "sequence": [... last telemetry rows ...],
      "horizon": 1 | 3 | 7
    }
    """
    data = request.get_json()

    seq_df = pd.DataFrame(data["sequence"])
    horizon = int(data.get("horizon", 7))

    # ---- SHORT TERM ----
    short_term = run_short_term_prediction(seq_df)

    # ---- DAILY ----
    daily = run_daily_forecast(seq_df, horizon)

    return jsonify({
        "short_term": short_term,
        "daily_forecast": daily
    })

if __name__ == "__main__":
    print("🔥 ML service running on port 7000")
    app.run(host="127.0.0.1", port=7000, debug=True)
