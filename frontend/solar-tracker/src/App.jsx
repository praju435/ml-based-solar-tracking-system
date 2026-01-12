// src/App.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  Link,
  useNavigate,
} from "react-router-dom";

import { AuthProvider, useAuth, sha256Hex } from "./auth"; // <- sha256Hex must be exported by auth.js
import { Line } from "react-chartjs-2";

import {
  Chart as ChartJS,
  LineElement,
  CategoryScale,
  LinearScale,
  PointElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";

import { database, ref, onValue } from "./firebaseConfig";

import AnalyticsPage from "./AnalyticsPage"; // <-- Monitor / Analytics page

ChartJS.register(LineElement, CategoryScale, LinearScale, PointElement, Title, Tooltip, Legend, Filler);

/* ---------------- Global Styles ---------------- */
function GlobalStyles() {
  return (
    <style>{`
      :root{
        --bg:#f7fbff;
        --muted:#3d6b7b;
        --yellow1:#ffd166;
        --yellow2:#ffb703;
        --sky1:#6cc3ff;
        --sky2:#38bdf8;
      }

      *{box-sizing:border-box}
      body,html,#root{height:100%;margin:0;font-family:Inter, system-ui, -apple-system, 'Segoe UI', Roboto}
      .app-shell{min-height:100vh;background:linear-gradient(180deg,#ffffff 0%, #e8f8ff 40%, #dff6ff 100%);display:flex;flex-direction:column}

      /* Top nav */
      .topbar{height:72px;display:flex;align-items:center;padding:0 20px;gap:12px}
      .hambutton{background:transparent;border:none;font-size:22px;cursor:pointer;color:var(--sky2);padding:8px 10px;border-radius:8px}
      .nav-link{color:#065069;text-decoration:none;padding:8px 12px;border-radius:8px;font-weight:700}
      .nav-link:hover{background:rgba(6,80,105,0.06)}
      .spacer{flex:1}
      .logout-btn{background:linear-gradient(90deg,var(--sky1),var(--sky2));color:#042024;padding:8px 14px;border-radius:10px;border:none;cursor:pointer;font-weight:700}

      /* Drawer */
      .drawer { position:fixed; left:0; top:0; height:100vh; width:280px; background:#ffffff; box-shadow:4px 0 30px rgba(6,80,105,0.12); z-index:1200; padding:20px; }
      .drawer-close{background:transparent;border:none;font-size:20px;cursor:pointer;color:var(--sky2)}
      .drawer a{color:#065069;text-decoration:none;font-weight:700;padding:8px 6px;border-radius:8px;display:block}
      .drawer a:hover{background:rgba(6,80,105,0.04)}
      .overlay { position:fixed;left:0;top:0;width:100vw;height:100vh;background:rgba(0,0,0,0.18);z-index:1100; }

      /* Pages */
      .content{flex:1;display:flex;justify-content:center;padding:28px 40px}

      .dashboard { width:100%; max-width:1200px; background:white; padding:28px; border-radius:14px; box-shadow:0 12px 30px rgba(108,195,255,0.10); border:1px solid rgba(108,195,255,0.10); }
      .dash-title h1 { margin:0; font-size:28px; color:#05202a; }

      .kpi-row { display:flex; gap:12px; margin-top:20px; }
      .kpi { flex:1; background:white; border-radius:12px; padding:16px; border:1px solid rgba(108,195,255,0.18); text-align:center; }
      .kpi small { color:#6b90a6; display:block; margin-bottom:6px; font-weight:700; }
      .kpi h3 { margin:0; font-size:22px; color:#05202a; font-weight:800; }

      .chart-wrap { margin-top:20px; padding:18px; border-radius:12px; background:white; border:1px solid rgba(108,195,255,0.10); }

      .profile-card { width:100%; max-width:900px; background:white; padding:24px; border-radius:14px; box-shadow:0 12px 30px rgba(108,195,255,0.12); }

      .ml-small-row{display:flex;gap:12px;margin-top:12px}
      .small-box{padding:10px 16px;min-width:180px;border-radius:10px;background:linear-gradient(90deg, rgba(108,195,255,0.06), rgba(255,209,102,0.04));border:1px solid rgba(108,195,255,0.10);box-shadow:0 6px 18px rgba(11,38,60,0.03);}
      .download-csv{margin-top:14px;background:linear-gradient(90deg,var(--sky1),var(--sky2));color:#042024;border:none;padding:10px 16px;border-radius:10px;cursor:pointer;font-weight:700}

      /* Forecast selection */
      .horizon-select { display:flex; gap:8px; align-items:center; }
      .horizon-btn { padding:8px 12px; border-radius:10px; border:1px solid rgba(6,80,105,0.06); cursor:pointer; background:transparent; font-weight:700 }
      .horizon-btn.active { background: linear-gradient(90deg,var(--sky1),var(--sky2)); color:#042024 }

      /* forecast grid */
      .forecast-grid { display:grid; grid-template-columns: repeat(auto-fit,minmax(160px,1fr)); gap:10px; margin-top:12px }
      .forecast-card { background:linear-gradient(180deg, #fff, rgba(108,195,255,0.02)); padding:12px; border-radius:10px; border:1px solid rgba(108,195,255,0.06); display:flex; flex-direction:column; gap:6px; align-items:flex-start; transform: translateY(0); transition: transform 260ms ease, box-shadow 260ms ease; }
      .forecast-card:hover{ transform: translateY(-6px); box-shadow:0 18px 40px rgba(11,38,60,0.06) }
      .forecast-date { font-weight:800; color:#05202a }
      .forecast-voltage { font-weight:800; font-size:18px; color:var(--yellow2) }
      .forecast-meta { color:#6b90a6; font-size:13px }

      /* table styles */
      table { width:100%; border-collapse:collapse; margin-top:14px }
      th, td { padding:10px 12px; text-align:left; border-bottom:1px solid rgba(6,80,105,0.06) }
      th { background: linear-gradient(90deg, rgba(108,195,255,0.04), rgba(255,209,102,0.02)); font-weight:800; color:#05202a }

      /* small animation */
      .pulse { animation: pulse 1.6s ease-in-out infinite; }
      @keyframes pulse { 0% { transform: scale(1) } 50% { transform: scale(1.02) } 100% { transform: scale(1) } }

      /* Profile styles & small interactions */
      .profile-animate { animation: profileFade 360ms ease both; }
      @keyframes profileFade { from { transform: translateY(8px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }

      .avatar {
        width: 110px;
        height: 110px;
        border-radius: 999px;
        display:flex;
        align-items:center;
        justify-content:center;
        font-weight:800;
        font-size:36px;
        color:#05202a;
        background:linear-gradient(135deg,var(--yellow1),var(--yellow2));
        box-shadow:0 10px 30px rgba(11,38,60,0.06);
        transition: transform 220ms ease, box-shadow 220ms ease;
      }
      .avatar:hover { transform: scale(1.06); box-shadow:0 18px 40px rgba(11,38,60,0.12); }

      .btn-primary { background: linear-gradient(90deg,var(--yellow1),var(--yellow2)); padding: 10px 16px; border-radius:10px; border:none; color:#042024; font-weight:700; cursor:pointer; }
      .btn-outline { padding: 10px 16px; border-radius:10px; border:1px solid rgba(6,80,105,0.08); background:transparent; color:#065069; cursor:pointer; font-weight:700; }

      .input { width:100%; padding:12px 12px; border-radius:8px; border:1px solid rgba(6,80,105,0.06); background:white; color:#05202a; }

      @media(max-width:980px){
        .kpi-row{flex-direction:column}
        .ml-small-row{flex-direction:column}
        .dashboard{padding:18px}
      }
    `}</style>
  );
}

/* ---------------- TopNav + Drawer ---------------- */
function TopNavWrapper() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const displayName = auth.user?.name ?? auth.user?.username ?? "";

  return (
    <>
      <div className="topbar">
        <button className="hambutton" onClick={() => setMenuOpen(true)} aria-label="Open menu">☰</button>

        {/* Dashboard only in top nav; Monitor removed from topbar */}
        <Link className="nav-link" to="/dashboard">Dashboard</Link>

        <div className="spacer" />
        <div style={{ color: "#248badff", fontWeight: 700 }}>Hi, {displayName}</div>

        <button
          className="logout-btn"
          onClick={() => {
            auth.logout();
            navigate("/auth");
          }}
        >
          Logout
        </button>
      </div>

      {menuOpen && (
        <>
          <div className="overlay" onClick={() => setMenuOpen(false)} />
          <div className="drawer" role="dialog" aria-modal="true">
            <button className="drawer-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
            <h3 style={{ marginTop: 10 }}>Menu</h3>

            <Link to="/profile" onClick={() => setMenuOpen(false)}>👤 User Profile</Link>
            <Link to="/dashboard" onClick={() => setMenuOpen(false)}>Dashboard</Link>
            <Link to="/monitor" onClick={() => setMenuOpen(false)}> Performance Monitoring</Link>
            <Link to="/ml" onClick={() => setMenuOpen(false)}>Forecasting and Optimization</Link>
            
            <button
              onClick={() => {
                auth.logout();
                setMenuOpen(false);
                navigate("/auth");
              }}
              style={{ marginTop: 12, background: "linear-gradient(90deg,var(--sky1),var(--sky2))", color: "#042024", padding: "8px 12px", borderRadius: 8, border: "none", cursor: "pointer", fontWeight: 700 }}
            >
              🚪 Logout
            </button>
          </div>
        </>
      )}
    </>
  );
}


