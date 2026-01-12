// src/AnalyticsPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Line, Scatter } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
  BarElement,
} from "chart.js";

import { database, ref, onValue } from "./firebaseConfig"; // adjust if different

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler, BarElement);

// ---------- Helpers ----------
const formatTimestamp = (ts) => {
  try {
    return new Date(ts).toLocaleTimeString();
  } catch {
    return String(ts);
  }
};
function smooth(prev, incoming, alpha = 0.2) {
  if (prev == null) return incoming;
  return prev * (1 - alpha) + incoming * alpha;
}
function toCSV(data) {
  const header = ["timestamp", "voltage", "temperature", "humidity", "panel_angle"];
  const rows = data.map((d) => [d.ts, d.voltage, d.temperature, d.humidity, d.panel_angle].join(","));
  return [header.join(","), ...rows].join("\n");
}
function pctChange(oldV, newV) {
  if (oldV === 0 || oldV == null || newV == null) return 0;
  return ((newV - oldV) / Math.abs(oldV)) * 100;
}
function simpleCorrelation(a, b) {
  if (!a.length || a.length !== b.length) return 0;
  const n = a.length;
  const meanA = a.reduce((s, x) => s + x, 0) / n;
  const meanB = b.reduce((s, x) => s + x, 0) / n;
  let num = 0,
    denA = 0,
    denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const denom = Math.sqrt(denA * denB) || 1;
  return num / denom;
}

// compute actionable recommendations based on history & smoothed current values & predictions
function computeRecommendations(history, display, predictions = []) {
  const recs = [];
  if (!history || history.length === 0 || !display) return recs;

  const N = Math.min(40, history.length);
  const window = history.slice(-N);

  const voltSeries = window.map((p) => p.voltage);
  const humSeries = window.map((p) => p.humidity);
  const tempSeries = window.map((p) => p.temperature);
  const angleSeries = window.map((p) => p.panel_angle);

  const avgVolt = voltSeries.reduce((s, v) => s + v, 0) / voltSeries.length;
  const avgTemp = tempSeries.reduce((s, v) => s + v, 0) / tempSeries.length;

  // 1) Low voltage
  if (display.voltage != null && display.voltage < 12) {
    recs.push({ level: "warning", text: "Low voltage detected — inspect connections, shading, or battery." });
  } else if (avgVolt < 13) {
    recs.push({ level: "info", text: "Voltage is lower than usual in this window." });
  }

  // 2) Temp
  if (display.temperature != null && display.temperature > 45) {
    recs.push({ level: "danger", text: "High temperature — expect thermal losses. Consider ventilation/inspection." });
  } else if (avgTemp > 40) {
    recs.push({ level: "warning", text: "Elevated temperature observed — monitor for drops in output." });
  }

  // 3) Humidity correlation
  const corr = simpleCorrelation(humSeries, voltSeries);
  if (corr < -0.35) {
    recs.push({ level: "warning", text: "Voltage drops appear correlated with rising humidity — check for condensation/shading or cleaning." });
  }

  // 4) Sudden drop
  const half = Math.floor(voltSeries.length / 2) || 1;
  const earlyVolt = voltSeries.slice(0, half);
  const laterVolt = voltSeries.slice(half);
  const earlyAvg = earlyVolt.reduce((s, v) => s + v, 0) / earlyVolt.length;
  const laterAvg = laterVolt.length ? laterVolt.reduce((s, v) => s + v, 0) / laterVolt.length : earlyAvg;
  const changePct = pctChange(earlyAvg, laterAvg);
  if (changePct < -8) {
    recs.push({ level: "danger", text: `Voltage dropped ${Math.abs(changePct).toFixed(1)}% in the recent window — investigate shading, wiring or inverter.` });
  } else if (changePct < -4) {
    recs.push({ level: "warning", text: `Voltage decreased ${Math.abs(changePct).toFixed(1)}% — monitor for persistent decline.` });
  }

  // 5) Angle variance
  const angleMean = angleSeries.reduce((s, v) => s + v, 0) / angleSeries.length;
  const angleVar = angleSeries.reduce((s, v) => s + Math.pow(v - angleMean, 2), 0) / angleSeries.length;
  if (angleVar > 12) {
    recs.push({ level: "info", text: "Panel angle is fluctuating — check tracking motor or encoder stability." });
  }

  // 6) Predictions-driven recommendations
  if (predictions && predictions.length) {
    const preds = predictions.slice().sort((a, b) => new Date(a.target_ts) - new Date(b.target_ts));
    const nextPred = preds.find((p) => new Date(p.target_ts) > Date.now());
    if (nextPred && display.voltage != null && nextPred.predicted_voltage != null) {
      const expectedDrop = ((display.voltage - nextPred.predicted_voltage) / display.voltage) * 100;
      if (expectedDrop > 8) {
        recs.push({
          level: "warning",
          text: `Model predicts ~${expectedDrop.toFixed(1)}% drop by ${new Date(nextPred.target_ts).toLocaleTimeString()} (${nextPred.horizon || "upcoming"}). Consider preemptive checks.`,
        });
      }
    }
  }

  if (recs.length === 0) recs.push({ level: "info", text: "System operating within expected ranges. No immediate action required." });

  const priority = { danger: 3, warning: 2, info: 1 };
  return recs
    .filter((r, i, arr) => arr.findIndex((x) => x.text === r.text) === i)
    .sort((a, b) => (priority[b.level] || 0) - (priority[a.level] || 0));
}

