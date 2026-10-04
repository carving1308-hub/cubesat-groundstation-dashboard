# 🛰️ 6U CubeSat Telemetry & 440 MHz LoRa Ground Station Web Dashboard

[![Node.js](https://img.shields.io/badge/Node.js-v18.0%2B-green.svg)](https://nodejs.org/)
[![Express](https://img.shields.io/badge/Express.js-4.x-blue.svg)](https://expressjs.com/)
[![WebSockets](https://img.shields.io/badge/WebSockets-WS-orange.svg)](https://github.com/websockets/ws)
[![CCSDS Standard](https://img.shields.io/badge/CCSDS-133.0--B--2-purple.svg)](https://public.ccsds.org/)
[![RF Frequency](https://img.shields.io/badge/RF_Frequency-440.000_MHz_UHF-red.svg)]()
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An advanced, real-time aerospace ground station telemetry web application and command control system designed for receiving, parsing, visualizing, and decoding 6U CubeSat telemetry transmitted over the **440.000 MHz UHF band** (Amateur/ISM Satellite Band).

The system features standard **CCSDS Space Packet (CCSDS 133.0-B-2)** decoding, multi-format hex/ASCII key-value telemetry parsing, Leaflet **Hybrid Satellite orbital tracking**, OV7670 camera frame reassembly, dynamic 3D satellite attitude visualization, real-time packet activity watchdog monitoring, and an integrated browser-based **OBC Firmware Compiler & Flasher Toolkit**.

---

## 🌟 Key Features & Capabilities

### 📻 Multi-Interface 440.000 MHz Telemetry Ingestion
- **Hardware Serial Receiver**: Connects directly to USB/Serial LoRa modules (Reyax RYLR896/998, Ra-02, SX1278) targeting `COM7` @ 9600 / 115200 baud.
- **SDR Receiver Modem Ports**: Listens on **SDR TCP Port `12345`** and **SDR UDP Port `7373`**.
- **HTTP Telemetry REST Endpoint**: Supports incoming JSON payloads via `POST /api/telemetry`.

### 📦 CCSDS Space Packet & Multi-Format Telemetry Decoder
- **CCSDS 133.0-B-2 Parsing**: Extracts 6-byte Primary Headers (Version 0, APID `0x001`, Sequence Flags, 14-bit Sequence Counter) and 6-byte Secondary Header timestamps (Coarse uint32_t seconds + Fine uint16_t subseconds).
- **Hexadecimal ASCII Payload Engine**: Automatically converts hex-encoded telemetry streams (e.g. `54656D703A3237...` $\rightarrow$ `Temp:27.60 Hum:51.10 LDR:1076 AccelX:0.20 AccelY:0.10 AccelZ:-0.90 Seq:69387`) into numerical dashboard metrics in real time.

### 📊 Full Sensor Complement & Metrics Breakdown
1. **BMP280 Sensor**: Barometric Pressure ($hPa$), External Temperature ($^\circ C$), Calculated Altitude ($m$).
2. **DHT11 Avionics**: Internal Cabin Temperature ($^\circ C$), Relative Humidity ($\%$).
3. **HW-072 LDR & EPS Subsystem**: Solar Panel Power Output ($kW$), Lux, Raw ADC ($0-1023$), Battery Voltage ($V$), Battery Percentage ($\%$), Daylight vs. Eclipse Status.
4. **MPU-9250 9-DOF IMU & Space Day CAD Model**: Real-Time Pitch ($^\circ$), Roll ($^\circ$), Yaw ($^\circ$), Gyroscope XYZ ($\frac{^\circ}{s}$), Accelerometer XYZ ($g$), rendering the custom **`Space Day.step`** CAD model geometry live on screen.
5. **Ublox NEO-6M GPS**: 3D Fix Tracking, Latitude, Longitude, Velocity ($km/s$), Satellites in view.
6. **OV7670 Payload Camera**: Live chunk reassembler decoding hexadecimal RGB565 / JPEG payload frames onto an HTML5 canvas.

### 🗺️ Leaflet Hybrid Satellite Orbital Tracking
- High-resolution **Google Hybrid Satellite** & **Esri World Imagery** tile layers with road networks, boundaries, and city names.
- Built-in Leaflet Layer Switcher Control (`🛰️ Google Hybrid`, `🌐 Esri Hybrid`, `🌌 CartoDB Dark`).
- Default reference origin coordinates: **`30.768776152974365, 76.57395518470074`**.

### ⏱️ Live Watchdog & Packet Monitor Terminal
- **Header Activity Watchdog**: Status indicator glows **`DATA RECEIVING`** (emerald green glow) strictly during active packet ingestion, automatically falling back to **`WAITING FOR DATA`** (amber) when idle.
- **Dual-Tab Packet Monitor Modal**: Displays a real-time raw Hex stream terminal in yellow + bitwise CCSDS primary header breakdown.

### ⚡ Integrated OBC Receiver Compiler & Flasher
- Integrated browser C++/Arduino source code editor (`firmware/GroundStation_LoRa_434MHz_Receiver.ino`).
- **REST Compilation API** (`POST /api/obc/compile`): Validates syntax and verifies Arduino CLI / GCC compiler configuration.
- **REST Flashing API** (`POST /api/obc/flash`): Compiles and uploads binary firmware directly to the connected OBC receiver board on `COM7`.

### 🎨 Theme Support
- **Professional Blue & White Aerospace Theme**: Clean, crisp slate-white background with high-contrast royal blue, deep navy, and sky blue accents designed for high-density mission control environments.
- **Dark & Light Mode Compatible**: Optimized for readability on ground station displays.

---

## 📂 Project Architecture

```text
cubesat-groundstation-dashboard/
├── server.js                        # Node.js Express server, WebSockets, CCSDS/Hex decoders, Serial & SDR ports
├── package.json                     # Node dependencies (express, ws, serialport, cors)
├── .gitignore                       # Git ignore configuration
├── README.md                        # Project documentation
├── public/                          # Dashboard Frontend Web Application
│   ├── index.html                   # Mission control single-page grid UI
│   ├── css/
│   │   └── style.css                # Equal-grid layout, cream/light themes, modal & widget styles
│   └── js/
│       ├── app.js                   # WebSocket manager, Chart.js telemetry graphs, Leaflet map & terminal log
│       └── cubesat3d.js             # Three.js 3D 6U CubeSat orientation & kinematic renderer
├── firmware/
│   └── GroundStation_LoRa_434MHz_Receiver.ino # C++/Arduino OBC receiver firmware & CCSDS translation engine
└── sdr_telemetry_client.py          # Python SDR telemetry client script (CCSDS Space Packet transmitter)
```

---

## ⚡ Quickstart Guide

### 1. Prerequisites
- **Node.js** (v18.0 or higher recommended)
- **npm** (included with Node.js)
- USB/Serial LoRa Module (Reyax RYLR896/998, Ra-02, or SX1278 transceiver) connected to `COM7` (optional for live RF reception).

### 2. Installation

Clone the repository and install project dependencies:

```bash
git clone https://github.com/YOUR_USERNAME/cubesat-groundstation-dashboard.git
cd cubesat-groundstation-dashboard
npm install
```

### 3. Launching the Server

Start the Node.js Ground Station server:

```bash
node server.js
```

**Console Output:**
```text
================================================================
  🚀 6U CUBESAT TELEMETRY & 440 MHz LoRa GROUND STATION DASHBOARD
  🌐 Web UI:       http://localhost:3000
  📻 LoRa Target:  440.000 MHz UHF (Amateur/ISM Band)
  📡 SDR TCP Port: 0.0.0.0:12345
  📡 SDR UDP Port: 0.0.0.0:7373
================================================================
```

### 4. Opening the Web UI
Open your browser and navigate to:
**`http://localhost:3000`**

---

## 🧪 Testing Telemetry Ingestion

### Sending Sample Hex / Key-Value Telemetry Packet

You can test real-time telemetry ingestion by posting a JSON payload containing hex-encoded ASCII data to the server:

```bash
curl -X POST http://localhost:3000/api/telemetry \
  -H "Content-Type: application/json" \
  -d '{"pkt":48,"bytes":76,"rssi":-78,"snr":9.3,"hex":"54656D703A32372E36302048756D3A35312E3130204C44523A3130373620416363656C583A302E323020416363656C593A302E313020416363656C5A3A2D302E3930205365713A3639333837"}'
```

---

## 🛠️ REST API Reference

| Endpoint | Method | Description |
| :--- | :--- | :--- |
| `/api/status` | `GET` | Returns ground station operational status, active frequency (`440.000 MHz`), and connected clients. |
| `/api/telemetry` | `POST` | Ingests JSON, CCSDS binary, or hex-encoded ASCII telemetry frames. |
| `/api/lora/ports` | `GET` | Queries available system serial COM ports. |
| `/api/obc/firmware` | `GET` | Retrieves the OBC receiver C++/Arduino source code. |
| `/api/obc/compile` | `POST` | Compiles the receiver firmware source code. |
| `/api/obc/flash` | `POST` | Compiles and flashes firmware to the OBC board via `COM7`. |
| `/api/telemetry/reset` | `POST` | Resets all telemetry values and frequency medium state to 0. |

---

## 📜 License & Credits

Designed for 6U CubeSat aerospace missions, UHF ground station telemetry receivers, and satellite communications testing.

Released under the **MIT License**.