/* ---------------- Auth Page ---------------- */
function AuthPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  const [mode, setMode] = useState("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (auth.user) navigate("/dashboard");
  }, [auth.user, navigate]);

  async function handleAuth() {
    setErr("");
    setLoading(true);
    try {
      if (mode === "login") await auth.login(email, password);
      else await auth.signup(email, password, name);
    } catch (e) {
      setErr(e?.message ?? String(e));
    }
    setLoading(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 40 }}>
      <div style={{ width: "92%", maxWidth: 1100 }}>
        <div style={{ display: "flex", gap: 28 }}>
          <div style={{ flex: "0 0 46%" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 72, height: 72, borderRadius: 14, background: "linear-gradient(135deg,var(--yellow1),var(--yellow2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>☀️</div>
              <div>
                <h2 style={{ margin: 0 }}>Solar Tracker</h2>
                <div style={{ color: "#065069", marginTop: 6 }}>Real-time monitoring • Optimization</div>
              </div>
            </div>

            <p style={{ color: "rgba(0,0,0,0.6)", marginTop: 18 }}>Monitor voltage, current, power & ML predictions in real time.</p>
            <div style={{ marginTop: 18, height: 140, borderRadius: 10, background: "rgba(6,80,105,0.03)", display: "flex", alignItems: "center", justifyContent: "center" }}>Live panel preview</div>
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={{ margin: 0 }}>{mode === "login" ? "Welcome back" : "Create account"}</h1>
            <div style={{ color: "#065069", marginTop: 8 }}>Access your Solar Dashboard</div>

            <div style={{ marginTop: 18 }}>
              {mode === "signup" && <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />}
              <input className="input" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />
              <input className="input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%", marginBottom: 12 }} />

              {err && <div style={{ color: "salmon", marginBottom: 12 }}>{err}</div>}

              <div style={{ display: "flex", gap: 12 }}>
                <button className="btn-primary" onClick={handleAuth} disabled={loading}>
                  {loading ? "Processing..." : mode === "login" ? "Sign in" : "Create account"}
                </button>
                <button className="btn-outline" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); }}>
                  {mode === "login" ? "Switch to Register" : "Switch to Sign in"}
                </button>
              </div>

              <div style={{ marginTop: 12, color: "rgba(0,0,0,0.6)" }}>By continuing, you accept Terms & Privacy Policy.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Dashboard ---------------- */
