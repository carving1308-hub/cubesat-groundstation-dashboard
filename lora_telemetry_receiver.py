#!/usr/bin/env python3
"""
Real-Time 440 MHz LoRa Telemetry Receiver & Bridge
Antigravity 6U CubeSat Ground Station

Connects to hardware LoRa modules (SX1278 Ra-02, ESP32 LoRa, Arduino + LoRa,
EBYTE E32-433T20D, Reyax RYLR896/998) via USB Serial COM Port at 440.000 MHz.
Forwards real-time telemetry packets directly into the Ground Station Dashboard.

Usage:
  # Scan available COM ports:
  py lora_telemetry_receiver.py --list-ports

  # Connect to LoRa module on COM3 at 115200 baud (440 MHz):
  py lora_telemetry_receiver.py --port COM3 --baud 115200

  # Send via HTTP API:
  py lora_telemetry_receiver.py --port COM3 --protocol http --url http://localhost:3000/api/lora/telemetry

  # Simulation / Test mode (generates 440 MHz packets without hardware):
  py lora_telemetry_receiver.py --simulate
"""

import sys
import time
import json
import math
import random
import argparse
import socket
import urllib.request

if sys.stdout and hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass
if sys.stderr and hasattr(sys.stderr, 'reconfigure'):
    try:
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

try:
    import serial
    import serial.tools.list_ports as lp
    HAS_SERIAL = True
except ImportError:
    HAS_SERIAL = False

def list_ports():
    if not HAS_SERIAL:
        print("[ERROR] pyserial is not installed. Run: pip install pyserial")
        return []
    ports = lp.comports()
    print("==================================================================")
    print(" AVAILABLE SERIAL COM PORTS FOR 440 MHz LoRa MODULE:")
    print("==================================================================")
    if not ports:
        print("  No COM ports found. Connect your LoRa USB module.")
    for p in ports:
        print(f"  * {p.device:<8} -> {p.description} [{p.hwid}]")
    print("==================================================================")
    return ports

def decode_hex_telemetry_frame(raw_str):
    """
    Decodes 44-byte (88 hex characters) packed binary telemetry frame:
    BMP280, MPU9250, DHT11, Ublox NEO-6M, HW-072 LDR, EPS Battery.
    """
    if not raw_str:
        return None
    hex_clean = "".join(c for c in raw_str if c in "0123456789ABCDEFabcdef").upper()
    if len(hex_clean) < 40:
        return None

    try:
        def r_int16(start):
            v = int(hex_clean[start:start+4], 16)
            if v >= 0x8000: v -= 0x10000
            return v
        def r_uint16(start):
            return int(hex_clean[start:start+4], 16)
        def r_uint32(start):
            return int(hex_clean[start:start+8], 16)
        def r_int32(start):
            v = int(hex_clean[start:start+8], 16)
            if v >= 0x80000000: v -= 0x100000000
            return v
        def r_uint8(start):
            return int(hex_clean[start:start+2], 16)

        offset = 0
        sync = hex_clean[offset:offset+4]
        if sync in ["5AA5", "AA55"]:
            offset += 4
        else:
            return None

        pkt_id = r_uint16(offset); offset += 4
        temp_bmp = round(r_int16(offset) / 100.0, 2); offset += 4
        press_bmp = round(r_uint32(offset) / 100.0, 2); offset += 8
        alt_bmp = r_int16(offset); offset += 4
        temp_dht = r_uint8(offset); offset += 2
        hum_dht = r_uint8(offset); offset += 2
        ldr_raw = r_uint16(offset); offset += 4
        solar_kw = round(r_uint16(offset) / 1000.0, 3); offset += 4
        pitch = round(r_int16(offset) / 100.0, 2); offset += 4
        roll = round(r_int16(offset) / 100.0, 2); offset += 4
        yaw = round(r_uint16(offset) / 100.0, 2); offset += 4
        gyro_x = round(r_int16(offset) / 100.0, 2); offset += 4
        gyro_y = round(r_int16(offset) / 100.0, 2); offset += 4
        gyro_z = round(r_int16(offset) / 100.0, 2); offset += 4

        lat = 0.0
        lon = 0.0
        alt_gps = 0.0
        sats = 0
        if offset + 16 <= len(hex_clean):
            lat = round(r_int32(offset) / 1000000.0, 4); offset += 8
            lon = round(r_int32(offset) / 1000000.0, 4); offset += 8
            if offset + 4 <= len(hex_clean):
                alt_gps = round(r_int16(offset) / 1000.0, 1); offset += 4
            if offset + 2 <= len(hex_clean):
                sats = r_uint8(offset); offset += 2

        batt_volt = 0.0
        batt_pct = 0.0
        if offset + 4 <= len(hex_clean):
            batt_volt = round(r_uint16(offset) / 1000.0, 2); offset += 4
        if offset + 2 <= len(hex_clean):
            batt_pct = r_uint8(offset); offset += 2

        return {
            "packet_id": pkt_id,
            "is_hex": True,
            "raw_hex": hex_clean,
            "temp_ext": temp_bmp,
            "press": press_bmp,
            "bmp280_alt_m": alt_bmp,
            "temp_int": temp_dht,
            "hum": hum_dht,
            "solar_kw": solar_kw,
            "ldr_raw": ldr_raw,
            "pitch": pitch,
            "roll": roll,
            "yaw": yaw,
            "gyro_x": gyro_x,
            "gyro_y": gyro_y,
            "gyro_z": gyro_z,
            "lat": lat,
            "lon": lon,
            "alt": alt_gps,
            "satellites": sats,
            "battery": batt_pct,
            "battery_voltage_v": batt_volt,
            "sensors": {
                "bmp280": {"temp_c": temp_bmp, "pressure_hpa": press_bmp, "altitude_m": alt_bmp},
                "mpu9250": {"pitch_deg": pitch, "roll_deg": roll, "yaw_deg": yaw, "gyro_x": gyro_x, "gyro_y": gyro_y, "gyro_z": gyro_z},
                "dht11": {"temp_int_c": temp_dht, "humidity_pct": hum_dht},
                "neo6m": {"lat": lat, "lon": lon, "alt_m": alt_gps * 1000, "satellites": sats},
                "hw072_ldr": {"raw_adc": ldr_raw, "solar_kw": solar_kw}
            }
        }
    except Exception as e:
        return None