// ---------- Component ----------
export default function AnalyticsPage({ deviceId = "panel-01", maxPoints = 300 }) {
  const [history, setHistory] = useState([]);
  const [latest, setLatest] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const displayRef = useRef({ voltage: null, temperature: null, humidity: null, panel_angle: null });
  const [, tick] = useState(0);
  const [rangeMinutes, setRangeMinutes] = useState(60);
  const [showPredictions, setShowPredictions] = useState(true);
  const rangeCutoffRef = useRef(Date.now());

  

  // Firebase subscriptions
  useEffect(() => {
    if (!database || !ref || !onValue) return;

    const rawRefPath = `telemetry/raw/${deviceId}`;
    const latestRefPath = `telemetry/latest/${deviceId}`;
    const predRefPath = `telemetry/predictions/${deviceId}`;

    const rawRef = ref(database, rawRefPath);
    const latestRef = ref(database, latestRefPath);
    const predRef = ref(database, predRefPath);

    const unsubLatest = onValue(latestRef, (snap) => {
      const val = snap.val();
      if (!val) return;
      const item = { ts: val.ts || new Date().toISOString(), ...val };
      setLatest(item);
      setHistory((h) => {
        const next = [...h, item];
        if (next.length > maxPoints) next.splice(0, next.length - maxPoints);
        return next;
      });
    });

    const unsubRaw = onValue(rawRef, (snap) => {
      const val = snap.val();
      if (!val) return;
      let arr = [];
      if (Array.isArray(val)) arr = val.filter(Boolean);
      else arr = Object.values(val);
      arr = arr
        .map((r) => ({ ...r, ts: normalizeTs(r.ts || r.timestamp) }))
        .sort((a, b) => new Date(a.ts) - new Date(b.ts));
      if (arr.length > maxPoints) arr = arr.slice(arr.length - maxPoints);
      setHistory((prev) => {
  const map = new Map(prev.map(p => [p.ts, p]));
  arr.forEach(p => map.set(p.ts, p));
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.ts) - new Date(b.ts)
  );
});
if (arr.length) setLatest(arr[arr.length - 1]);
 });

    const unsubPred = onValue(predRef, (snap) => {
      const val = snap.val() || {};
      let arr = Object.values(val).map((p) => ({
        ...p,
        ts: p.ts || new Date().toISOString(),
        target_ts: p.target_ts || p.ts,
        predicted_voltage: p.predicted_voltage ?? p.predictedVoltage ?? p.predicted ?? null,
        predicted_angle: p.predicted_angle ?? p.predictedAngle ?? null,
        horizon: p.horizon || null,
        model_version: p.model_version || p.modelVersion || null,
        confidence: p.confidence ?? null,
      }));
      arr = arr.sort((a, b) => new Date(a.target_ts) - new Date(b.target_ts));
      setPredictions(arr);
    });

    return () => {
      try { unsubLatest && typeof unsubLatest === "function" && unsubLatest(); } catch {}
      try { unsubRaw && typeof unsubRaw === "function" && unsubRaw(); } catch {}
      try { unsubPred && typeof unsubPred === "function" && unsubPred(); } catch {}
    };
  }, [deviceId, maxPoints]);

  // Smooth display values
  // Raw (no smoothing) display values – REAL ESP32 DATA