function Dashboard() {
  const auth = useAuth();
  const displayName = auth.user?.name ?? auth.user?.username ?? "";
  const [data, setData] = useState(null);
  const [history, setHistory] = useState([]);

  useEffect(() => {
  const dRef = ref(database, "solarData");

  return onValue(dRef, (snap) => {
    const v = snap.val();
    if (!v) return;

    setData(v);

    // build graph history locally
    setHistory((prev) => [
      ...prev.slice(-20),
      { voltage: v.voltage }
    ]);
  });
}, []);




  if (!auth.user) return <Navigate to="/auth" replace />;

  const chartData = useMemo(() => ({
    labels: history.map((_, i) => i + 1),
    datasets: [{
      label: "Voltage (V)",
      data: history.map(h => (typeof h === "object" ? (h.voltage ?? null) : h)),
      borderColor: "#6cc3ff",
      backgroundColor: "rgba(108,195,255,0.12)",
      fill: true,
      tension: 0.3,
    }]
  }), [history]);

  return (
    <div className="content">
      <div className="dashboard">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ fontSize: 26, color: "var(--yellow2)" }}>☀️</div>
            <div>
              <h1 style={{ margin: 0, color: "#05202a" }}>Solar Tracker Dashboard</h1>
              <div style={{ color: "#0f7da2ff", marginTop: 6 }}>Welcome, {displayName}</div>
            </div>
          </div>
        </div>

        <div className="kpi-row">
          <div className="kpi"><small>Voltage</small><h3>{data ? `${data.voltage} V` : "—"}</h3></div>
          <div className="kpi"><small>Current</small><h3>{data ? `${data.current} A` : "—"}</h3></div>
          <div className="kpi"><small>Power</small><h3>{data ? `${data.power} W` : "—"}</h3></div>
        </div>

        <div className="chart-wrap"><Line data={chartData} /></div>
      </div>
    </div>
  );
}

