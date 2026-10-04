#!/usr/bin/env python3
"""
SDR Telemetry Transmitter Client Script
Sends 6U CubeSat telemetry packets over UDP/TCP to the Ground Station SDR receiver port.

Usage:
  py sdr_telemetry_client.py --host localhost --port 7373 --protocol udp
  py sdr_telemetry_client.py --host localhost --port 12345 --protocol tcp
"""

import socket
import json
import time
import math
import random
import argparse
import urllib.request

def encode_ccsds_packet(p, apid=0x001, seq=1):
    def to_h16(v, signed=False):
        val = int(round(v))
        if signed and val < 0: val = 65536 + val
        return f"{val & 0xFFFF:04X}"
    def to_h32(v, signed=False):
        val = int(round(v))
        if signed and val < 0: val = 4294967296 + val
        return f"{val & 0xFFFFFFFF:08X}"
    def to_h8(v):
        return f"{int(round(v)) & 0xFF:02X}"

    payload = (
        to_h16(p["temp_ext"] * 100, True) +
        to_h32(p["press"] * 100, False) +
        to_h8(p["hum"]) +
        to_h8(p["temp_int"]) +
        to_h16(p["solar_kw"] * 1000, False) +
        to_h8(p["battery"]) +
        to_h16(8.28 * 1000, False) +
        to_h16(p["pitch"] * 100, True) +
        to_h16(p["roll"] * 100, True) +
        to_h16((p["yaw"] % 360) * 100, False) +
        to_h16(0, True) + to_h16(0, True) + to_h16(0, True) +
        to_h32(p["lat"] * 1000000, True) +
        to_h32(p["lon"] * 1000000, True) +
        to_h16(p["alt"] * 10, True) +
        to_h8(8) +
        to_h16(p["rssi"] * 10, True) +
        to_h16(p["snr"] * 10, True)
    )

    now_sec = int(time.time())
    now_sub = int((time.time() % 1.0) * 65536)
    sec_hdr = f"{to_h32(now_sec)}{to_h16(now_sub)}"

    data_len_field = int((len(sec_hdr) + len(payload)) / 2) - 1
    w0 = 0x0800 | (apid & 0x7FF)
    w1 = 0xC000 | (seq & 0x3FFF)
    w2 = data_len_field & 0xFFFF

    primary_hdr = f"{to_h16(w0)}{to_h16(w1)}{to_h16(w2)}"
    return f"{primary_hdr}{sec_hdr}{payload}"