useEffect(() => {
  if (!latest) return;
  displayRef.current = {
    voltage: latest.voltage,
    temperature: latest.temperature,
    humidity: latest.humidity,
    panel_angle: latest.panel_angle,
  };
  tick(t => t + 1);
}, [latest]);


  // summary
  const summary = useMemo(() => {
    if (!history.length) return null;
    const lastN = history.slice(-Math.min(history.length, 60));
    const avg = (arr, key) => arr.reduce((s, x) => s + x[key], 0) / arr.length;
    const max = (arr, key) => Math.max(...arr.map((x) => x[key]));
    const min = (arr, key) => Math.min(...arr.map((x) => x[key]));
    return {
      voltage: { avg: +avg(lastN, "voltage").toFixed(2), max: +max(lastN, "voltage").toFixed(2), min: +min(lastN, "voltage").toFixed(2) },
      temperature: { avg: +avg(lastN, "temperature").toFixed(2), max: +max(lastN, "temperature").toFixed(2), min: +min(lastN, "temperature").toFixed(2) },
      humidity: { avg: +avg(lastN, "humidity").toFixed(2), max: +max(lastN, "humidity").toFixed(2), min: +min(lastN, "humidity").toFixed(2) },
      panel_angle: { avg: +avg(lastN, "panel_angle").toFixed(2), max: +max(lastN, "panel_angle").toFixed(2), min: +min(lastN, "panel_angle").toFixed(2) },
      points: lastN.length,
    };
  }, [history]);
  const filteredHistory = useMemo(() => {
  return history.filter(
    h => new Date(h.ts).getTime() >= rangeCutoffRef.current
  );
}, [history, rangeMinutes]);



  // recommendations
  const recommendations = useMemo(() => computeRecommendations(history, displayRef.current, predictions), [history, latest, predictions]);

  // labels for telemetry (category)
  const labels = useMemo(() => history.map((h) => formatTimestamp(h.ts)), [history]);

  // predicted series aligned to telemetry labels
  const predictedSeries = useMemo(() => {
    if (!predictions || predictions.length === 0) return labels.map(() => null);
    const map = {};
    predictions.forEach((p) => {
      const key = formatTimestamp(p.target_ts || p.ts);
      map[key] = p.predicted_voltage;
    });
    return labels.map((lbl) => (Object.prototype.hasOwnProperty.call(map, lbl) ? map[lbl] : null));
  }, [predictions, labels]);

  // voltage data (with predicted dashed dataset)
  const voltageData = useMemo(() => {
    const datasets = [
      {
        label: "Voltage (V)",
        data: filteredHistory.map((h) => h.voltage),
        tension: 0.25,
        fill: true,
        pointRadius: 0,
        borderColor: "#6cc3ff",
        backgroundColor: "rgba(108,195,255,0.12)",
      },
    ];
    if (showPredictions) {
      datasets.push({
        label: "Predicted (dashed)",
        data: predictedSeries,
        borderDash: [6, 4],
        borderColor: "#ff7b7b",
        backgroundColor: "rgba(255,123,123,0.06)",
        pointRadius: 2,
      });
    }
    return { labels, datasets };
  }, [history, labels, predictedSeries, showPredictions]);

  const angleData = useMemo(() => ({
    labels,
    datasets: [
      {
        label: "Panel Angle (°)",
        data: filteredHistory.map((h) => h.panel_angle),
        tension: 0.25,
        pointRadius: 0,
        borderColor: "#ffd166",
        backgroundColor: "rgba(255,209,102,0.10)",
      },
    ],
  }), [history, labels]);

  const scatterAngleTemp = useMemo(() => ({
    datasets: [
      {
        label: "Angle vs Temperature",
        data: filteredHistory.map((h) => ({ x: h.panel_angle, y: h.temperature })),
        pointRadius: 4,
      },
      {
        label: "Angle vs Humidity",
        data: filteredHistory.map((h) => ({ x: h.panel_angle, y: h.humidity })),
        pointRadius: 4,
      },
    ],
  }), [history]);

  const chartOptions = {
    scales: {
      x: { type: "category", ticks: { maxRotation: 0 } },
      y: { beginAtZero: false },
    },
    plugins: {
      legend: { display: true },
      tooltip: {
        callbacks: {
          title: (items) => (items && items[0] ? items[0].label : ""),
        },
      },
    },
    animation: { duration: 400 },
    maintainAspectRatio: false,
  };

  // --- NEW: Residuals chart data (predicted - actual) ---
  // For each prediction, find an actual telemetry point that matches the prediction target timestamp label.
  const residualsData = useMemo(() => {
    if (!predictions || !predictions.length) return { labels: [], datasets: [] };
    const predLabels = predictions.map((p) => formatTimestamp(p.target_ts || p.ts));
    // Map actuals by formatted ts
    const actualMap = {};
    history.forEach((h) => {
      actualMap[formatTimestamp(h.ts)] = h.voltage;
    });
    const residuals = predictions.map((p) => {
      const lbl = formatTimestamp(p.target_ts || p.ts);
      const actual = actualMap[lbl];
      if (actual == null || p.predicted_voltage == null) return null;
      return +(p.predicted_voltage - actual).toFixed(2); // predicted - actual
    });
    return {
      labels: predLabels,
      datasets: [
        {
          label: "Residual (Predicted − Actual) V",
          data: residuals,
          borderColor: "#9b5cff",
          backgroundColor: "rgba(155,92,255,0.08)",
          tension: 0.2,
          pointRadius: 4,
        },
      ],
    };
  }, [predictions, history]);

  const residualsOptions = {
    scales: {
      x: { type: "category", ticks: { maxRotation: 45 } },
      y: { beginAtZero: false },
    },
    plugins: { legend: { display: true } },
    maintainAspectRatio: false,
  };

  // --- NEW: Prediction scatter (shows predictions even if labels mismatch) ---
  // x = index of prediction; we render a numeric x axis but map ticks to friendly timestamps
  const predIndexLabels = useMemo(() => predictions.map((p) => formatTimestamp(p.target_ts || p.ts)), [predictions]);

  const predictionScatterData = useMemo(() => {
    return {
      datasets: [
        {
          label: "Predicted Voltage Points",
          data: predictions.map((p, i) => ({ x: i, y: p.predicted_voltage, meta: p })),
          pointRadius: 5,
          backgroundColor: "#ff7b7b",
        },
        {
          label: "Actual at same time (if available)",
          data: predictions.map((p, i) => {
            // find actual with same formatted label
            const lbl = formatTimestamp(p.target_ts || p.ts);
            const found = history.find((h) => formatTimestamp(h.ts) === lbl);
            return found ? { x: i, y: found.voltage } : { x: i, y: null };
          }),
          pointRadius: 4,
          backgroundColor: "#6cc3ff",
        },
      ],
    };
  }, [predictions, history]);

  const predictionScatterOptions = {
    scales: {
      x: {
        type: "linear",
        ticks: {
          callback: function (val) {
            // 'val' may be fractional, we map to nearest integer idx
            const idx = Math.round(val);
            return predIndexLabels[idx] ?? "";
          },
          maxRotation: 45,
        },
        title: { display: true, text: "Prediction target time (index)" },
      },
      y: { title: { display: true, text: "Voltage (V)" } },
    },
    plugins: {
      tooltip: {
        callbacks: {
          title: (items) => {
            if (!items || !items.length) return "";
            const idx = Math.round(items[0].parsed.x);
            return predIndexLabels[idx] ?? "";
          },
          label: (item) => {
            const p = item.raw;
            return `Voltage: ${p.y}`;
          },
        },
      },
      legend: { display: true },
    },
    maintainAspectRatio: false,
  };

  const downloadCSV = () => {
    const csv = toCSV(history);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `telemetry_${deviceId}_${new Date().toISOString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const d = displayRef.current;

  return (
    <div style={{ padding: 16, maxWidth: 1200, margin: "0 auto" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800 }}>Monitor — {deviceId}</h1>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <label style={{ fontSize: 13, color: "#065069" }}>
            <input type="checkbox" checked={showPredictions} onChange={(e) => setShowPredictions(e.target.checked)} style={{ marginRight: 8 }} />
            Show predictions
          </label>
          <select value={rangeMinutes} onChange={(e) => setRangeMinutes(Number(e.target.value))} style={{ padding: 8, borderRadius: 6 }}>
            <option value={15}>Last 15m</option>
            <option value={60}>Last 60m</option>
            <option value={360}>Last 6h</option>
            <option value={1440}>Last 24h</option>
          </select>
          <button onClick={downloadCSV} style={{ padding: "8px 12px", borderRadius: 8, background: "#38bdf8", color: "#042024", fontWeight: 700 }}>Export CSV</button>
        </div>
      </div>

      {/* KPI tiles */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 16 }}>
        <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.18)" }}>
          <div style={{ color: "#6b90a6", fontWeight: 700, fontSize: 12 }}>Voltage</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{d.voltage == null ? "—" : d.voltage.toFixed(2)} V</div>
          <div style={{ fontSize: 12, color: "#94a7b4" }}>{latest ? formatTimestamp(latest.ts) : "—"}</div>
        </div>
        <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.18)" }}>
          <div style={{ color: "#6b90a6", fontWeight: 700, fontSize: 12 }}>Temperature</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{d.temperature == null ? "—" : d.temperature.toFixed(1)} °C</div>
          <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg: {summary ? summary.temperature.avg : "—"} °C</div>
        </div>
        <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.18)" }}>
          <div style={{ color: "#6b90a6", fontWeight: 700, fontSize: 12 }}>Humidity</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{d.humidity == null ? "—" : d.humidity.toFixed(1)} %</div>
          <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg: {summary ? summary.humidity.avg : "—"} %</div>
        </div>
        <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.18)" }}>
          <div style={{ color: "#6b90a6", fontWeight: 700, fontSize: 12 }}>Panel Angle</div>
          <div style={{ fontSize: 20, fontWeight: 800 }}>{d.panel_angle == null ? "—" : d.panel_angle.toFixed(1)} °</div>
          <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg: {summary ? summary.panel_angle.avg : "—"} °</div>
        </div>
      </div>

      {/* Main grid */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)", height: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Voltage vs Time</div>
            <div style={{ height: "calc(100% - 32px)" }}>
              <Line data={voltageData} options={chartOptions} />
            </div>
          </div>

          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)", height: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Panel Angle vs Time</div>
            <div style={{ height: "calc(100% - 32px)" }}>
              <Line data={angleData} options={chartOptions} />
            </div>
          </div>

          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)", height: 320 }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>Panel Angle vs Temperature / Humidity (Scatter)</div>
            <div style={{ height: "calc(100% - 32px)" }}>
              <Scatter data={scatterAngleTemp} options={{
                scales: {
                  x: { title: { display: true, text: "Panel Angle (°)" } },
                  y: { title: { display: true, text: "Value" } },
                },
                maintainAspectRatio: false,
              }} />
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)" }}>
            <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 8 }}>Report</div>
            <div style={{ fontSize: 12, color: "#6b90a6", marginBottom: 8 }}>Snapshot</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div style={{ padding: 8, border: "1px solid rgba(108,195,255,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6b90a6" }}>Voltage</div>
                <div style={{ fontWeight: 700 }}>{d.voltage == null ? "—" : d.voltage.toFixed(2)} V</div>
                <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg {summary ? summary.voltage.avg : "—"} V</div>
              </div>

              <div style={{ padding: 8, border: "1px solid rgba(108,195,255,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6b90a6" }}>Temperature</div>
                <div style={{ fontWeight: 700 }}>{d.temperature == null ? "—" : d.temperature.toFixed(1)} °C</div>
                <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg {summary ? summary.temperature.avg : "—"} °C</div>
              </div>

              <div style={{ padding: 8, border: "1px solid rgba(108,195,255,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6b90a6" }}>Humidity</div>
                <div style={{ fontWeight: 700 }}>{d.humidity == null ? "—" : d.humidity.toFixed(1)} %</div>
                <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg {summary ? summary.humidity.avg : "—"} %</div>
              </div>

              <div style={{ padding: 8, border: "1px solid rgba(108,195,255,0.06)", borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: "#6b90a6" }}>Panel Angle</div>
                <div style={{ fontWeight: 700 }}>{d.panel_angle == null ? "—" : d.panel_angle.toFixed(1)} °</div>
                <div style={{ fontSize: 12, color: "#94a7b4" }}>Avg {summary ? summary.panel_angle.avg : "—"} °</div>
              </div>
            </div>

            <div style={{ fontSize: 12, color: "#6b90a6", marginBottom: 6 }}>Production Summary (last window)</div>
            <div style={{ fontSize: 12, color: "#94a7b4", marginBottom: 6 }}>Points considered: {summary ? summary.points : 0}</div>
            <div style={{ fontSize: 13, color: "#05202a" }}>
              <div>Voltage: Avg <strong>{summary ? summary.voltage.avg : "—"} V</strong>, Min <strong>{summary ? summary.voltage.min : "—"} V</strong>, Max <strong>{summary ? summary.voltage.max : "—"} V</strong></div>
              <div>Temperature: Avg <strong>{summary ? summary.temperature.avg : "—"} °C</strong></div>
              <div>Humidity: Avg <strong>{summary ? summary.humidity.avg : "—"} %</strong></div>
            </div>

            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700 }}>Health & Alerts</div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                {(() => {
                  const alerts = [];
                  if (d.voltage != null && d.voltage < 12) alerts.push({ level: "warning", text: "Low voltage production" });
                  if (d.temperature != null && d.temperature > 45) alerts.push({ level: "danger", text: "High temperature — thermal losses possible" });
                  if (d.humidity != null && d.humidity > 85) alerts.push({ level: "info", text: "Very high humidity" });
                  if (alerts.length === 0) return <div style={{ fontSize: 12, color: "#94a7b4" }}>No alerts</div>;
                  return alerts.map((a, i) => (
                    <div key={i} style={{ padding: 8, borderRadius: 8, background: a.level === "danger" ? "#ffe6e6" : a.level === "warning" ? "#fff7e6" : "#eef8ff", color: a.level === "danger" ? "#8b0000" : a.level === "warning" ? "#8a6a00" : "#0366b3" }}>
                      {a.text}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Recommendations</div>
            <div style={{ fontSize: 12, color: "#6b90a6", marginTop: 8 }}>Based on recent telemetry{predictions.length ? " and model predictions" : ""}:</div>
            <div style={{ marginTop: 8 }}>
              {recommendations.map((r, i) => (
                <div key={i} style={{ marginBottom: 8, padding: 8, borderRadius: 8, background: r.level === "danger" ? "#ffe6e6" : r.level === "warning" ? "#fff7e6" : "#eef8ff" }}>
                  {r.text}
                </div>
              ))}
            </div>
          </div>

          {/* Residuals chart */}
          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)", minHeight: 220 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Residuals (Predicted − Actual)</div>
            <div style={{ fontSize: 12, color: "#6b90a6", marginTop: 8 }}>Shows prediction error for prediction target times where actual exists.</div>
            <div style={{ height: 160, marginTop: 8 }}>
              <Line data={residualsData} options={residualsOptions} />
            </div>
          </div>

          {/* Prediction scatter chart */}
          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)", minHeight: 260 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Prediction Points (scatter)</div>
            <div style={{ fontSize: 12, color: "#6b90a6", marginTop: 8 }}>Shows predictions even when their timestamps don't match telemetry labels. X-axis is prediction order; hover to see target time.</div>
            <div style={{ height: 200, marginTop: 8 }}>
              <Scatter data={predictionScatterData} options={predictionScatterOptions} />
            </div>
          </div>

          <div style={{ padding: 12, background: "#fff", borderRadius: 12, border: "1px solid rgba(108,195,255,0.10)" }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Data Export</div>
            <div style={{ fontSize: 12, color: "#6b90a6", marginTop: 8 }}>Export telemetry window as CSV.</div>
            <div style={{ marginTop: 8 }}>
              <button onClick={downloadCSV} style={{ padding: "8px 12px", borderRadius: 8, background: "#38bdf8", color: "#042024", fontWeight: 700 }}>Download CSV</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 