def parse_lora_line(raw_line):
    """
    Parses incoming raw line from LoRa module.
    Supports HEX frames, JSON, Reyax +RCV format, Key:Value pairs, and CSV.
    """
    s = raw_line.strip()
    if not s:
        return None, None, None

    rssi = None
    snr = None
    payload = s

    # 1. Reyax RYLR896/998 AT format: +RCV=addr,len,data,rssi,snr
    if "+RCV=" in s:
        rcv_part = s[s.index("+RCV=") + 5:]
        parts = rcv_part.split(",")
        if len(parts) >= 5:
            try:
                rssi = float(parts[-2])
                snr = float(parts[-1])
                payload = ",".join(parts[2:-2])
            except ValueError:
                pass

    # 2. Extract RSSI / SNR if labeled
    import re
    rssi_m = re.search(r"RSSI\s*[:=]\s*(-?\d+(\.\d+)?)", s, re.IGNORECASE)
    if rssi_m:
        rssi = float(rssi_m.group(1))
    snr_m = re.search(r"SNR\s*[:=]\s*(-?\d+(\.\d+)?)", s, re.IGNORECASE)
    if snr_m:
        snr = float(snr_m.group(1))

    # 3. Try Hexadecimal Telemetry Frame (BMP280, MPU9250, DHT11, NEO-6M, HW-072 LDR)
    hex_decoded = decode_hex_telemetry_frame(payload)
    if hex_decoded:
        hex_decoded["rssi"] = rssi if rssi is not None else 0.0
        hex_decoded["snr"] = snr if snr is not None else 0.0
        hex_decoded["freq_mhz"] = 440.000
        return hex_decoded, rssi, snr

    # 4. Check JSON
    first_b = payload.find('{')
    last_b = payload.rfind('}')
    if first_b != -1 and last_b > first_b:
        try:
            data = json.loads(payload[first_b:last_b+1])
            if isinstance(data, dict):
                # Check for nested hex in 'raw'
                if "raw" in data and isinstance(data["raw"], str):
                    nested_hex = decode_hex_telemetry_frame(data["raw"])
                    if nested_hex:
                        nested_hex.update(data)
                        data = nested_hex

                if rssi is not None and "rssi" not in data:
                    data["rssi"] = rssi
                if snr is not None and "snr" not in data:
                    data["snr"] = snr
                if "freq_mhz" not in data:
                    data["freq_mhz"] = 440.000
                return data, data.get("rssi", rssi), data.get("snr", snr)
        except Exception:
            pass

    # 5. Check Key:Value or Key=Value pairs
    if "=" in payload or ":" in payload:
        tokens = re.split(r"[,;\t|]", payload)
        res = {}
        for tok in tokens:
            parts = re.split(r"[:=]", tok, maxsplit=1)
            if len(parts) == 2:
                k = parts[0].strip().lower()
                try:
                    v = float(parts[1].strip())
                    if k in ["tempext", "temp_ext", "te", "tout"]: res["temp_ext"] = v
                    elif k in ["press", "pressure", "pr", "baro"]: res["press"] = v
                    elif k in ["hum", "humidity", "rh"]: res["hum"] = v
                    elif k in ["tempint", "temp_int", "ti", "tin"]: res["temp_int"] = v
                    elif k in ["battery", "batt", "bat", "b"]: res["battery"] = v
                    elif k in ["solar", "solarkw", "solar_kw"]: res["solar_kw"] = v
                    elif k in ["pitch", "p"]: res["pitch"] = v
                    elif k in ["roll", "r"]: res["roll"] = v
                    elif k in ["yaw", "y"]: res["yaw"] = v
                    elif k in ["lat", "latitude"]: res["lat"] = v
                    elif k in ["lon", "longitude"]: res["lon"] = v
                    elif k in ["alt", "altitude"]: res["alt"] = v
                    elif k in ["rssi"]: rssi = v
                    elif k in ["snr"]: snr = v
                    elif k in ["freq", "freq_mhz"]: res["freq_mhz"] = v
                    elif k in ["doppler", "doppler_hz"]: res["doppler_hz"] = v
                except ValueError:
                    pass
        if len(res) >= 2:
            if rssi is not None: res["rssi"] = rssi
            if snr is not None: res["snr"] = snr
            if "freq_mhz" not in res: res["freq_mhz"] = 440.000
            return res, rssi, snr

    return {"raw": payload, "rssi": rssi if rssi is not None else 0.0, "snr": snr if snr is not None else 0.0, "freq_mhz": 440.000}, rssi, snr