def main():
    parser = argparse.ArgumentParser(description="Send SDR Telemetry Packets to 6U CubeSat Ground Station Server")
    parser.add_argument("--host", default="127.0.0.1", help="Ground Station Server Host IP")
    parser.add_argument("--port", type=int, default=7373, help="SDR Receiver Port (7373 for UDP, 12345 for TCP)")
    parser.add_argument("--protocol", choices=["udp", "tcp", "http"], default="udp", help="Protocol: udp, tcp, or http")
    parser.add_argument("--format", choices=["ccsds", "json"], default="ccsds", help="Packet format: ccsds or json")
    parser.add_argument("--url", default="http://localhost:3000/api/sdr/telemetry", help="Target HTTP API URL (for cloud/Render deployment)")
    parser.add_argument("--send-cam", action="store_true", help="Send OV7670 camera hex chunks")
    parser.add_argument("--delay", type=float, default=1.0, help="Delay interval between packets in seconds")
    args = parser.parse_args()

    print("==================================================================")
    if args.protocol == "http":
        print(f"[SDR TRANSMITTER] Transmitting to HTTP URL: {args.url}")
    else:
        print(f"[SDR TRANSMITTER] Transmitting to {args.host}:{args.port} ({args.protocol.upper()})")
    print("==================================================================")

    sock = None
    if args.protocol == "tcp":
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.connect((args.host, args.port))
        print("Connected to TCP SDR Receiver Port!")
    elif args.protocol == "udp":
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)

    t = 0.0
    packet_count = 0
    cam_frame_id = 900

    try:
        while True:
            t += 0.2
            packet_count += 1

            if args.send_cam and packet_count % 4 == 0:
                cam_frame_id += 1
                total_chunks = 4
                chunk_len = 9600 * 2
                full_hex = ""
                for y in range(120):
                    for x in range(160):
                        r = int((x / 160.0) * 255)
                        g = int((y / 120.0) * 255)
                        b = int(128 + 127 * math.sin(t))
                        r5 = (r >> 3) & 0x1F
                        g6 = (g >> 2) & 0x3F
                        b5 = (b >> 3) & 0x1F
                        val = (r5 << 11) | (g6 << 5) | b5
                        full_hex += f"{val:04X}"

                for c_idx in range(total_chunks):
                    c_start = c_idx * chunk_len
                    c_hex = full_hex[c_start:c_start + chunk_len]
                    cam_payload = {
                        "frame_id": cam_frame_id,
                        "chunk_index": c_idx,
                        "total_chunks": total_chunks,
                        "cam_chunk": c_hex,
                        "format": "RGB565 HEX",
                        "resolution": "160x120"
                    }
                    cam_bytes = (json.dumps(cam_payload) + "\n").encode('utf-8')
                    if args.protocol == "http":
                        req = urllib.request.Request("http://localhost:3000/api/ov7670/chunk", data=cam_bytes, headers={'Content-Type': 'application/json'})
                        with urllib.request.urlopen(req) as resp: pass
                    elif args.protocol == "tcp":
                        sock.sendall(cam_bytes)
                    else:
                        sock.sendto(cam_bytes, (args.host, args.port))
                    print(f"[{time.strftime('%H:%M:%S')}] Transmitted OV7670 Cam Chunk #{c_idx+1}/{total_chunks} for Frame #{cam_frame_id}")
                    time.sleep(0.1)

            # Standard telemetry payload
            payload = {
                "packet_id": packet_count,
                "timestamp": int(time.time() * 1000),
                "temp_ext": round(18.5 + 25.0 * math.sin(t * 0.1) + random.uniform(-0.3, 0.3), 2),
                "press": round(1013.25 + 3.0 * math.cos(t * 0.05), 2),
                "hum": round(45.0 + 5.0 * math.sin(t * 0.08), 1),
                "temp_int": round(22.1 + 3.5 * math.sin(t * 0.05), 1),
                "battery": round(max(20.0, min(100.0, 85.0 + 10.0 * math.sin(t * 0.02))), 1),
                "solar_kw": round(max(0.0, 0.65 * math.sin(t * 0.05) + random.uniform(0.0, 0.05)), 3),
                "pitch": round(15.0 * math.sin(t * 0.15), 2),
                "roll": round(-10.0 * math.cos(t * 0.12), 2),
                "yaw": round((t * 5.0) % 360, 2),
                "lat": round(28.6139 + 5.0 * math.sin(t * 0.03), 4),
                "lon": round(77.2090 + 5.0 * math.cos(t * 0.03), 4),
                "alt": round(512.0 + 2.0 * math.sin(t * 0.1), 1),
                "rssi": round(-72.0 + random.uniform(-2.0, 2.0), 1),
                "snr": round(19.2 + random.uniform(-0.5, 0.5), 1)
            }

            if args.format == "ccsds":
                ccsds_hex = encode_ccsds_packet(payload, apid=0x001, seq=packet_count)
                msg_bytes = (ccsds_hex + "\n").encode('utf-8')
                tx_label = f"CCSDS Space Packet Hex ({ccsds_hex[:24]}...)"
            else:
                msg_bytes = (json.dumps(payload) + "\n").encode('utf-8')
                tx_label = f"JSON Payload"

            if args.protocol == "http":
                content_type = 'text/plain' if args.format == "ccsds" else 'application/json'
                req = urllib.request.Request(args.url, data=msg_bytes, headers={'Content-Type': content_type})
                with urllib.request.urlopen(req) as resp:
                    pass
            elif args.protocol == "tcp":
                sock.sendall(msg_bytes)
            else:
                sock.sendto(msg_bytes, (args.host, args.port))

            print(f"[{time.strftime('%H:%M:%S')}] Transmitted Packet #{packet_count} [{tx_label}] -> TempExt={payload['temp_ext']}°C, Batt={payload['battery']}%, Pitch={payload['pitch']}°")
            time.sleep(args.delay)

    except KeyboardInterrupt:
        print("\nStopping SDR Telemetry Transmission...")
    finally:
        if sock:
            sock.close()

if __name__ == "__main__":
    main()
