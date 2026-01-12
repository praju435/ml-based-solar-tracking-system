#  ML-Based Smart Solar Tracking System (IoT + AI)

An **intelligent dual-axis solar tracking system** that combines **IoT sensors, machine learning, and real-time dashboards** to maximize solar energy harvesting efficiency.  
The system predicts optimal panel orientation using historical and live data, while providing real-time monitoring through a web dashboard.

---

##  Project Overview

Traditional solar trackers rely purely on sensor-based control, which can be inefficient under noisy conditions (clouds, reflections, sensor drift).  
This project introduces a **machine learning–assisted solar tracking approach** that:

- Learns optimal panel orientation patterns
- Reduces unnecessary servo movement
- Improves tracking accuracy under varying environmental conditions
- Provides real-time visualization and cloud connectivity

---

##  Key Features

- 🔄 **Dual-Axis Solar Tracking** (Azimuth & Elevation)
- 🤖 **Machine Learning Prediction** for optimal panel angles
- 📡 **ESP32-based IoT system** with real-time telemetry
- ☁️ **Cloud integration** for data storage and analytics
- 📊 **Interactive Web Dashboard** for live monitoring & forecasts
- ⚡ Designed for **energy efficiency and scalability**

---

##  System Architecture

1. **Sensors & Hardware (IoT Layer)**
   - LDR sensors for light intensity detection
   - Rotary encoder (AS5600) for precise angle feedback
   - Servo motors for panel movement
   - ESP32 microcontroller for control & communication

2. **ML Backend (AI Layer)**
   - Data preprocessing & feature engineering
   - Supervised ML models trained on historical solar data
   - Prediction of optimal orientation angles
   - REST API for communication with IoT devices

3. **Cloud & Dashboard (Application Layer)**
   - Real-time data storage
   - Analytics & visualization
   - User-friendly React-based dashboard

---

##  Machine Learning Approach

- **Problem Type:** Regression (Angle prediction)
- **Inputs:**  
  - Light intensity readings  
  - Time-based features  
  - Environmental parameters (optional)
- **Outputs:**  
  - Optimal servo angles (azimuth & elevation)
- **Models Used:**  
  - Random Forest / Regression-based models
- **Evaluation Metrics:**  
  - MAE, RMSE, prediction stability

>  Trained models and datasets are intentionally **not stored in this repository** to keep it lightweight and professional.

---

## Tech Stack

### Hardware
- ESP32
- LDR Sensors
- Servo Motors
- AS5600 Magnetic Encoder

### Backend / ML
- Python
- Flask (REST API)
- NumPy, Pandas, Scikit-learn
- TensorFlow (optional experiments)

### Frontend
- React.js
- Chart.js / Recharts
- Firebase (Realtime Database)

### Cloud & Tools
- Firebase
- Git & GitHub
- REST APIs

---

---

## 📈 Results & Impact

- ✅ Improved tracking stability under fluctuating light conditions
- ✅ Reduced unnecessary servo movements
- ✅ Scalable design for large solar installations
- ✅ Real-time insights for monitoring and optimization

---

## 🔮 Future Enhancements

- Weather API integration for predictive control
- Reinforcement learning–based tracking
- Edge ML inference directly on ESP32
- Multi-panel solar farm optimization

---

##  Author

**Prajwal P**  
Engineering Student | AI/ML & IoT Enthusiast  
Focused on building **real-world intelligent systems** at the intersection of **hardware, machine learning, and cloud technologies**.

🔗 *LinkedIn-ready project showcasing applied ML, IoT, and system design.*

---

## 📜 License

This project is open for learning and research purposes.  
Feel free to fork, experiment, and build upon it.