def forward_packet(payload, protocol, host, port, url):
    """Sends packet to Ground Station server via HTTP, UDP, or TCP."""
    msg_bytes = (json.dumps(payload) + "\n").encode("utf-8")
    if protocol == "http":
        req = urllib.request.Request(url, data=msg_bytes, headers={"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=2) as resp:
                pass
        except Exception as e:
            print(f"[HTTP POST Error] {e}")
    elif protocol == "udp":
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.sendto(msg_bytes, (host, port))
        sock.close()

def main():
    parser = argparse.ArgumentParser(description="Real-Time 440 MHz LoRa Telemetry Receiver")
    parser.add_argument("--list-ports", action="store_true", help="List available COM serial ports")
    parser.add_argument("--port", default=None, help="Serial COM port (e.g. COM3 or /dev/ttyUSB0)")
    parser.add_argument("--baud", type=int, default=115200, help="Serial baud rate (default: 115200)")
    parser.add_argument("--freq", type=float, default=440.000, help="LoRa Frequency in MHz (default: 440.000)")
    parser.add_argument("--protocol", choices=["http", "udp"], default="http", help="Protocol to forward to server")
    parser.add_argument("--url", default="http://localhost:3000/api/lora/telemetry", help="Target HTTP API URL")
    parser.add_argument("--host", default="127.0.0.1", help="Target server host (for UDP)")
    parser.add_argument("--udp-port", type=int, default=7373, help="Target UDP port")
    parser.add_argument("--simulate", action="store_true", help="Simulate 440 MHz LoRa packets without physical hardware")
    args = parser.parse_args()

    if args.list_ports:
        list_ports()
        return

    print("==================================================================")
    print(" 🛰️  6U CUBESAT 440 MHz LoRa TELEMETRY RECEIVER")
    print(f" 📻 Target RF:       {args.freq:.3f} MHz UHF (LoRa Band)")
    print(f" 📡 Forwarding to:   {args.url if args.protocol == 'http' else f'{args.host}:{args.udp_port} (UDP)'}")
    print("==================================================================")

    if args.simulate:
        print("[SIMULATOR] Generating live 440 MHz LoRa packets (Press Ctrl+C to stop)...")
        pkt_count = 0
        t = 0.0
        try:
            while True:
                t += 0.25
                pkt_count += 1
                pkt = {
                    "packet_id": pkt_count,
                    "freq_mhz": args.freq,
                    "timestamp": int(time.time() * 1000),
                    "temp_ext": round(21.5 + 8.0 * math.sin(t * 0.15) + random.uniform(-0.2, 0.2), 2),
                    "press": round(1013.25 + 2.0 * math.cos(t * 0.08), 2),
                    "hum": round(44.0 + 5.0 * math.sin(t * 0.1), 1),
                    "temp_int": round(23.2 + 2.5 * math.sin(t * 0.05), 1),
                    "battery": round(max(20.0, min(100.0, 92.0 - (pkt_count * 0.02) % 30)), 1),
                    "battery_voltage_v": round(8.28 - (pkt_count * 0.001) % 0.8, 2),
                    "solar_kw": round(max(0.0, 0.62 * math.sin(t * 0.08)), 3),
                    "pitch": round(12.0 * math.sin(t * 0.2), 2),
                    "roll": round(-7.0 * math.cos(t * 0.18), 2),
                    "yaw": round((t * 6.0) % 360, 2),
                    "lat": round(28.6139 + 3.0 * math.sin(t * 0.04), 4),
                    "lon": round(77.2090 + 3.0 * math.cos(t * 0.04), 4),
                    "alt": round(512.4 + 1.5 * math.sin(t * 0.1), 1),
                    "satellites": 8,
                    "rssi": round(-68.0 + random.uniform(-3.0, 3.0), 1),
                    "snr": round(11.5 + random.uniform(-0.8, 0.8), 1),
                    "doppler_hz": round(180.0 * math.sin(t * 0.1), 1)
                }

                forward_packet(pkt, args.protocol, args.host, args.udp_port, args.url)
                print(f"[{time.strftime('%H:%M:%S')}] 440 MHz LoRa RX #{pkt_count} | TempExt={pkt['temp_ext']}°C | Batt={pkt['battery']}% | Pitch={pkt['pitch']}° | RSSI={pkt['rssi']} dBm | Doppler={pkt['doppler_hz']} Hz")
                time.sleep(0.5)
        except KeyboardInterrupt:
            print("\nStopped.")
            return

    # Hardware Serial Port Connection
    if not HAS_SERIAL:
        print("[ERROR] pyserial is required for hardware LoRa reception: pip install pyserial")
        sys.exit(1)

    port = args.port
    if not port:
        ports = lp.comports()
        if not ports:
            print("[ERROR] No COM ports detected. Please connect your LoRa module or run with --simulate")
            sys.exit(1)
        # Auto-detect likely USB-Serial device
        for p in ports:
            d = (p.description + " " + p.device).lower()
            if "usb" in d or "ch340" in d or "cp210" in d or "serial" in d or "arduino" in d:
                port = p.device
                break
        if not port:
            port = ports[0].device
        print(f"[AUTO-DETECT] Selected LoRa Serial Port: {port}")

    print(f"[CONNECTING] Opening {port} at {args.baud} baud (440 MHz LoRa)...")
    try:
        ser = serial.Serial(port, args.baud, timeout=1)
        print(f"[CONNECTED] Listening for 440.000 MHz LoRa telemetry packets on {port}...")
    except Exception as e:
        print(f"[ERROR] Could not open {port}: {e}")
        print("Tip: Run with --list-ports to view available ports or --simulate to test.")
        sys.exit(1)

    pkt_count = 0
    try:
        while True:
            raw_line = ser.readline().decode("utf-8", errors="replace").strip()
            if raw_line:
                pkt_count += 1
                parsed_data, rssi, snr = parse_lora_line(raw_line)
                print(f"[{time.strftime('%H:%M:%S')}] RAW LoRa: {raw_line}")
                if parsed_data:
                    forward_packet(parsed_data, args.protocol, args.host, args.udp_port, args.url)
                    if parsed_data.get("is_hex"):
                        print(f"       -> [HEX DECODED #{pkt_count}] BMP280: {parsed_data.get('temp_ext')}°C, {parsed_data.get('press')}hPa | DHT11: {parsed_data.get('temp_int')}°C, {parsed_data.get('hum')}% | MPU9250: P={parsed_data.get('pitch')}°, R={parsed_data.get('roll')}°, Y={parsed_data.get('yaw')}° | HW-072 LDR: {parsed_data.get('solar_kw')}kW")
                    else:
                        t_ext = parsed_data.get('temp_ext', 0.0)
                        batt = parsed_data.get('battery', 0.0)
                        r_val = parsed_data.get('rssi', 0.0)
                        d_val = parsed_data.get('doppler_hz', 0.0)
                        print(f"       -> Decoded #{pkt_count}: TempExt={t_ext}°C, Battery={batt}%, RSSI={r_val} dBm, Doppler={d_val} Hz")
    except KeyboardInterrupt:
        print("\n[LoRa Receiver] Stopping...")
    finally:
        ser.close()

if __name__ == "__main__":
    main()
