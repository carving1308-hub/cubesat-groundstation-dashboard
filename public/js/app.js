/**
 * Main Ground Station Dashboard Application Script
 * Manages WebSockets, Timers (HH:MM:SS), Leaflet Orbital Map, and Telemetry Charts
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------
    // 1. TIMERS (MET & UTC Clock in HH:MM:SS Format)
    // -------------------------------------------------------------------
    const metTimerEl = document.getElementById('met-timer');
    const utcTimerEl = document.getElementById('utc-timer');
    const footerTimerEl = document.getElementById('footer-timer');

    let metSecondsBase = 0;
    let metInterval = null;

    function formatHHMMSS(totalSeconds) {
        const hrs = Math.floor(totalSeconds / 3600);
        const mins = Math.floor((totalSeconds % 3600) / 60);
        const secs = Math.floor(totalSeconds % 60);
        return [hrs, mins, secs].map(v => String(v).padStart(2, '0')).join(':');
    }

    function updateClocks() {
        // Current UTC Clock
        const now = new Date();
        const utcStr = now.toISOString().substr(11, 8); // HH:MM:SS
        if (utcTimerEl) utcTimerEl.textContent = utcStr;
        if (footerTimerEl) footerTimerEl.textContent = utcStr;

        // Mission Elapsed Time (MET)
        metSecondsBase += 1;
        if (metTimerEl) metTimerEl.textContent = formatHHMMSS(metSecondsBase);
    }

    setInterval(updateClocks, 1000);
    updateClocks();

    // -------------------------------------------------------------------
    // 2. 3D CUBESAT INSTANCE
    // -------------------------------------------------------------------
    let cubesat3d = null;
    if (typeof CubeSat3D !== 'undefined') {
        cubesat3d = new CubeSat3D('cubesat-3d-canvas');
        
        const btnReset3d = document.getElementById('btn-reset-3d');
        if (btnReset3d) {
            btnReset3d.addEventListener('click', () => cubesat3d.resetView());
        }
    }

    // -------------------------------------------------------------------
    // 3. LEAFLET ORBITAL GPS MAP
    // -------------------------------------------------------------------
    const DEFAULT_LAT = 30.768776152974365;
    const DEFAULT_LON = 76.57395518470074;

    let map = null;
    let satMarker = null;
    let groundStationMarker = null;
    let footprintCircle = null;
    let orbitPolyline = null;
    const orbitPathCoords = [];

    function initMap(groundStation) {
        if (map) return;

        const gsLat = (groundStation && groundStation.lat) ? groundStation.lat : DEFAULT_LAT;
        const gsLon = (groundStation && groundStation.lon) ? groundStation.lon : DEFAULT_LON;

        // 1. Google Hybrid Satellite Tile Layer (High-Res Satellite + Road Networks + Labels)
        const googleHybridLayer = L.tileLayer('https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
            maxZoom: 20,
            subdomains: ['0', '1', '2', '3'],
            attribution: 'Google Hybrid Satellite'
        });

        // 2. Esri World Imagery Satellite Layer
        const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            attribution: 'Esri Satellite'
        });
        const esriRoadsOverlay = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
        const esriLabelsOverlay = L.tileLayer('https://services.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19 });
        const esriHybridLayer = L.layerGroup([esriSatLayer, esriRoadsOverlay, esriLabelsOverlay]);

        // 3. CartoDB Dark Aerospace Vector Layer
        const cartoDarkLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            maxZoom: 18,
            subdomains: 'abcd'
        });

        // Initialize Map default with Google Hybrid Satellite Layer
        map = L.map('gps-map', {
            zoomControl: true,
            attributionControl: false,
            layers: [googleHybridLayer]
        }).setView([gsLat, gsLon], 13);

        // Add Layer Switcher Control
        const baseMaps = {
            "🛰️ Hybrid Satellite (Google)": googleHybridLayer,
            "🌐 Hybrid Satellite (Esri)": esriHybridLayer,
            "🌌 CartoDB Dark Aerospace": cartoDarkLayer
        };

        L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);

        // Ground Station Icon & Marker
        const gsIcon = L.divIcon({
            className: 'gs-map-icon',
            html: `<div style="background:#2563EB; width:14px; height:14px; border-radius:50%; border:2px solid #FFF; box-shadow:0 0 12px #2563EB;"></div>`,
            iconSize: [14, 14]
        });
        groundStationMarker = L.marker([gsLat, gsLon], { icon: gsIcon }).addTo(map);
        groundStationMarker.bindTooltip(`<b>${groundStation ? groundStation.name : 'ALPHA-GS1'}</b><br>Lat: ${gsLat.toFixed(6)}°, Lon: ${gsLon.toFixed(6)}°`, { permanent: false });

        // Satellite Custom Pulse Icon
        const satIcon = L.divIcon({
            className: 'sat-map-icon',
            html: `<div style="position:relative; width:18px; height:18px;">
                    <div style="background:#0284C7; width:14px; height:14px; border-radius:50%; border:2px solid #FFF; box-shadow:0 0 14px #0284C7;"></div>
                    <div style="position:absolute; top:-4px; left:-4px; width:22px; height:22px; border:2px solid #0284C7; border-radius:50%; animation: pulse 1.5s infinite; opacity:0.6;"></div>
                   </div>`,
            iconSize: [18, 18]
        });
        satMarker = L.marker([gsLat, gsLon], { icon: satIcon }).addTo(map);

        // Coverage Footprint Circle
        footprintCircle = L.circle([gsLat, gsLon], {
            radius: 500000, // ~500 km radius
            color: '#0284C7',
            fillColor: '#0284C7',
            fillOpacity: 0.08,
            weight: 1,
            dashArray: '4, 4'
        }).addTo(map);

        // Orbit Ground Track Line
        orbitPolyline = L.polyline([[gsLat, gsLon]], {
            color: '#2563EB',
            weight: 2,
            opacity: 0.85,
            dashArray: '6, 6'
        }).addTo(map);
    }

    function updateMap(gps) {
        if (!map || !satMarker) return;

        const currentLat = (gps && gps.lat && gps.lat !== 0) ? gps.lat : DEFAULT_LAT;
        const currentLon = (gps && gps.lon && gps.lon !== 0) ? gps.lon : DEFAULT_LON;

        // Update Map HUD Text Overlays
        const latEl = document.getElementById('map-lat');
        if (latEl) latEl.textContent = `${currentLat.toFixed(4)}°`;
        const lonEl = document.getElementById('map-lon');
        if (lonEl) lonEl.textContent = `${currentLon.toFixed(4)}°`;
        const altEl = document.getElementById('map-alt');
        if (altEl && gps.alt_km !== undefined) altEl.textContent = `${gps.alt_km} km`;
        const spdEl = document.getElementById('map-spd');
        if (spdEl && gps.velocity_kms !== undefined) spdEl.textContent = `${gps.velocity_kms} km/s`;
        const satsEl = document.getElementById('map-sats');
        if (satsEl && gps.satellites !== undefined) satsEl.textContent = `${gps.satellites} FIX`;

        const newLatLng = [currentLat, currentLon];
        satMarker.setLatLng(newLatLng);
        footprintCircle.setLatLng(newLatLng);

        if (gps && (gps.lat !== 0 || gps.lon !== 0)) {
            orbitPathCoords.push(newLatLng);
            if (orbitPathCoords.length > 80) orbitPathCoords.shift();
            orbitPolyline.setLatLngs(orbitPathCoords);
        }

        map.panTo(newLatLng, { animate: true, duration: 0.5 });
    }

    // -------------------------------------------------------------------
    // 4. CHART.JS TELEMETRY GRAPHS (LIGHT THEME CONTROL)
    // -------------------------------------------------------------------
    const defaultChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: 'rgba(255, 255, 255, 0.95)',
                borderColor: '#0284C7',
                borderWidth: 1,
                titleColor: '#0F172A',
                bodyColor: '#334155',
                titleFont: { family: 'JetBrains Mono', size: 10 },
                bodyFont: { family: 'JetBrains Mono', size: 10 }
            }
        },
        scales: {
            x: {
                grid: { color: 'rgba(0, 0, 0, 0.05)' },
                ticks: { color: '#475569', font: { family: 'JetBrains Mono', size: 8 }, maxTicksLimit: 6 }
            },
            y: {
                grid: { color: 'rgba(0, 0, 0, 0.06)' },
                ticks: { color: '#475569', font: { family: 'JetBrains Mono', size: 8 } }
            }
        }
    };

    function createChart(canvasId, datasets) {
        const ctx = document.getElementById(canvasId);
        if (!ctx) return null;
        return new Chart(ctx, {
            type: 'line',
            data: { labels: [], datasets: datasets },
            options: JSON.parse(JSON.stringify(defaultChartOptions))
        });
    }

    // Chart 1: BMP280 External Environmental Sensors
    const chartEnv = createChart('chart-external', [
        { label: 'BMP280 Temp (°C)', data: [], borderColor: '#0284C7', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Pressure (hPa)', data: [], borderColor: '#D97706', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
    ]);
    if (chartEnv && chartEnv.options && chartEnv.options.scales) {
        chartEnv.options.scales.y1 = {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#D97706', font: { family: 'JetBrains Mono', size: 8 } }
        };
    }

    // Chart 2: DHT11 Internal Temperature & Thermal
    const chartInt = createChart('chart-internal', [
        { label: 'DHT11 Temp (°C)', data: [], borderColor: '#16A34A', borderWidth: 2, pointRadius: 0, tension: 0.3 }
    ]);

    // Chart 3: HW-072 LDR & Power Subsystem
    const chartPower = createChart('chart-power', [
        { label: 'Battery (%)', data: [], borderColor: '#0284C7', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'LDR Solar (kW)', data: [], borderColor: '#D97706', borderWidth: 2, pointRadius: 0, tension: 0.3 }
    ]);

    // Chart 4: MPU 9250 IMU Orientation & Motion
    const chartMotion = createChart('chart-motion', [
        { label: 'Pitch (°)', data: [], borderColor: '#0284C7', borderWidth: 1.5, pointRadius: 0 },
        { label: 'Roll (°)', data: [], borderColor: '#DC2626', borderWidth: 1.5, pointRadius: 0 },
        { label: 'Yaw (°)', data: [], borderColor: '#D97706', borderWidth: 1.5, pointRadius: 0 }
    ]);

    // Chart 5: 440 MHz LoRa RF Signal Quality from Frequency Medium
    const chartRf = createChart('chart-rf', [
        { label: 'RSSI (dBm)', data: [], borderColor: '#7C3AED', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'SNR (dB)', data: [], borderColor: '#0284C7', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
    ]);
    if (chartRf && chartRf.options && chartRf.options.scales) {
        chartRf.options.scales.y1 = {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#0284C7', font: { family: 'JetBrains Mono', size: 8 } }
        };
    }

    function updateCharts(history) {
        if (!history || history.length === 0) return;

        const labels = history.map(h => h.time);

        if (chartEnv) {
            chartEnv.data.labels = labels;
            chartEnv.data.datasets[0].data = history.map(h => h.temp_ext);
            chartEnv.data.datasets[1].data = history.map(h => h.press);
            chartEnv.update();
        }

        if (chartInt) {
            chartInt.data.labels = labels;
            chartInt.data.datasets[0].data = history.map(h => h.temp_int);
            chartInt.update();
        }

        if (chartPower) {
            chartPower.data.labels = labels;
            chartPower.data.datasets[0].data = history.map(h => h.battery);
            chartPower.data.datasets[1].data = history.map(h => h.solar_kw);
            chartPower.update();
        }

        if (chartMotion) {
            chartMotion.data.labels = labels;
            chartMotion.data.datasets[0].data = history.map(h => h.pitch);
            chartMotion.data.datasets[1].data = history.map(h => h.roll);
            chartMotion.data.datasets[2].data = history.map(h => h.yaw);
            chartMotion.update();
        }

        if (chartRf) {
            chartRf.data.labels = labels;
            chartRf.data.datasets[0].data = history.map(h => h.rssi);
            if (chartRf.data.datasets[1]) {
                chartRf.data.datasets[1].data = history.map(h => h.snr !== undefined ? h.snr : 0);
            }
            chartRf.update();
        }
    }

    // -------------------------------------------------------------------
    // 5. WEBSOCKET TELEMETRY STREAM & PACKET ACTIVITY WATCHDOG
    // -------------------------------------------------------------------
    let ws = null;
    let lastPacketTime = 0;

    function updatePacketActivityWatchdog() {
        const dot = document.getElementById('status-dot');
        const text = document.getElementById('status-text');
        if (!dot || !text) return;

        const now = Date.now();
        const timeSinceLastPacket = now - lastPacketTime;
        const isReceiving = lastPacketTime > 0 && timeSinceLastPacket < 3500;

        if (isReceiving) {
            dot.className = 'status-dot active';
            text.textContent = 'DATA RECEIVING';
            text.style.color = 'var(--accent-emerald)';
        } else {
            dot.className = 'status-dot idle';
            text.textContent = 'WAITING FOR DATA';
            text.style.color = 'var(--accent-amber)';
        }
    }

    setInterval(updatePacketActivityWatchdog, 1000);

    function notifyPacketReceived() {
        lastPacketTime = Date.now();
        updatePacketActivityWatchdog();
    }

    function connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WebSocket] Connected to Ground Station Telemetry Server');
            updatePacketActivityWatchdog();
        };

        ws.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'INITIAL_STATE') {
                    if (msg.ground_station) initMap(msg.ground_station);
                    if (msg.data && msg.data.met_seconds) metSecondsBase = msg.data.met_seconds;
                    if (msg.data) renderTelemetryData(msg.data);
                    if (msg.history) updateCharts(msg.history);
                    if (msg.data && msg.data.lora) updateLoraStatus(msg.data.lora);
                    if (msg.data && msg.data.last_sdr_packet_time && (Date.now() - msg.data.last_sdr_packet_time < 3500)) {
                        notifyPacketReceived();
                    }
                    if (msg.lora_logs && Array.isArray(msg.lora_logs)) {
                        msg.lora_logs.slice().reverse().forEach(pkt => appendTerminalPacket(pkt));
                    }
                } else if (msg.type === 'TELEMETRY_UPDATE') {
                    if (msg.data) renderTelemetryData(msg.data);
                    if (msg.history) updateCharts(msg.history);
                    if (msg.data && msg.data.lora) updateLoraStatus(msg.data.lora);
                    if (msg.data && msg.data.last_sdr_packet_time && (Date.now() - msg.data.last_sdr_packet_time < 3500)) {
                        notifyPacketReceived();
                    }
                } else if (msg.type === 'LORA_STATUS') {
                    updateLoraStatus(msg.lora);
                } else if (msg.type === 'LORA_PORTS') {
                    renderPortList(msg.ports);
                } else if (msg.type === 'LORA_PACKET') {
                    notifyPacketReceived();
                    appendTerminalPacket(msg.packet);
                    if (msg.data) renderTelemetryData(msg.data);
                } else if (msg.type === 'OV7670_FRAME_COMPLETE' || msg.type === 'OV7670_CHUNK_PROGRESS') {
                    notifyPacketReceived();
                    if (msg.camera) renderOv7670Camera(msg.camera);
                }
            } catch (e) {
                console.error('[WebSocket] Data Parse Error:', e);
            }
        };

        ws.onclose = () => {
            console.warn('[WebSocket] Disconnected. Reconnecting in 2s...');
            const textEl = document.getElementById('status-text');
            if (textEl) {
                textEl.textContent = 'OFFLINE';
                textEl.style.color = 'var(--accent-red)';
            }
            const dotEl = document.getElementById('status-dot');
            if (dotEl) dotEl.className = 'status-dot offline';
            setTimeout(connectWebSocket, 2000);
        };

        ws.onerror = (err) => {
            console.error('[WebSocket] Error:', err);
        };
    }

    connectWebSocket();

    // Render Telemetry Payload onto Dashboard Panels
    function renderTelemetryData(data) {
        if (!data) return;

        // Source Mode Indicator
        const sourceBadge = document.getElementById('source-badge');
        if (sourceBadge) {
            sourceBadge.textContent = data.source;
            if (data.source === 'LORA_LIVE') {
                sourceBadge.className = 'status-pill';
                sourceBadge.style.borderColor = 'var(--accent-emerald)';
                sourceBadge.style.color = 'var(--accent-emerald)';
            } else if (data.source === 'SDR_LIVE') {
                sourceBadge.className = 'status-pill';
                sourceBadge.style.borderColor = 'var(--accent-cyan)';
                sourceBadge.style.color = 'var(--accent-cyan)';
            } else {
                sourceBadge.className = 'status-pill simulating';
                sourceBadge.style.borderColor = '';
                sourceBadge.style.color = '';
            }
        }

        // Sensor Suite (BMP280, MPU9250, DHT11, NEO-6M, HW-072 LDR, OV7670)
        // 1. BMP280 Sensor (External Temp, Pressure, Altitude)
        const bmpTemp = (data.sensors && data.sensors.bmp280 && data.sensors.bmp280.temp_c !== undefined) ? data.sensors.bmp280.temp_c : (data.external ? data.external.temp_c : 0.0);
        const bmpPress = (data.sensors && data.sensors.bmp280 && data.sensors.bmp280.pressure_hpa !== undefined) ? data.sensors.bmp280.pressure_hpa : (data.external ? data.external.pressure_hpa : 0.0);
        const bmpAlt = (data.sensors && data.sensors.bmp280 && data.sensors.bmp280.altitude_m !== undefined) ? data.sensors.bmp280.altitude_m : (data.gps ? Math.round(data.gps.alt_km * 1000) : 0);

        const tempExtEl = document.getElementById('val-temp-ext');
        if (tempExtEl) tempExtEl.textContent = `${bmpTemp > 0 ? '+' : ''}${bmpTemp.toFixed(1)}`;

        const pressExtEl = document.getElementById('val-press-ext');
        if (pressExtEl) pressExtEl.textContent = `${bmpPress.toFixed(1)}`;

        const bmpAltEl = document.getElementById('val-bmp-alt');
        if (bmpAltEl) bmpAltEl.textContent = `${bmpAlt} m`;

        const bmpStatusEl = document.getElementById('val-bmp-status');
        if (bmpStatusEl) {
            const hasData = (data.rf && data.rf.packets_received > 0);
            bmpStatusEl.textContent = hasData ? (data.sensors?.bmp280?.status || 'NOMINAL') : 'STANDBY';
            bmpStatusEl.style.color = hasData ? 'var(--accent-emerald)' : 'var(--text-dim)';
        }

        // 2. DHT11 Sensor (Internal Cabin Temp & Humidity)
        const dhtTemp = (data.sensors && data.sensors.dht11 && data.sensors.dht11.temp_int_c !== undefined) ? data.sensors.dht11.temp_int_c : (data.internal ? data.internal.temp_c : 0.0);
        const dhtHum = (data.sensors && data.sensors.dht11 && data.sensors.dht11.humidity_pct !== undefined) ? data.sensors.dht11.humidity_pct : (data.external ? data.external.humidity_pct : 0.0);

        const tempIntEl = document.getElementById('val-temp-int');
        if (tempIntEl) tempIntEl.textContent = `${dhtTemp.toFixed(1)}`;

        const dhtHumEl = document.getElementById('val-hum-int');
        if (dhtHumEl) dhtHumEl.textContent = `${dhtHum.toFixed(1)}%`;

        if (data.internal) {
            const cpuEl = document.getElementById('val-temp-cpu');
            if (cpuEl) cpuEl.textContent = `${(data.internal.cpu_temp_c || 0).toFixed(1)}°C`;
            const busEl = document.getElementById('val-board-volt');
            if (busEl) busEl.textContent = `${(data.internal.board_voltage_v || 0).toFixed(2)} V`;
        }

        // 3. HW-072 LDR & EPS Subsystem
        const ldrKw = (data.sensors && data.sensors.hw072_ldr && data.sensors.hw072_ldr.solar_kw !== undefined) ? data.sensors.hw072_ldr.solar_kw : (data.power ? data.power.solar_panel_kw : 0.0);
        const ldrAdc = (data.sensors && data.sensors.hw072_ldr && data.sensors.hw072_ldr.raw_adc !== undefined) ? data.sensors.hw072_ldr.raw_adc : (data.power && data.power.ldr_raw ? data.power.ldr_raw : 0);

        const solarKwEl = document.getElementById('val-solar-kw');
        if (solarKwEl) solarKwEl.textContent = `${ldrKw.toFixed(3)}`;

        const ldrAdcEl = document.getElementById('val-ldr-raw');
        if (ldrAdcEl) ldrAdcEl.textContent = `${ldrAdc} / 1023`;

        if (data.power) {
            const battPctEl = document.getElementById('val-battery-pct');
            if (battPctEl) battPctEl.textContent = `${(data.power.battery_pct || 0).toFixed(1)}%`;
            const battVoltEl = document.getElementById('val-batt-volt');
            if (battVoltEl) battVoltEl.textContent = `${(data.power.battery_voltage_v || 0).toFixed(2)} V`;
            const eclipseEl = document.getElementById('val-eclipse');
            if (eclipseEl) eclipseEl.textContent = data.power.eclipse_status || 'STANDBY';
        }

        // 4. MPU 9250 9-DOF IMU & Orientation
        if (data.motion) {
            const pitch = data.motion.pitch_deg || 0;
            const roll = data.motion.roll_deg || 0;
            const yaw = data.motion.yaw_deg || 0;

            const subAnglesEl = document.getElementById('val-sub-angles');
            if (subAnglesEl) subAnglesEl.textContent = `${pitch.toFixed(1)}° / ${roll.toFixed(1)}°`;
            const yawEl = document.getElementById('val-imu-yaw');
            if (yawEl) yawEl.textContent = `${yaw.toFixed(1)}°`;

            const pitchMain = document.getElementById('val-pitch');
            if (pitchMain) pitchMain.textContent = `${pitch.toFixed(1)}°`;
            const rollMain = document.getElementById('val-roll');
            if (rollMain) rollMain.textContent = `${roll.toFixed(1)}°`;
            const yawMain = document.getElementById('val-yaw');
            if (yawMain) yawMain.textContent = `${yaw.toFixed(1)}°`;

            const gyroX = data.motion.gyro_x_dps || 0;
            const gyroY = data.motion.gyro_y_dps || 0;
            const gyroZ = data.motion.gyro_z_dps || 0;
            const gyroEl = document.getElementById('val-gyro-xyz');
            if (gyroEl) {
                gyroEl.textContent = `${gyroX.toFixed(1)}, ${gyroY.toFixed(1)}, ${gyroZ.toFixed(1)} °/s`;
            }

            const adcsEl = document.getElementById('val-adcs-status');
            if (adcsEl) adcsEl.textContent = data.motion.adcs_mode || 'STANDBY';

            if (cubesat3d) {
                cubesat3d.updateOrientation(pitch, roll, yaw, dhtTemp || 0);
            }
        }

        // 5. Ublox NEO-6M GPS & Orbital Track
        if (data.gps) {
            updateMap(data.gps);
            const sats = (data.sensors && data.sensors.neo6m && data.sensors.neo6m.satellites !== undefined) ? data.sensors.neo6m.satellites : (data.gps.satellites || 0);
            const mapSatsEl = document.getElementById('map-sats');
            if (mapSatsEl) mapSatsEl.textContent = `${sats} FIX`;
            const gpsTagEl = document.getElementById('gps-sats-tag');
            if (gpsTagEl) gpsTagEl.textContent = `NEO-6M (${sats} SATS)`;
        }

        // 6. Live Hexadecimal Frame Stream Strip
        const lastHex = (data.sensors && data.sensors.last_hex_frame) ? data.sensors.last_hex_frame : null;
        if (lastHex) {
            const hexStreamEl = document.getElementById('hex-code-stream');
            if (hexStreamEl) {
                const clean = lastHex.replace(/^5AA5|^AA55/i, '');
                hexStreamEl.textContent = clean;
            }
            const badgeEl = document.getElementById('hex-status-badge');
            if (badgeEl) {
                badgeEl.textContent = 'HEX DECODED';
                badgeEl.style.color = 'var(--accent-emerald)';
            }
        }

        // RF & Frequency Medium Parameters
        if (data.rf) {
            const rssiEl = document.getElementById('val-rssi');
            if (rssiEl) rssiEl.textContent = `${(data.rf.rssi_dbm || 0).toFixed(1)}`;

            const snrEl = document.getElementById('val-snr');
            if (snrEl) snrEl.textContent = `${(data.rf.snr_db || 0).toFixed(1)}`;

            const packetsEl = document.getElementById('val-packets');
            if (packetsEl) packetsEl.textContent = (data.rf.packets_received || 0).toLocaleString();

            const rfQualEl = document.getElementById('val-rf-quality');
            if (rfQualEl) rfQualEl.textContent = `${data.rf.link_quality_pct !== undefined ? data.rf.link_quality_pct : 0}%`;

            const dopplerEl = document.getElementById('val-rf-doppler');
            if (dopplerEl) dopplerEl.textContent = `${(data.rf.doppler_hz || 0).toFixed(1)} Hz`;

            const freqBadge = document.getElementById('rf-freq-badge');
            if (freqBadge) freqBadge.textContent = `${(data.rf.frequency_mhz || 440.000).toFixed(3)} MHz`;
        }

        // OV7670 Hexadecimal Camera Payload Stream
        if (data.camera) {
            renderOv7670Camera(data.camera);
        }
    }

    // OV7670 Hexadecimal Camera Stream & Decoder Handler
    function renderOv7670Camera(cam) {
        const frameTag = document.getElementById('cam-frame-id');
        if (frameTag) frameTag.textContent = `FRAME #${cam.frame_id}`;

        const fmtEl = document.getElementById('ov-fmt');
        if (fmtEl) fmtEl.textContent = cam.format || 'RGB565 HEX';

        const resEl = document.getElementById('ov-res');
        if (resEl) resEl.textContent = cam.resolution || '160x120';

        const statusBadge = document.getElementById('ov7670-status');
        const scanLine = document.getElementById('hex-scan-line');
        const counterEl = document.getElementById('hex-bytes-counter');
        const hexBox = document.getElementById('hex-stream-box');

        const totalBytes = cam.total_bytes || 38400;
        const rcvdBytes = cam.received_bytes || totalBytes;

        if (counterEl) {
            counterEl.textContent = `${rcvdBytes.toLocaleString()} / ${totalBytes.toLocaleString()} BYTES`;
        }

        // Display sample formatted hex lines in terminal box
        if (cam.hex_data && hexBox) {
            const hexClean = cam.hex_data.replace(/\s+/g, '');
            const line1 = hexClean.substr(0, 32).match(/.{1,2}/g)?.join(' ') || '';
            const line2 = hexClean.substr(32, 32).match(/.{1,2}/g)?.join(' ') || '';
            const line3 = hexClean.substr(64, 32).match(/.{1,2}/g)?.join(' ') || '';
            hexBox.innerHTML = `0000: ${line1}<br>0010: ${line2}<br>0020: ${line3}...`;
        }

        // Frame status handling & Hex-to-Photo Conversion
        if (cam.status === 'RECEIVING' && rcvdBytes < totalBytes) {
            if (statusBadge) {
                statusBadge.textContent = `RECEIVING HEX (${Math.round((rcvdBytes/totalBytes)*100)}%)`;
                statusBadge.className = 'ov7670-status-badge receiving';
            }
            if (scanLine) scanLine.classList.add('scanning');
        } else {
            if (statusBadge) {
                statusBadge.textContent = 'HEX DECODED (100%)';
                statusBadge.className = 'ov7670-status-badge complete';
            }
            if (scanLine) scanLine.classList.remove('scanning');

            // Decode Hexadecimal bytes into Canvas Photo
            if (cam.hex_data) {
                decodeOv7670HexToCanvas(cam.hex_data, 'ov7670-canvas', cam.format);
            }
        }
    }

    // OV7670 Hexadecimal-to-Photo Decoder
    function decodeOv7670HexToCanvas(hexString, canvasId, format = 'RGB565') {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        
        const cleanHex = hexString.replace(/[^0-9a-fA-F]/g, '');
        if (!cleanHex) return;

        // 1. JPEG Hex Decoding (Starts with FFD8)
        if (cleanHex.toLowerCase().startsWith('ffd8')) {
            const bytesMatch = cleanHex.match(/.{1,2}/g);
            if (!bytesMatch) return;
            const bytes = new Uint8Array(bytesMatch.map(b => parseInt(b, 16)));
            const blob = new Blob([bytes], { type: 'image/jpeg' });
            const imgUrl = URL.createObjectURL(blob);
            const img = new Image();
            img.onload = () => {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(imgUrl);
            };
            img.src = imgUrl;
            return;
        }

        // 2. Raw RGB565 / Pixel Stream Hex Decoding
        const width = canvas.width;
        const height = canvas.height;
        const imgData = ctx.createImageData(width, height);
        const numPixels = width * height;

        for (let i = 0; i < numPixels; i++) {
            const hexChunk = cleanHex.substr((i % (cleanHex.length / 4)) * 4, 4);
            if (hexChunk.length < 4) break;

            const val = parseInt(hexChunk, 16);
            const r5 = (val >> 11) & 0x1F;
            const g6 = (val >> 5) & 0x3F;
            const b5 = val & 0x1F;

            const r = Math.round((r5 * 255) / 31);
            const g = Math.round((g6 * 255) / 63);
            const b = Math.round((b5 * 255) / 31);

            const pixelIdx = i * 4;
            imgData.data[pixelIdx] = r;
            imgData.data[pixelIdx + 1] = g;
            imgData.data[pixelIdx + 2] = b;
            imgData.data[pixelIdx + 3] = 255;
        }

        ctx.putImageData(imgData, 0, 0);
    }

    // RESET DASHBOARD BUTTON LISTENER
    const btnResetDash = document.getElementById('btn-reset-dash');
    if (btnResetDash) {
        btnResetDash.addEventListener('click', resetDashboardToZero);
    }

    function resetDashboardToZero() {
        const elementsToZero = [
            { id: 'val-temp-ext', val: '0.0' },
            { id: 'val-press-ext', val: '0.0' },
            { id: 'val-bmp-alt', val: '0 m' },
            { id: 'val-bmp-status', val: 'STANDBY' },
            { id: 'val-temp-int', val: '0.0' },
            { id: 'val-hum-int', val: '0.0%' },
            { id: 'val-temp-cpu', val: '0.0°C' },
            { id: 'val-board-volt', val: '0.00 V' },
            { id: 'val-battery-pct', val: '0.0%' },
            { id: 'val-solar-kw', val: '0.000' },
            { id: 'val-ldr-raw', val: '0 / 1023' },
            { id: 'val-batt-volt', val: '0.00 V' },
            { id: 'val-solar-curr', val: '0.00 A' },
            { id: 'val-eclipse', val: 'STANDBY' },
            { id: 'val-pitch', val: '0.0°' },
            { id: 'val-roll', val: '0.0°' },
            { id: 'val-yaw', val: '0.0°' },
            { id: 'val-sub-angles', val: '0.0° / 0.0°' },
            { id: 'val-imu-yaw', val: '0.0°' },
            { id: 'val-gyro-xyz', val: '0.0, 0.0, 0.0 °/s' },
            { id: 'val-adcs-status', val: 'STANDBY' },
            { id: 'val-rssi', val: '0.0' },
            { id: 'val-snr', val: '0.0' },
            { id: 'val-rf-quality', val: '0%' },
            { id: 'val-rf-doppler', val: '0.0 Hz' },
            { id: 'val-packets', val: '0' },
            { id: 'map-lat', val: '30.7688°' },
            { id: 'map-lon', val: '76.5740°' },
            { id: 'map-alt', val: '0.0 km' },
            { id: 'map-spd', val: '0.00 km/s' },
            { id: 'map-sats', val: '0 FIX' },
            { id: 'gps-sats-tag', val: 'NEO-6M (0 SATS)' },
            { id: 'cam-frame-id', val: 'FRAME #0' }
        ];

        elementsToZero.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) el.textContent = item.val;
        });

        const bmpStatusEl = document.getElementById('val-bmp-status');
        if (bmpStatusEl) bmpStatusEl.style.color = 'var(--text-dim)';

        const camStatusEl = document.getElementById('ov7670-status');
        if (camStatusEl) {
            camStatusEl.textContent = 'STANDBY';
            camStatusEl.className = 'ov7670-status-badge';
        }

        const hexStreamEl = document.getElementById('hex-code-stream');
        if (hexStreamEl) hexStreamEl.textContent = 'AWAITING 440 MHz LoRa RF STREAM...';

        const hexBadgeEl = document.getElementById('hex-status-badge');
        if (hexBadgeEl) {
            hexBadgeEl.textContent = 'STANDBY';
            hexBadgeEl.style.color = 'var(--text-dim)';
        }

        // Reset orbit map coordinates to default reference location
        orbitPathCoords.length = 0;
        const resetPos = [DEFAULT_LAT, DEFAULT_LON];
        if (orbitPolyline) orbitPolyline.setLatLngs([resetPos]);
        if (satMarker) satMarker.setLatLng(resetPos);
        if (footprintCircle) footprintCircle.setLatLng(resetPos);
        if (map) map.panTo(resetPos);

        if (cubesat3d) {
            cubesat3d.updateOrientation(0, 0, 0, 0);
            cubesat3d.resetView();
        }

        const allCharts = [chartEnv, chartInt, chartPower, chartMotion, chartRf];
        allCharts.forEach(c => {
            if (c) {
                c.data.labels = [];
                c.data.datasets.forEach(ds => { ds.data = []; });
                c.update();
            }
        });

        const baudSelect = document.getElementById('lora-baud-select');
        if (baudSelect) baudSelect.value = "9600";

        const portSelect = document.getElementById('lora-port-select');
        if (portSelect) portSelect.value = "COM7";

        lastPacketTime = 0;
        updatePacketActivityWatchdog();

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'LORA_DISCONNECT' }));
            ws.send(JSON.stringify({ command: 'RESET_TELEMETRY' }));
        }
    }

    // Toggle Source Mode Button Listener
    const btnToggle = document.getElementById('btn-toggle-source');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const currentSource = document.getElementById('source-badge').textContent.trim();
            const newSource = currentSource === 'SIMULATOR' ? 'LORA_LIVE' : 'SIMULATOR';
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'SET_SOURCE', source: newSource }));
            }
        });
    }

    // Manual Camera Snapshot Button Listener
    const btnCam = document.getElementById('btn-trigger-cam');
    if (btnCam) {
        btnCam.addEventListener('click', () => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'TRIGGER_CAMERA' }));
            }
        });
    }

    // -------------------------------------------------------------------
    // 6. REAL-TIME 440 MHz LoRa MODULE INTERFACE & TERMINAL
    // -------------------------------------------------------------------
    const portSelect = document.getElementById('lora-port-select');
    const baudSelect = document.getElementById('lora-baud-select');
    const btnConnect = document.getElementById('btn-lora-connect');
    const btnConnectLabel = document.getElementById('btn-lora-connect-label');
    const linkDot = document.getElementById('lora-pulse-dot');
    const linkText = document.getElementById('lora-link-text');
    const footerLoraPort = document.getElementById('footer-lora-port');
    const modalBadge = document.getElementById('modal-conn-badge');
    const terminalWindow = document.getElementById('lora-terminal-window');
    const modalOverlay = document.getElementById('lora-modal-overlay');
    const cmdInput = document.getElementById('lora-cmd-input');
    const btnSendCmd = document.getElementById('btn-send-cmd');
    let isLoraConnected = false;

    function renderPortList(ports) {
        if (!portSelect) return;
        const currentVal = portSelect.value || 'COM7';
        portSelect.innerHTML = '';

        const portArray = (ports && Array.isArray(ports)) ? [...ports] : [];
        const hasCom7 = portArray.some(p => p.path && p.path.toUpperCase() === 'COM7');
        if (!hasCom7) {
            portArray.unshift({ path: 'COM7', friendlyName: 'COM7 - 440 MHz LoRa Module' });
        }

        let selected = false;
        portArray.forEach(p => {
            const opt = document.createElement('option');
            opt.value = p.path;
            opt.textContent = `${p.path} - ${p.friendlyName || p.manufacturer || 'Serial Device'}`;
            if (p.path.toUpperCase() === currentVal.toUpperCase() || (!selected && p.path.toUpperCase() === 'COM7')) {
                opt.selected = true;
                selected = true;
            }
            portSelect.appendChild(opt);
        });
    }

    async function fetchSerialPorts() {
        try {
            const res = await fetch('/api/lora/ports');
            const data = await res.json();
            if (data.ports) renderPortList(data.ports);
        } catch (e) {
            console.error('Failed to query COM ports:', e);
        }
    }

    function updateLoraStatus(lora) {
        if (!lora) return;
        isLoraConnected = lora.connected;

        if (btnConnect && btnConnectLabel) {
            if (lora.connected) {
                btnConnect.className = 'btn-lora-action connected';
                btnConnectLabel.textContent = 'DISCONNECT';
            } else if (lora.status === 'CONNECTING') {
                btnConnect.className = 'btn-lora-action';
                btnConnectLabel.textContent = 'CONNECTING...';
            } else {
                btnConnect.className = 'btn-lora-action connect';
                btnConnectLabel.textContent = 'CONNECT LORA';
            }
        }

        if (linkDot && linkText) {
            if (lora.connected) {
                linkDot.className = 'lora-pulse-dot connected';
                linkText.textContent = `${lora.port || 'LORA'} (440 MHz)`;
            } else if (lora.status === 'CONNECTING') {
                linkDot.className = 'lora-pulse-dot connecting';
                linkText.textContent = 'CONNECTING...';
            } else if (lora.status === 'ERROR') {
                linkDot.className = 'lora-pulse-dot';
                linkText.textContent = 'PORT ERROR';
            } else {
                linkDot.className = 'lora-pulse-dot';
                linkText.textContent = 'OFFLINE';
            }
        }

        if (footerLoraPort) {
            footerLoraPort.textContent = lora.connected ? `${lora.port} @ ${lora.baudRate} (440 MHz)` : 'DISCONNECTED';
        }

        if (modalBadge) {
            modalBadge.textContent = lora.connected ? `CONNECTED: ${lora.port} @ 440 MHz` : 'DISCONNECTED';
            modalBadge.className = lora.connected ? 'lora-modal-badge connected' : 'lora-modal-badge';
        }
    }

    function formatHexSpaced(hexStr) {
        if (!hexStr) return '';
        const clean = hexStr.replace(/[\s,:-]/g, '').toUpperCase();
        return clean.match(/.{1,4}/g) ? clean.match(/.{1,4}/g).join(' ') : clean;
    }

    function appendTerminalPacket(packet) {
        if (!terminalWindow || !packet) return;

        // Flash LED indicator on incoming packet
        if (linkDot && isLoraConnected) {
            linkDot.classList.add('receiving');
            setTimeout(() => linkDot.classList.remove('receiving'), 300);
        }

        const line = document.createElement('div');
        const timeStr = new Date(packet.timestamp || Date.now()).toISOString().substr(11, 8);

        if (packet.direction === 'TX') {
            line.className = 'term-line tx';
            line.innerHTML = `<span class="term-time">[${timeStr}]</span><span class="tx-tag">TX</span> <span>${escapeHtml(packet.raw)}</span>`;
        } else {
            line.className = 'term-line rx';
            const rssiStr = packet.rssi !== undefined && packet.rssi !== null ? `<span class="rssi-tag">[${packet.rssi} dBm / ${packet.snr || 0} dB]</span>` : '';
            
            const ccsds = packet.ccsds_header;
            const ccsdsTag = ccsds ? `<span style="background:rgba(0,240,255,0.15); color:#00F0FF; border:1px solid rgba(0,240,255,0.4); border-radius:3px; padding:1px 5px; font-weight:700; font-size:10px;">[CCSDS APID: 0x${(ccsds.apid || 1).toString(16).padStart(3,'0').toUpperCase()} Seq:#${ccsds.seq_count || 0} Len:${ccsds.data_len || 0}B]</span>` : '';
            
            const rawHexStr = packet.raw_hex ? formatHexSpaced(packet.raw_hex) : (packet.raw ? escapeHtml(packet.raw) : '');
            
            const d = packet.data;
            let decodedInfo = '';
            if (d) {
                const tempExt = d.temp_ext !== undefined ? `${d.temp_ext}°C` : '--';
                const press = d.press !== undefined ? `${d.press}hPa` : '--';
                const hum = d.hum !== undefined ? `${d.hum}%` : '--';
                const tempInt = d.temp_int !== undefined ? `${d.temp_int}°C` : '--';
                const batt = d.battery !== undefined ? `${d.battery}%` : '--';
                const solar = d.solar_kw !== undefined ? `${d.solar_kw}kW` : '--';
                const pitch = d.pitch !== undefined ? `${d.pitch}°` : '--';
                const roll = d.roll !== undefined ? `${d.roll}°` : '--';
                const yaw = d.yaw !== undefined ? `${d.yaw}°` : '--';
                const lat = d.lat !== undefined ? `${d.lat}°` : '--';
                const lon = d.lon !== undefined ? `${d.lon}°` : '--';

                decodedInfo = `<div style="margin-top:2px; color:#00E676; font-size:11px;">✓ CCSDS TM Decoded: TempExt=${tempExt}, Press=${press}, Hum=${hum}, CabinTemp=${tempInt}, Batt=${batt}, Solar=${solar}, Pitch=${pitch}, Roll=${roll}, Yaw=${yaw}, GPS=(${lat}, ${lon})</div>`;
            }

            line.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="term-time">[${timeStr}]</span>
                    <span class="rx-tag">RX 440MHz</span>
                    ${ccsdsTag}
                    ${rssiStr}
                </div>
                <div style="font-family:'JetBrains Mono',monospace; color:#E2E8F0; word-break:break-all; margin-top:2px; font-size:11px;">
                    <span style="color:#FFB703; font-weight:700;">HEX:</span> ${rawHexStr}
                </div>
                ${decodedInfo}
            `;
        }

        terminalWindow.appendChild(line);

        // Keep DOM clean
        while (terminalWindow.children.length > 250) {
            terminalWindow.removeChild(terminalWindow.firstChild);
        }

        terminalWindow.scrollTop = terminalWindow.scrollHeight;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    // Refresh COM ports button
    const btnRefresh = document.getElementById('btn-refresh-ports');
    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => {
            fetchSerialPorts();
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'LORA_LIST_PORTS' }));
            }
        });
    }

    // Connect / Disconnect button
    if (btnConnect) {
        btnConnect.addEventListener('click', async () => {
            if (isLoraConnected) {
                // Disconnect
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ command: 'LORA_DISCONNECT' }));
                } else {
                    await fetch('/api/lora/disconnect', { method: 'POST' });
                }
            } else {
                // Connect
                const selectedPort = portSelect ? portSelect.value : '';
                const selectedBaud = baudSelect ? parseInt(baudSelect.value, 10) : 115200;
                if (!selectedPort) {
                    alert('Please select a valid COM port or connect a LoRa USB receiver module.');
                    return;
                }
                if (ws && ws.readyState === WebSocket.OPEN) {
                    ws.send(JSON.stringify({ command: 'LORA_CONNECT', port: selectedPort, baudRate: selectedBaud }));
                } else {
                    await fetch('/api/lora/connect', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ port: selectedPort, baudRate: selectedBaud })
                    });
                }
            }
        });
    }

    // Open & Close Terminal Modal
    const btnOpenTerminal = document.getElementById('btn-open-terminal');
    const btnCloseModal = document.getElementById('btn-close-modal');
    if (btnOpenTerminal && modalOverlay) {
        btnOpenTerminal.addEventListener('click', () => {
            modalOverlay.classList.add('active');
            if (terminalWindow) terminalWindow.scrollTop = terminalWindow.scrollHeight;
        });
    }
    if (btnCloseModal && modalOverlay) {
        btnCloseModal.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
        });
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) {
                modalOverlay.classList.remove('active');
            }
        });
    }

    // Send Command Function
    function sendCommand(cmdStr) {
        if (!cmdStr || !cmdStr.trim()) return;
        const clean = cmdStr.trim();
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'LORA_SEND', data: clean }));
        } else {
            fetch('/api/lora/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: clean })
            });
        }
        if (cmdInput) cmdInput.value = '';
    }

    if (btnSendCmd) {
        btnSendCmd.addEventListener('click', () => {
            if (cmdInput) sendCommand(cmdInput.value);
        });
    }
    if (cmdInput) {
        cmdInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                sendCommand(cmdInput.value);
            }
        });
    }

    // Preset buttons
    const btnPresetFreq = document.getElementById('preset-freq-440');
    if (btnPresetFreq) {
        btnPresetFreq.addEventListener('click', () => sendCommand('AT+BAND=440000000'));
    }
    const btnPresetSf = document.getElementById('preset-sf-bw');
    if (btnPresetSf) {
        btnPresetSf.addEventListener('click', () => sendCommand('AT+PARAMETER=7,7,1,4'));
    }
    const btnPresetPing = document.getElementById('preset-at-ping');
    if (btnPresetPing) {
        btnPresetPing.addEventListener('click', () => sendCommand('AT'));
    }
    const btnClearConsole = document.getElementById('btn-clear-console');
    if (btnClearConsole && terminalWindow) {
        btnClearConsole.addEventListener('click', () => {
            terminalWindow.innerHTML = '';
        });
    }

    // Test Packet Injection (toolbar + modal preset)
    function injectTestPacket() {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'LORA_INJECT_TEST' }));
        } else {
            fetch('/api/lora/inject-test', { method: 'POST' });
        }
    }
    const btnInjectToolbar = document.getElementById('btn-inject-test-pkt');
    if (btnInjectToolbar) btnInjectToolbar.addEventListener('click', injectTestPacket);
    const btnInjectModal = document.getElementById('preset-inject-test');
    if (btnInjectModal) btnInjectModal.addEventListener('click', injectTestPacket);

    // -------------------------------------------------------------------
    // 7. MODAL TAB SWITCHER & OBC RECEIVER FIRMWARE COMPILER
    // -------------------------------------------------------------------
    const tabBtnMonitor = document.getElementById('modal-tab-monitor');
    const tabBtnCompiler = document.getElementById('modal-tab-compiler');
    const tabViewMonitor = document.getElementById('tab-view-monitor');
    const tabViewCompiler = document.getElementById('tab-view-obc');
    const obcEditor = document.getElementById('obc-editor-window');
    const obcConsole = document.getElementById('obc-console-window');
    const obcBoardSelect = document.getElementById('obc-board-select');
    const obcTargetPort = document.getElementById('obc-target-port');

    if (tabBtnMonitor && tabBtnCompiler) {
        tabBtnMonitor.addEventListener('click', () => {
            tabBtnMonitor.classList.add('active');
            tabBtnCompiler.classList.remove('active');
            if (tabViewMonitor) tabViewMonitor.style.display = 'block';
            if (tabViewCompiler) tabViewCompiler.style.display = 'none';
        });

        tabBtnCompiler.addEventListener('click', () => {
            tabBtnCompiler.classList.add('active');
            tabBtnMonitor.classList.remove('active');
            if (tabViewCompiler) tabViewCompiler.style.display = 'block';
            if (tabViewMonitor) tabViewMonitor.style.display = 'none';
            loadObcFirmwareSource();
        });
    }

    async function loadObcFirmwareSource() {
        if (!obcEditor || obcEditor.getAttribute('data-loaded') === 'true') return;
        try {
            const res = await fetch('/api/obc/firmware');
            const data = await res.json();
            if (data.code) {
                obcEditor.value = data.code;
                obcEditor.setAttribute('data-loaded', 'true');
            }
        } catch (e) {
            console.error('Failed to load OBC firmware source:', e);
        }
    }

    function appendObcConsoleLog(msg, type = 'normal') {
        if (!obcConsole) return;
        const line = document.createElement('div');
        line.className = `obc-log-line ${type}`;
        line.textContent = `[${new Date().toISOString().substr(11, 8)}] ${msg}`;
        obcConsole.appendChild(line);
        obcConsole.scrollTop = obcConsole.scrollHeight;
    }

    // Compile OBC Receiver Code Button Listener
    const btnCompileObc = document.getElementById('btn-compile-obc');
    if (btnCompileObc) {
        btnCompileObc.addEventListener('click', async () => {
            const board = obcBoardSelect ? obcBoardSelect.value : 'ESP32 WROOM';
            const code = obcEditor ? obcEditor.value : '';

            appendObcConsoleLog(`--------------------------------------------------`, 'highlight');
            appendObcConsoleLog(`[COMPILER] Initiating compilation for ${board}...`, 'info');

            try {
                const res = await fetch('/api/obc/compile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ board, code, frequency_mhz: 440.000 })
                });
                const data = await res.json();
                if (data.logs) {
                    data.logs.forEach(l => {
                        const logType = l.includes('SUCCESS') ? 'success' : (l.includes('GCC') || l.includes('Linker') ? 'info' : 'normal');
                        appendObcConsoleLog(l, logType);
                    });
                }
            } catch (err) {
                appendObcConsoleLog(`[ERROR] Compilation failed: ${err.message}`, 'highlight');
            }
        });
    }

    // Flash OBC Receiver Firmware to Board on COM7 Listener
    const btnFlashObc = document.getElementById('btn-flash-obc');
    if (btnFlashObc) {
        btnFlashObc.addEventListener('click', async () => {
            const board = obcBoardSelect ? obcBoardSelect.value : 'ESP32 WROOM';
            const targetPort = (portSelect && portSelect.value) ? portSelect.value : 'COM7';
            const targetBaud = (baudSelect && baudSelect.value) ? parseInt(baudSelect.value, 10) : 115200;

            if (obcTargetPort) obcTargetPort.textContent = targetPort;

            appendObcConsoleLog(`--------------------------------------------------`, 'highlight');
            appendObcConsoleLog(`[FLASHER] Starting firmware flashing to ${targetPort} @ ${targetBaud} baud...`, 'info');

            try {
                const res = await fetch('/api/obc/flash', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ board, port: targetPort, baudRate: targetBaud })
                });
                const data = await res.json();
                if (data.logs) {
                    data.logs.forEach(l => {
                        const logType = l.includes('SUCCESS') ? 'success' : (l.includes('Flasher') ? 'info' : 'normal');
                        appendObcConsoleLog(l, logType);
                    });
                }
            } catch (err) {
                appendObcConsoleLog(`[ERROR] Flashing failed: ${err.message}`, 'highlight');
            }
        });
    }

    // Initial port load
    fetchSerialPorts();
});


