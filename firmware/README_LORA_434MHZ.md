# 🛰️ 440 MHz LoRa Module Ground Station Setup Guide

This guide explains how to connect your **real-time LoRa module operating at 440.000 MHz UHF** to the CubeSat Ground Station Dashboard.

---

## 1. Supported LoRa Hardware Modules

The Ground Station automatically supports all common 433 / 440 MHz LoRa transceivers:

1. **Semtech SX1278 / SX1276 / RFM95W / AI-Thinker Ra-02 (433/440 MHz)**
   - Paired with ESP32, ESP8266, Arduino Uno/Nano/Mega, Raspberry Pi Pico, or STM32.
2. **ESP32 LoRa Integrated Boards (433/440 MHz)**
   - Heltec WiFi LoRa 32 V2/V3 (433 MHz version)
   - TTGO T-Beam / T3 (433 MHz version)
3. **EBYTE E32-433T20D / E22-400T22D / E22-400M30S (UART LoRa)**
   - Connects directly via USB-to-UART FTDI / CP2102 / CH340 adapter!
4. **Reyax RYLR896 / RYLR998 / RYLR406 (AT Command UART)**
   - Connects directly via USB-UART adapter.

---

## 2. Hardware Wiring (ESP32 <-> SX1278 Ra-02)

| SX1278 (Ra-02) Pin | ESP32 GPIO Pin | Notes |
|:---|:---|:---|
| **VCC (3.3V)** | **3.3V** | ⚠️ **DO NOT CONNECT TO 5V!** |
| **GND** | **GND** | Common Ground |
| **NSS / CS** | **GPIO 5** | SPI Chip Select |
| **RST** | **GPIO 14** | Reset |
| **DIO0** | **GPIO 2** | Packet Ready Interrupt |
| **SCK** | **GPIO 18** | SPI Clock |
| **MISO** | **GPIO 19** | SPI Master In Slave Out |
| **MOSI** | **GPIO 23** | SPI Master Out Slave In |
| **ANT** | **Antenna** | 17.0 cm wire or 440 MHz whip antenna |

> **Antenna Note:** At 440.000 MHz, a quarter-wave whip antenna length is **17.0 cm (6.7 inches)**. Always attach an antenna before powering your LoRa module!

---

## 3. Quick Start (Web Dashboard)

1. **Plug in your LoRa Receiver** to your PC using a USB cable.
2. Open the Ground Station Dashboard in your browser:  
   👉 [http://localhost:3000](http://localhost:3000)
3. In the top **440 MHz LoRa Toolbar**:
   - Click the **🔄 (Refresh)** button if your COM port is not yet listed.
   - Select your LoRa module's serial port (e.g. `COM3`, `COM4`, `/dev/ttyUSB0`).
   - Select the Baud rate (default: `115200` for ESP32/Arduino, or `9600` for Ebyte/Reyax).
   - Click **CONNECT LORA**.
4. The status indicator will turn **GREEN (CONNECTED)**.
5. As packets arrive at 440 MHz:
   - The indicator flashes bright cyan on each packet.
   - Sensor values (Temperature, Pressure, Battery, Orientation, GPS, RSSI, SNR) update in real-time.
   - Click **PACKET MONITOR** to watch the live incoming packet terminal and send AT commands!

---

## 4. Testing Without Physical Hardware

You can test the entire 440 MHz pipeline immediately:
- Click the **⚡ TEST PACKET** button on the dashboard toolbar.
- Or run the Python receiver simulator:
  ```bash
  py lora_telemetry_receiver.py --simulate
  ```

---

## 5. Packet Formats Accepted

The Ground Station automatically decodes any of the following formats:

### Format A: JSON (Recommended)
```json
{"temp_ext":22.4,"press":1013.25,"battery":92,"pitch":6.5,"roll":-3.1,"yaw":142,"lat":28.6139,"lon":77.209,"alt":512}
```

### Format B: Reyax AT Receiver Output
```
+RCV=50,24,{"temp_ext":22.4},-68,11
```

### Format C: Key-Value Pairs
```
TE:22.4,PR:1013.2,BATT:92,P:6.5,R:-3.1,Y:142,RSSI:-68,SNR:11.2
```

### Format D: Comma-Separated Values (CSV)
```
22.4, 1013.2, 48.0, 24.1, 92.0, 0.55, 6.5, -3.1, 142.0, 28.6139, 77.2090, 512.0
```
*(Order: TempExt, Pressure, Humidity, TempInt, Battery, SolarKW, Pitch, Roll, Yaw, Lat, Lon, Alt)*