/* ---------------- MLPrediction (enhanced) ---------------- */
/* ================= ML PREDICTION PAGE ================= */

 /* ================= ML FORECAST PAGE (JSX + CSS COMBINED) ================= */
function AnimatedValue({ value, unit = "" }) {
  const [display, setDisplay] = React.useState(value);
  const [pulse, setPulse] = React.useState(false);

  React.useEffect(() => {
    if (value !== display) {
      setPulse(true);
      setDisplay(value);
      const t = setTimeout(() => setPulse(false), 300);
      return () => clearTimeout(t);
    }
  }, [value, display]);

  return (
    <span
      style={{
        display: "inline-block",
        transition: "transform 0.25s ease, color 0.25s ease",
        transform: pulse ? "scale(1.08)" : "scale(1)",
        color: pulse ? "#f59e0b" : "inherit",
      }}
    >
      {value !== null && value !== "—" ? `${value}${unit}` : "—"}
    </span>
  );
}

function MLPrediction() {
  const DEVICE_ID = "panel-01";

  const [prediction, setPrediction] = useState(null);
  const [days, setDays] = useState(1);

  /* ================= FIREBASE ================= */
  useEffect(() => {
    const predRef = ref(
      database,
      `telemetry/predictions/${DEVICE_ID}/latest`
    );

    return onValue(predRef, (snap) => {
      if (snap.exists()) {
        console.log("Prediction snapshot:", snap.val());
        setPrediction(snap.val());
      }
    });
  }, []);

  /* ================= SAFE VALUES ================= */
  const v15 =
    typeof prediction?.short_term?.predicted_voltage === "number"
      ? prediction.short_term.predicted_voltage.toFixed(3)
      : "—";

  const angle =
    typeof prediction?.short_term?.recommended_angle === "number"
      ? prediction.short_term.recommended_angle
      : "—";

  const today =
    typeof prediction?.short_term?.predicted_voltage === "number"
      ? prediction.short_term.predicted_voltage.toFixed(3)
      : "—";

  const daily = Array.isArray(prediction?.daily_forecast)
    ? prediction.daily_forecast
    : [];

  /* ================= CHART ================= */
  const visible =
    days === 1
      ? daily.slice(0, 1)
      : days === 3
      ? daily.slice(0, 3)
      : daily.slice(0, 7);

  const chartData = useMemo(
    () => ({
      labels: daily.map((d) => d.date),
      datasets: [
        {
          label: "Forecast Voltage",
          data: daily.map((d) => d.voltage),
          borderColor: "#f6c453",
          backgroundColor: "rgba(246,196,83,0.18)",
          fill: true,
          tension: 0.35,
        },
      ],
    }),
    [daily]
  );

  /* ================= CSV ================= */
  function downloadCSV() {
    if (!daily.length) return;

    const rows = [
      ["Date", "Forecast Voltage (V)"],
      ...daily.map((d) => [d.date, d.voltage]),
    ];

    const blob = new Blob(
      [rows.map((r) => r.join(",")).join("\n")],
      { type: "text/csv" }
    );

    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "forecast.csv";
    a.click();
  }

  return (
    <>
      <style>{`

        .ml-page {
          width: 100%;
          display: flex;
          justify-content: center;
        }

        .ml-wrap {
          width: 100%;
          max-width: 1500px;
          padding: 24px;
        }

        .ml-top {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 32px;
        }

        .ml-card {
          background: #ebf5f7ff;
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 12px 34px rgba(0,0,0,0.06);
        }

        .pill {
          background: #f6fbff;
          border-radius: 14px;
          padding: 16px 18px;
          margin-bottom: 14px;
          border-left: 5px solid #f6c453;
        }

        .pill-title {
          font-size: 14px;
          color: #4b6f8a;
        }

        .pill-value {
          font-size: 30px;
          font-weight: 600;
        }

        .pill-desc {
          font-size: 13px;
          color: #6c8aa0;
        }

        .forecast-tabs button {
          border: none;
          padding: 10px 18px;
          border-radius: 999px;
          margin-left: 10px;
          background: #fff;
          cursor: pointer;
        }

        .forecast-tabs .active {
          background: #f6c453;
          font-weight: 500;
        }

        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 14px;
        }

        th, td {
          padding: 10px;
          border-bottom: 1px solid #e4eef6;
        }

        .csv-btn {
          margin-top: 16px;
          padding: 12px 20px;
          border: none;
          border-radius: 10px;
          background: #6bbcff;
          cursor: pointer;
        }
      `}</style>

      <div className="ml-page">
        <div className="ml-wrap">

          {/* ================= TOP ================= */}
          
          {/* Performance Forecasting Header */}
<div style={{ marginBottom: 20 }}>
  <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 6 }}>
    Performance And Optimization
  </h1>
  <p style={{ fontSize: 14, color: "#6b90a6", maxWidth: 900 }}>
    Predicts future solar panel output using historical telemetry and
    machine-learning models to support proactive monitoring and optimization.
  </p>
</div>
<div className="ml-top">
            <div className="ml-card">
              <div className="pill">
                <div className="pill-title">Output Forecast (15 min)</div>
                <div className="pill-value">
                  <AnimatedValue value={v15} unit=" V" />
                </div>
                <div className="pill-desc">Short-term voltage estimate</div>
              </div>

              <div className="pill">
                <div className="pill-title">Panel Orientation</div>
                <div className="pill-value">
                  <AnimatedValue value={angle} unit="°" />
                </div>
                <div className="pill-desc">Optimal tilt recommendation</div>
              </div>

              <div className="pill">
                <div className="pill-title">Today Output</div>
                <div className="pill-value">
                  <AnimatedValue value={today} unit=" V" />
                </div>
                <div className="pill-desc">Live panel voltage</div>
              </div>
            </div>

            <div className="ml-card">
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <div style={{ fontWeight: 500 }}>Forecasts</div>
                <div className="forecast-tabs">
                  {[1, 3, 7].map((d) => (
                    <button
                      key={d}
                      className={days === d ? "active" : ""}
                      onClick={() => setDays(d)}
                    >
                      {d === 1 ? "Next day" : `${d} days`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="forecast-grid">
  {visible.map((d, i) => (
    <div className="forecast-card" key={i}>
      <div className="forecast-date">{d.date}</div>
      <div className="forecast-voltage">{d.voltage} V</div>
      <div className="forecast-meta">Predicted output</div>
    </div>
  ))}
</div>

              
            </div>
          </div>

          {/* ================= CHART ================= */}
          <h4 style={{ marginTop: 30 }}>Voltage Forecast Trend</h4>
          <div className="ml-card">
  <div style={{ height: "360px" }}>
    <Line
      data={chartData}
      options={{ maintainAspectRatio: false }}
    />
  </div>
</div>

          {/* ================= TABLE ================= */}
          <h4 style={{ marginTop: 24 }}>Voltage Comparison</h4>
          <div className="ml-card">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Panel Output (V)</th>
                  <th>Short-Term Prediction (V)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>{new Date().toLocaleDateString()}</td>
                  <td>{today}</td>
                  <td>{v15}</td>
                </tr>
              </tbody>
            </table>

            <button className="csv-btn" onClick={downloadCSV}>
              Download CSV
            </button>
          </div>

        </div>
      </div>
    </>
  );
}
  


/* ---------------- User Profile page (improved) ---------------- */
function UserProfile() {
  const auth = useAuth();
  const navigate = useNavigate();

  const username = auth.user?.username ?? "";
  const initialName = auth.user?.name ?? username;
  const initialEmail = auth.user?.email ?? username;

  const [name, setName] = useState(initialName);
  const [email] = useState(initialEmail);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [themePref, setThemePref] = useState("light");
  const [notifEnabled, setNotifEnabled] = useState(true);
  const [language, setLanguage] = useState("English");
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(null); // wire to storage later
  const [deviceInfo] = useState({
    id: "solar-unit-01",
    firmware: "1.0.0",
    status: "Online",
    lastSync: "Today 5:23 PM",
  });

  useEffect(() => {
    if (!auth.user) navigate("/auth");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.user]);

  function initialsOf(n) {
    if (!n) return username.slice(0, 1).toUpperCase();
    return n
      .split(" ")
      .map((s) => s[0] || "")
      .slice(0, 2)
      .join("")
      .toUpperCase();
  }

  // lightweight "save" that stores name locally (keeps existing behavior)
  function saveProfile() {
    setMsg(null);
    try {
      const raw = localStorage.getItem("st_local_users");
      const users = raw ? JSON.parse(raw) : {};
      if (users[username]) {
        users[username].name = name;
        localStorage.setItem("st_local_users", JSON.stringify(users));
      }
      const sessRaw = localStorage.getItem("st_local_session");
      if (sessRaw) {
        const sess = JSON.parse(sessRaw);
        if (sess.username === username) {
          sess.name = name;
          localStorage.setItem("st_local_session", JSON.stringify(sess));
        }
      }
      setMsg({ type: "success", text: "Profile saved." });
    } catch (e) {
      setMsg({ type: "error", text: "Failed to save profile." });
    }
  }

  async function handleChangePassword() {
    setMsg(null);
    if (!currentPw || !newPw || !confirmPw) {
      setMsg({ type: "error", text: "Fill all password fields." });
      return;
    }
    if (newPw !== confirmPw) {
      setMsg({ type: "error", text: "New passwords do not match." });
      return;
    }
    setLoading(true);
    try {
      const raw = localStorage.getItem("st_local_users");
      const users = raw ? JSON.parse(raw) : {};
      const stored = users[username];
      if (!stored) throw new Error("User record not found.");
      const curHash = await sha256Hex(currentPw);
      if (curHash !== stored.hash) {
        setMsg({ type: "error", text: "Current password incorrect." });
        setLoading(false);
        return;
      }
      const newHash = await sha256Hex(newPw);
      users[username].hash = newHash;
      localStorage.setItem("st_local_users", JSON.stringify(users));
      setMsg({ type: "success", text: "Password updated." });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      setShowChangePassword(false);
    } catch (e) {
      setMsg({ type: "error", text: e?.message ?? "Failed to change password." });
    } finally {
      setLoading(false);
    }
  }

  function handleSaveAll() {
    // Save password only if shown, else only save name
    if (showChangePassword) {
      handleChangePassword().then(() => saveProfile());
    } else {
      saveProfile();
    }
  }

  function handleLogoutAll() {
    // placeholder: implement server-side session revocation if needed
    localStorage.removeItem("st_local_session");
    setMsg({ type: "info", text: "Logged out from current session (local)." });
    setTimeout(() => {
      auth.logout();
      navigate("/auth");
    }, 700);
  }

  function handleAvatarUpload(file) {
    // placeholder: wire to Firebase Storage or other storage
    // show preview
    const url = URL.createObjectURL(file);
    setAvatarUrl(url);
    setMsg({ type: "success", text: "Avatar selected (not uploaded)." });
  }

  function confirmDeleteAccount() {
    // placeholder: actually delete in backend
    setShowDeleteModal(false);
    setMsg({ type: "error", text: "Account deleted (mock)." });
    // real flow: call API then redirect / cleanup
  }

  // Layout: left column fixed, right column scrollable cards
  return (
    <>
      <div className="content" style={{ alignItems: "flex-start", padding: 28 }}>
        <div className="profile-page" style={{ width: "100%", maxWidth: 1200 }}>
          <div style={{ display: "grid", gridTemplateColumns: "300px 1fr", gap: 24 }}>
            {/* LEFT PANEL */}
            <aside style={{ padding: 20, borderRadius: 12, background: "linear-gradient(180deg,#fff,#f7fbff)", border: "1px solid rgba(108,195,255,0.08)" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                <div style={{ width: 120, height: 120, borderRadius: 999, background: "linear-gradient(135deg,var(--yellow1),var(--yellow2))", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 48, color: "#05202a" }}>
                  {avatarUrl ? <img src={avatarUrl} alt="avatar" style={{ width: 120, height: 120, borderRadius: "50%", objectFit: "cover" }} /> : initialsOf(name)}
                </div>

                <div style={{ textAlign: "center" }}>
                  <div style={{ fontWeight: 800, fontSize: 20, color: "#05202a" }}>{name}</div>
                  <div style={{ color: "#065069", marginTop: 6 }}>{email}</div>
                </div>

                <div style={{ width: "100%", display: "flex", gap: 8, marginTop: 10 }}>
                  <label className="btn-outline" style={{ display: "inline-flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="file" accept="image/*" style={{ display: "none" }} onChange={(e) => e.target.files && handleAvatarUpload(e.target.files[0])} />
                    Upload photo
                  </label>
                  <button className="btn-outline" onClick={handleLogoutAll}>Log out all</button>
                </div>

                <div style={{ width: "100%", marginTop: 10 }}>
                  <button className="btn-outline" onClick={() => { setName(initialName); setMsg({ type: "info", text: "Reverted edits." }); }}>Revert</button>
                </div>
              </div>
            </aside>

            {/* RIGHT PANEL */}
            <main style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {/* Account Info Card */}
              <section style={{ padding: 18, borderRadius: 12, background: "white", border: "1px solid rgba(108,195,255,0.06)" }}>
                <h2 style={{ margin: 0, color: "#05202a" }}>Account information</h2>
                <div style={{ color: "#6b90a6", marginTop: 6 }}>Update name, email (readonly) and account settings</div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 14 }}>
                  <div>
                    <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Full name</label>
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>

                  <div>
                    <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Email (readonly)</label>
                    <input className="input" value={email} readOnly style={{ background: "#f5f9fb", cursor: "not-allowed" }} />
                  </div>
                </div>

                <div style={{ marginTop: 12 }}>
                  <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Username (optional)</label>
                  <input className="input" placeholder="username" />
                </div>
              </section>

              {/* Two column lower row: Security (left) and Preferences + Linked Device (right) */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: 16 }}>
                {/* Security Card */}
                <section style={{ padding: 18, borderRadius: 12, background: "white", border: "1px solid rgba(108,195,255,0.06)" }}>
                  <h3 style={{ margin: 0, color: "#05202a" }}>Security</h3>
                  <div style={{ color: "#6b90a6", marginTop: 6 }}>Change password and account protection</div>

                  <div style={{ marginTop: 12 }}>
                    {/* Toggle to reveal change password fields */}
                    {!showChangePassword ? (
                      <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <button className="btn-primary" onClick={() => setShowChangePassword(true)}>Change password</button>
                        <div style={{ color: "#6b90a6" }}>Use this to update your password securely</div>
                      </div>
                    ) : (
                      <div style={{ marginTop: 8 }}>
                        <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Current password</label>
                        <input className="input" type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />

                        <label style={{ fontWeight: 700, display: "block", marginTop: 12, marginBottom: 8 }}>New password</label>
                        <input className="input" type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />

                        <label style={{ fontWeight: 700, display: "block", marginTop: 12, marginBottom: 8 }}>Confirm new password</label>
                        <input className="input" type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} />

                        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
                          <button className="btn-primary" onClick={handleChangePassword} disabled={loading}>{loading ? "Updating..." : "Update password"}</button>
                          <button className="btn-outline" onClick={() => { setShowChangePassword(false); setCurrentPw(""); setNewPw(""); setConfirmPw(""); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: 14 }}>
                    <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Two-factor authentication</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ color: "#6b90a6" }}>Use 2FA to enhance account security</div>
                      <label style={{ marginLeft: "auto" }}><input type="checkbox" /></label>
                    </div>
                  </div>
                </section>

                {/* Right column: Preferences + Linked Device */}
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  <section style={{ padding: 18, borderRadius: 12, background: "white", border: "1px solid rgba(108,195,255,0.06)" }}>
                    <h3 style={{ margin: 0, color: "#05202a" }}>Preferences</h3>
                    <div style={{ color: "#6b90a6", marginTop: 6 }}>Customize app behavior</div>

                    <div style={{ marginTop: 12 }}>
                      <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>Theme</label>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={themePref === "light"} onChange={() => setThemePref("light")} /> Light
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={themePref === "dark"} onChange={() => setThemePref("dark")} /> Dark
                        </label>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <input type="radio" checked={themePref === "system"} onChange={() => setThemePref("system")} /> System
                        </label>
                      </div>
                    </div>

                    <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
                      <label style={{ fontWeight: 700 }}>Notification alerts</label>
                      <div style={{ marginLeft: "auto" }}>
                        <label style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                          <input type="checkbox" checked={notifEnabled} onChange={() => setNotifEnabled(v => !v)} /> 
                        </label>
                      </div>
                    </div>

                    <div style={{ marginTop: 12 }}>
                      <label style={{ fontWeight: 700, display: "block", marginBottom: 8 }}>Language</label>
                      <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)}>
                        <option>English</option>
                        <option>Spanish</option>
                        <option>Hindi</option>
                      </select>
                    </div>
                  </section>

                  <section style={{ padding: 18, borderRadius: 12, background: "white", border: "1px solid rgba(108,195,255,0.06)" }}>
                    <h3 style={{ margin: 0, color: "#05202a" }}>Linked device</h3>
                    <div style={{ color: "#6b90a6", marginTop: 6 }}>Overview of connected tracker</div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginTop: 12, alignItems: "center" }}>
                      <div>
                        <div style={{ fontWeight: 800 }}>{deviceInfo.id}</div>
                        <div style={{ color: "#6b90a6", fontSize: 13 }}>Firmware {deviceInfo.firmware}</div>
                        <div style={{ color: "#6b90a6", fontSize: 13 }}>Last sync: {deviceInfo.lastSync}</div>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 10, height: 10, borderRadius: 8, background: deviceInfo.status === "Online" ? "#2ecc71" : "#ff6b6b" }} />
                          <div style={{ fontWeight: 700 }}>{deviceInfo.status}</div>
                        </div>

                        <div style={{ marginTop: 10 }}>
                          <button className="btn-outline" onClick={() => setMsg({ type: "info", text: "Sync requested (mock)." })}>Sync</button>
                        </div>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {/* Danger zone */}
              <section style={{ padding: 18, borderRadius: 12, background: "white", border: "1px solid rgba(255,180,180,0.08)" }}>
                <h3 style={{ margin: 0, color: "#05202a" }}>Danger zone</h3>
                <div style={{ color: "#6b90a6", marginTop: 6 }}>Critical account actions</div>

                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button className="btn-outline" onClick={() => setShowDeleteModal(true)} style={{ borderColor: "rgba(255,70,70,0.12)" , color:"#b41b1b" }}>Delete account</button>
                  <button className="btn-outline" onClick={() => { setMsg({ type: "info", text: "Profile reset (mock)." }); }}>Reset profile</button>
                </div>
              </section>

              {/* bottom actions */}
              <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
                <button className="btn-outline" onClick={() => navigate("/dashboard")}>Back</button>
                <button className="btn-primary" onClick={handleSaveAll}>Save changes</button>
              </div>
            </main>
          </div>
        </div>
      </div>

      {/* Simple delete confirmation modal */}
      {showDeleteModal && (
        <div className="overlay" style={{ zIndex: 1300 }}>
          <div style={{ width: 520, margin: "80px auto", background: "white", padding: 20, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <h3 style={{ marginTop: 0 }}>Confirm account deletion</h3>
            <p style={{ color: "#6b90a6" }}>This action is irreversible. Type <strong>DELETE</strong> to confirm.</p>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input className="input" placeholder="Type DELETE to confirm" onKeyDown={(e) => {
                if (e.key === "Enter" && e.target.value.trim().toUpperCase() === "DELETE") confirmDeleteAccount();
              }} />
              <button className="btn-outline" onClick={() => setShowDeleteModal(false)}>Cancel</button>
              <button className="btn-primary" onClick={confirmDeleteAccount} style={{ background: "linear-gradient(90deg,#ff7b7b,#ff4b4b)" }}>Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* inline feedback */}
      {msg && (
        <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 1400 }}>
          <div style={{ padding: 12, borderRadius: 10, background: msg.type === "error" ? "#ffecec" : msg.type === "success" ? "#e6ffef" : "#f0f7ff", color: msg.type === "error" ? "#b41b1b" : "#065069" }}>
            {msg.text}
          </div>
        </div>
      )}
    </>
  );
}


/* ---------------- App Router ---------------- */
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <GlobalStyles />
        <div className="app-shell">
          <TopNavWrapper />

          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/monitor" element={<AnalyticsPage />} /> {/* <-- Monitor route */}
            <Route path="/ml" element={<MLPrediction />} />
            <Route path="/profile" element={<UserProfile />} />
            <Route path="/" element={<Navigate to="/auth" replace />} />
            <Route path="*" element={<Navigate to="/auth" replace />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
} 