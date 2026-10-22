/**
 * Main Ground Station Dashboard Application Script
 * Manages WebSockets, Timers (HH:MM:SS), Leaflet Orbital Map, and Telemetry Charts
 */

document.addEventListener('DOMContentLoaded', () => {
    // -------------------------------------------------------------------
    // 0. HIGH-SPEED DOM CACHE & DIRTY-CHECKING ENGINE
    // -------------------------------------------------------------------
    let currentActiveScreen = 1;
    const DOM_CACHE = new Map();
    function getCachedEl(id) {
        if (DOM_CACHE.has(id)) {
            return DOM_CACHE.get(id);
        }
        const el = document.getElementById(id);
        DOM_CACHE.set(id, el);
        return el;
    }

    function setElText(id, str) {
        const el = getCachedEl(id);
        if (el && el.textContent !== str) {
            el.textContent = str;
        }
    }

    function setElClass(id, cls) {
        const el = getCachedEl(id);
        if (el && el.className !== cls) {
            el.className = cls;
        }
    }

    function setElStyleWidth(id, widthStr) {
        const el = getCachedEl(id);
        if (el && el.style.width !== widthStr) {
            el.style.width = widthStr;
        }
    }

    function setElStyleColor(id, colorStr) {
        const el = getCachedEl(id);
        if (el && el.style.color !== colorStr) {
            el.style.color = colorStr;
        }
    }

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
            
        };

        L.control.layers(baseMaps, null, { position: 'topright', collapsed: true }).addTo(map);

        // Ground Station Icon & Marker (Blue & White)
        const gsIcon = L.divIcon({
            className: 'gs-map-icon',
            html: `<div style="background:#2563EB; width:14px; height:14px; border-radius:50%; border:2px solid #FFFFFF; box-shadow:0 0 10px rgba(37,99,235,0.7);"></div>`,
            iconSize: [14, 14]
        });
        groundStationMarker = L.marker([gsLat, gsLon], { icon: gsIcon }).addTo(map);
        groundStationMarker.bindTooltip(`<b>${groundStation ? groundStation.name : 'ALPHA-GS1'}</b><br>Lat: ${gsLat.toFixed(6)}°, Lon: ${gsLon.toFixed(6)}°`, { permanent: false });

        // Satellite Custom Pulse Icon (Red & White)
        const satIcon = L.divIcon({
            className: 'sat-map-icon',
            html: `<div style="position:relative; width:18px; height:18px;">
                    <div style="background:#DC2626; width:14px; height:14px; border-radius:50%; border:2px solid #FFFFFF; box-shadow:0 0 12px rgba(220,38,38,0.85);"></div>
                    <div style="position:absolute; top:-4px; left:-4px; width:22px; height:22px; border:2px solid #DC2626; border-radius:50%; animation: pulse 1.5s infinite; opacity:0.6;"></div>
                   </div>`,
            iconSize: [18, 18]
        });
        satMarker = L.marker([gsLat, gsLon], { icon: satIcon }).addTo(map);

        // Coverage Footprint Circle
        footprintCircle = L.circle([gsLat, gsLon], {
            radius: 500000, // ~500 km radius
            color: '#2563EB',
            fillColor: '#DBEAFE',
            fillOpacity: 0.22,
            weight: 1.5,
            dashArray: '4, 4'
        }).addTo(map);

        // Orbit Ground Track Line
        orbitPolyline = L.polyline([[gsLat, gsLon]], {
            color: '#2563EB',
            weight: 2.5,
            opacity: 0.9,
            dashArray: '6, 6'
        }).addTo(map);
    }

    function updateMap(gps) {
        if (!map || !satMarker) return;

        // Keep map location permanently locked to given reference latitude and longitude
        const currentLat = DEFAULT_LAT;
        const currentLon = DEFAULT_LON;

        // Update Map HUD Text Overlays locked to exact coordinates
        setElText('map-lat', `${currentLat.toFixed(6)}°`);
        setElText('map-lon', `${currentLon.toFixed(6)}°`);
        if (gps && gps.alt_km !== undefined) setElText('map-alt', `${gps.alt_km} km`);
        if (gps && gps.velocity_kms !== undefined) setElText('map-spd', `${gps.velocity_kms} km/s`);
        if (gps && gps.satellites !== undefined) setElText('map-sats', `${gps.satellites} FIX`);

        const fixedLatLng = [DEFAULT_LAT, DEFAULT_LON];
        satMarker.setLatLng(fixedLatLng);
        if (groundStationMarker) groundStationMarker.setLatLng(fixedLatLng);
        if (footprintCircle) footprintCircle.setLatLng(fixedLatLng);
        if (orbitPolyline) orbitPolyline.setLatLngs([fixedLatLng]);
    }

    // -------------------------------------------------------------------
    // -------------------------------------------------------------------
    // 4. CHART.JS TELEMETRY GRAPHS (SATELLITE MISSION PROFILE THEME)
    // -------------------------------------------------------------------
    const defaultChartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: '#FFFFFF',
                borderColor: '#E4E9E6',
                borderWidth: 1,
                titleColor: '#202622',
                bodyColor: '#515B55',
                titleFont: { family: 'Inter', size: 11, weight: '600' },
                bodyFont: { family: 'JetBrains Mono', size: 10 }
            }
        },
        scales: {
            x: {
                grid: { color: '#E4E9E6' },
                ticks: { color: '#77817B', font: { family: 'Inter', size: 9, weight: '600' }, maxTicksLimit: 6 }
            },
            y: {
                grid: { color: '#E4E9E6' },
                ticks: { color: '#77817B', font: { family: 'Inter', size: 9, weight: '600' } }
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

    // Real-Time Launch Altitude Trajectory Profile Chart (m vs time)
    const chartAltitudeProfile = createChart('chart-altitude-profile', [
        {
            label: 'Altitude (m)',
            data: [],
            borderColor: '#159B72',
            backgroundColor: 'rgba(21, 155, 114, 0.08)',
            fill: true,
            borderWidth: 2.5,
            pointRadius: 0,
            tension: 0.35
        }
    ]);

    // Chart 1: HW-072 LDR Optical & Illuminance Sensors
    const chartEnv = createChart('chart-external', [
        { label: 'Illuminance (Lux)', data: [], borderColor: '#159B72', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'Raw ADC (0-1023)', data: [], borderColor: '#D49A2A', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
    ]);
    if (chartEnv && chartEnv.options && chartEnv.options.scales) {
        chartEnv.options.scales.y1 = {
            position: 'right',
            min: 0,
            max: 1023,
            grid: { drawOnChartArea: false },
            ticks: { color: '#8B72E8', font: { family: 'Inter', size: 9, weight: '600' } }
        };
    }

    // Chart 2: DHT11 Internal Temperature & Thermal
    const chartInt = createChart('chart-internal', [
        { label: 'DHT11 Temp (°C)', data: [], borderColor: '#D49A2A', borderWidth: 2, pointRadius: 0, tension: 0.3 }
    ]);

    // Chart 3: HW-072 LDR & Power Subsystem
    const chartPower = createChart('chart-power', [
        { label: 'Battery (%)', data: [], borderColor: '#159B72', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'LDR Solar (kW)', data: [], borderColor: '#D49A2A', borderWidth: 2, pointRadius: 0, tension: 0.3 }
    ]);

    // Chart 4: MPU 9250 IMU Orientation & Motion
    const chartMotion = createChart('chart-motion', [
        { label: 'Pitch (°)', data: [], borderColor: '#159B72', borderWidth: 1.5, pointRadius: 0 },
        { label: 'Roll (°)', data: [], borderColor: '#D49A2A', borderWidth: 1.5, pointRadius: 0 },
        { label: 'Yaw (°)', data: [], borderColor: '#1D4ED8', borderWidth: 1.5, pointRadius: 0 }
    ]);

    // Chart 5: 440 MHz LoRa RF Signal Quality from Frequency Medium
    const chartRf = createChart('chart-rf', [
        { label: 'RSSI (dBm)', data: [], borderColor: '#159B72', borderWidth: 2, pointRadius: 0, tension: 0.3 },
        { label: 'SNR (dB)', data: [], borderColor: '#D49A2A', borderWidth: 1.5, pointRadius: 0, tension: 0.3, yAxisID: 'y1' }
    ]);
    if (chartRf && chartRf.options && chartRf.options.scales) {
        chartRf.options.scales.y1 = {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#8B72E8', font: { family: 'Inter', size: 9, weight: '600' } }
        };
    }

    // -------------------------------------------------------------------
    // HIGH-SPEED GRAPH ENGINE: requestAnimationFrame & INCREMENTAL UPDATES
    // -------------------------------------------------------------------
    let chartRenderPending = false;
    let lastChartUpdateTime = 0;

    function requestChartDraw(force = false) {
        const now = performance.now();
        // Redraw canvases at high-speed 40-50 Hz rate (~20ms) for ultra-fast response
        if (!force && (chartRenderPending || (now - lastChartUpdateTime < 20))) return;

        chartRenderPending = true;
        requestAnimationFrame(() => {
            chartRenderPending = false;
            lastChartUpdateTime = performance.now();
            if (currentActiveScreen === 1) {
                if (chartAltitudeProfile) chartAltitudeProfile.update('none');
                if (chartEnv) chartEnv.update('none');
                if (chartInt) chartInt.update('none');
                if (chartPower) chartPower.update('none');
                if (chartRf) chartRf.update('none');
            } else if (currentActiveScreen === 2) {
                if (chartMotion) chartMotion.update('none');
            }
        });
    }

    function appendChartPoint(p) {
        if (!p) return;
        const timeLabel = p.time || new Date().toISOString().substr(11, 8);

        if (chartAltitudeProfile) {
            chartAltitudeProfile.data.labels.push(timeLabel);
            chartAltitudeProfile.data.datasets[0].data.push(p.alt_m !== undefined ? p.alt_m : 0);
            if (chartAltitudeProfile.data.labels.length > 50) {
                chartAltitudeProfile.data.labels.shift();
                chartAltitudeProfile.data.datasets[0].data.shift();
            }
        }

        if (chartEnv) {
            chartEnv.data.labels.push(timeLabel);
            chartEnv.data.datasets[0].data.push(p.temp_ext);
            chartEnv.data.datasets[1].data.push(p.press);
            if (chartEnv.data.labels.length > 50) {
                chartEnv.data.labels.shift();
                chartEnv.data.datasets[0].data.shift();
                chartEnv.data.datasets[1].data.shift();
            }
        }

        if (chartInt) {
            chartInt.data.labels.push(timeLabel);
            chartInt.data.datasets[0].data.push(p.temp_int);
            if (chartInt.data.labels.length > 50) {
                chartInt.data.labels.shift();
                chartInt.data.datasets[0].data.shift();
            }
        }

        if (chartPower) {
            chartPower.data.labels.push(timeLabel);
            chartPower.data.datasets[0].data.push(p.battery);
            chartPower.data.datasets[1].data.push(p.solar_kw);
            if (chartPower.data.labels.length > 50) {
                chartPower.data.labels.shift();
                chartPower.data.datasets[0].data.shift();
                chartPower.data.datasets[1].data.shift();
            }
        }

        if (chartMotion) {
            chartMotion.data.labels.push(timeLabel);
            chartMotion.data.datasets[0].data.push(p.pitch);
            chartMotion.data.datasets[1].data.push(p.roll);
            chartMotion.data.datasets[2].data.push(p.yaw);
            if (chartMotion.data.labels.length > 50) {
                chartMotion.data.labels.shift();
                chartMotion.data.datasets[0].data.shift();
                chartMotion.data.datasets[1].data.shift();
                chartMotion.data.datasets[2].data.shift();
            }
        }

        if (chartRf) {
            chartRf.data.labels.push(timeLabel);
            chartRf.data.datasets[0].data.push(p.rssi);
            if (chartRf.data.datasets[1]) chartRf.data.datasets[1].data.push(p.snr !== undefined ? p.snr : 0);
            if (chartRf.data.labels.length > 50) {
                chartRf.data.labels.shift();
                chartRf.data.datasets[0].data.shift();
                if (chartRf.data.datasets[1]) chartRf.data.datasets[1].data.shift();
            }
        }

        requestChartDraw();
    }

    function updateCharts(history) {
        if (!history || history.length === 0) return;

        const labels = history.map(h => h.time);

        if (chartAltitudeProfile) {
            chartAltitudeProfile.data.labels = labels;
            chartAltitudeProfile.data.datasets[0].data = history.map(h => (h.alt_m !== undefined ? h.alt_m : 0));
        }

        if (chartEnv) {
            chartEnv.data.labels = labels;
            chartEnv.data.datasets[0].data = history.map(h => h.temp_ext);
            chartEnv.data.datasets[1].data = history.map(h => h.press);
        }

        if (chartInt) {
            chartInt.data.labels = labels;
            chartInt.data.datasets[0].data = history.map(h => h.temp_int);
        }

        if (chartPower) {
            chartPower.data.labels = labels;
            chartPower.data.datasets[0].data = history.map(h => h.battery);
            chartPower.data.datasets[1].data = history.map(h => h.solar_kw);
        }

        if (chartMotion) {
            chartMotion.data.labels = labels;
            chartMotion.data.datasets[0].data = history.map(h => h.pitch);
            chartMotion.data.datasets[1].data = history.map(h => h.roll);
            chartMotion.data.datasets[2].data = history.map(h => h.yaw);
        }

        if (chartRf) {
            chartRf.data.labels = labels;
            chartRf.data.datasets[0].data = history.map(h => h.rssi);
            if (chartRf.data.datasets[1]) {
                chartRf.data.datasets[1].data = history.map(h => h.snr !== undefined ? h.snr : 0);
            }
        }

        requestChartDraw();
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
            if (dot.className !== 'status-dot active') dot.className = 'status-dot active';
            if (text.textContent !== 'DATA RECEIVING') {
                text.textContent = 'DATA RECEIVING';
                text.style.color = 'var(--pal-blue)';
            }
        } else {
            if (dot.className !== 'status-dot idle') dot.className = 'status-dot idle';
            if (text.textContent !== 'WAITING FOR DATA') {
                text.textContent = 'WAITING FOR DATA';
                text.style.color = 'var(--pal-red)';
            }
        }
    }

    setInterval(updatePacketActivityWatchdog, 1000);

    function notifyPacketReceived(rssi, snr) {
        lastPacketTime = Date.now();
        updatePacketActivityWatchdog();
        if (cubesat3d && cubesat3d.triggerPacketPulse) {
            cubesat3d.triggerPacketPulse(rssi, snr);
        }
    }

    // Initialize map immediately on startup
    initMap({ lat: DEFAULT_LAT, lon: DEFAULT_LON, name: 'ALPHA-GS1' });
    setTimeout(() => { if (map) map.invalidateSize(); }, 100);

    // Standalone / Offline Client-Side Telemetry Simulator
    let clientSimInterval = null;
    let clientSimAngle = 0;
    let clientSimCount = 0;
    let clientSimFlightTime = 18.0; // Starts in powered ascent (>1000m increasing)
    const clientHistory = [];

    function startClientSimulator() {
        if (clientSimInterval) return;
        console.log('[GroundStation] Running autonomous flight telemetry simulation engine...');
        
        if (!map) {
            initMap({ lat: DEFAULT_LAT, lon: DEFAULT_LON, name: 'ALPHA-GS1' });
        }

        clientSimInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
                stopClientSimulator();
                return;
            }

            clientSimAngle += 0.008;
            clientSimCount++;
            clientSimFlightTime += 0.06;
            if (clientSimFlightTime >= 80.0) {
                clientSimFlightTime = 0.0;
            }

            // Launch Profile Phase Calculation
            let phase = 'LAUNCHING';
            let phaseLabel = 'LAUNCH PAD (T-0)';
            let phaseIndex = 0;
            let altM = 0;
            let vertSpeed = 0;
            let ascentSpeed = 0;
            let descentSpeed = 0;
            let vertAccel = 1.0;
            let chuteStatus = 'ARMED @ 1000m+';
            let chuteDeployed = false;

            if (clientSimFlightTime < 6.0) {
                phase = 'LAUNCHING';
                phaseLabel = 'LAUNCHING (PAD T-0)';
                phaseIndex = 0;
                const p = clientSimFlightTime / 6.0;
                altM = 140.0 * Math.pow(p, 2);
                vertSpeed = 38.0 * p;
                ascentSpeed = vertSpeed;
                descentSpeed = 0.0;
                vertAccel = 1.0 + 2.5 * p;
                chuteStatus = 'ARMED @ 1000m+';
                chuteDeployed = false;
            } else if (clientSimFlightTime < 24.0) {
                phase = 'ASCENT';
                phaseLabel = 'ASCENT (> 1000m)';
                phaseIndex = 1;
                const tAscent = clientSimFlightTime - 6.0;
                const p = tAscent / 18.0;
                altM = 140.0 + (30000.0 - 140.0) * Math.sin((p * Math.PI) / 2);
                vertSpeed = Math.max(2.0, 82.5 * Math.cos((p * Math.PI) / 2));
                ascentSpeed = vertSpeed;
                descentSpeed = 0.0;
                vertAccel = 2.8 - 1.2 * p;
                chuteStatus = altM >= 1000 ? 'CANOPY ARMED (> 1000m)' : 'ARMED @ 1000m+';
                chuteDeployed = false;
            } else if (clientSimFlightTime < 28.0) {
                phase = 'PARACHUTE_DEPLOY';
                phaseLabel = 'PARACHUTE DEPLOY';
                phaseIndex = 2;
                const tChute = clientSimFlightTime - 24.0;
                altM = 30000.0 - 3.5 * tChute;
                vertSpeed = - (tChute / 4.0) * 7.8;
                ascentSpeed = 0.0;
                descentSpeed = Math.abs(vertSpeed);
                vertAccel = -1.8;
                chuteStatus = 'CANOPY DEPLOYED (100%)';
                chuteDeployed = true;
            } else if (clientSimFlightTime < 65.0) {
                phase = 'DESCENT';
                phaseLabel = 'DESCENT (CHUTE)';
                phaseIndex = 3;
                const tDesc = clientSimFlightTime - 28.0;
                const descProgress = tDesc / 37.0;
                altM = Math.max(0.0, 29986.0 * (1.0 - descProgress));
                vertSpeed = -7.8;
                ascentSpeed = 0.0;
                descentSpeed = 7.8;
                vertAccel = 1.0;
                chuteStatus = 'CANOPY ACTIVE (STEADY)';
                chuteDeployed = true;
            } else {
                phase = 'TOUCHDOWN';
                phaseLabel = 'TOUCHDOWN (RECOVERY)';
                phaseIndex = 4;
                altM = 0.0;
                vertSpeed = 0.0;
                ascentSpeed = 0.0;
                descentSpeed = 0.0;
                vertAccel = 1.0;
                chuteStatus = 'RECOVERY SAFE';
                chuteDeployed = true;
            }

            const flightState = {
                phase,
                phase_label: phaseLabel,
                phase_index: phaseIndex,
                altitude_m: parseFloat(altM.toFixed(1)),
                altitude_target_m: 30000.0,
                max_altitude_m: 30000.0,
                vertical_speed_ms: parseFloat(vertSpeed.toFixed(1)),
                ascent_speed_ms: parseFloat(ascentSpeed.toFixed(1)),
                max_ascent_speed_ms: 82.5,
                descent_speed_ms: parseFloat(descentSpeed.toFixed(1)),
                vertical_accel_g: parseFloat(vertAccel.toFixed(1)),
                parachute_status: chuteStatus,
                parachute_deployed: chuteDeployed,
                flight_time_s: parseFloat(clientSimFlightTime.toFixed(1))
            };

            const lat = DEFAULT_LAT;
            const lon = DEFAULT_LON;
            const alt_km = parseFloat((altM / 1000.0).toFixed(3));
            const velocity_kms = parseFloat((Math.abs(vertSpeed) / 1000.0).toFixed(3));
            const sats = 10;

            const pitch = parseFloat((vertSpeed * 0.35 + 2.0 * Math.sin(clientSimAngle * 0.65)).toFixed(1));
            const roll = parseFloat((-3.0 * Math.cos(clientSimAngle * 0.55)).toFixed(1));
            const yaw = parseFloat(((clientSimAngle * 8.0 * (180 / Math.PI)) % 360).toFixed(1));
            const gyro_x = parseFloat((0.4 * Math.cos(clientSimAngle * 0.65)).toFixed(1));
            const gyro_y = parseFloat((-0.3 * Math.sin(clientSimAngle * 0.55)).toFixed(1));
            const gyro_z = 0.2;

            const temp_ext = parseFloat((22.0 - (altM / 1000.0) * 6.5).toFixed(1));
            const press = parseFloat((1013.25 * Math.exp(-altM / 8400)).toFixed(1));
            const hum = parseFloat(Math.max(20, 55.0 - (altM / 1000.0) * 8.0).toFixed(1));
            const temp_int = parseFloat((24.2 + 2.0 * Math.sin(clientSimAngle * 0.1)).toFixed(1));
            const cpu_temp = parseFloat((38.0 + 1.5 * Math.sin(clientSimAngle * 0.08)).toFixed(1));
            const board_voltage = 3.31;

            const solar_kw = parseFloat((0.85 + 0.15 * Math.sin(clientSimAngle * 0.2)).toFixed(3));
            const ldr_raw = Math.round((solar_kw / 1.0) * 1023);
            const ldr_lux = Math.round(solar_kw * 1250);
            const battery = parseFloat(Math.min(100, Math.max(90, 96.5 - (clientSimFlightTime / 80.0) * 2.0)).toFixed(1));
            const batt_volt = parseFloat((7.4 + (battery / 100.0) * 0.9).toFixed(2));
            const eclipse_status = "DAYLIGHT";

            const rssi = parseFloat((-68.0 - (altM / 1000.0) * 4.0).toFixed(1));
            const snr = parseFloat((11.5 + 1.5 * Math.cos(clientSimAngle * 0.22)).toFixed(1));
            const doppler_hz = parseFloat((vertSpeed * 1.47).toFixed(1));
            const link_qual = Math.max(0, Math.min(100, Math.round(((rssi + 130) / 80) * 60 + ((snr + 10) / 25) * 40)));

            const timeStr = new Date().toISOString().substr(11, 8);
            clientHistory.push({
                time: timeStr,
                alt_m: Math.round(altM),
                temp_ext, press, hum, temp_int,
                battery, solar_kw,
                pitch, roll, yaw,
                rssi, snr, doppler: doppler_hz
            });
            if (clientHistory.length > 50) clientHistory.shift();

            const hexSample = `5AA50001${Math.round(temp_ext*100).toString(16).padStart(4,'0')}${Math.round(press*100).toString(16).padStart(8,'0')}${Math.round(hum).toString(16).padStart(2,'0')}${Math.round(temp_int).toString(16).padStart(2,'0')}${Math.round(battery).toString(16).padStart(2,'0')}`.toUpperCase();

            const simData = {
                source: 'SIMULATOR',
                flight: flightState,
                gps: { lat, lon, alt_km, velocity_kms, satellites: sats },
                motion: { pitch_deg: pitch, roll_deg: roll, yaw_deg: yaw, gyro_x_dps: gyro_x, gyro_y_dps: gyro_y, gyro_z_dps: gyro_z, adcs_mode: 'ACTIVE' },
                external: { temp_c: temp_ext, pressure_hpa: press, humidity_pct: hum },
                internal: { temp_c: temp_int, cpu_temp_c: cpu_temp, board_voltage_v: board_voltage, status: 'NOMINAL' },
                power: { battery_pct: battery, battery_voltage_v: batt_volt, solar_panel_kw: solar_kw, ldr_raw, ldr_lux, eclipse_status },
                rf: { rssi_dbm: rssi, snr_db: snr, doppler_hz, link_quality_pct: link_qual, frequency_mhz: 440.0, packets_received: clientSimCount },
                sensors: {
                    bmp280: { temp_c: temp_ext, pressure_hpa: press, altitude_m: Math.round(altM), status: 'NOMINAL' },
                    mpu9250: { pitch_deg: pitch, roll_deg: roll, yaw_deg: yaw, gyro_x, gyro_y, gyro_z, status: 'ACTIVE' },
                    dht11: { temp_int_c: temp_int, humidity_pct: hum, status: 'NOMINAL' },
                    neo6m: { lat, lon, alt_m: Math.round(altM), satellites: sats, status: '3D_FIX' },
                    hw072_ldr: { solar_kw, raw_adc: ldr_raw, lux: ldr_lux, status: 'ACTIVE' },
                    last_hex_frame: hexSample
                }
            };

            renderTelemetryData(simData);
            appendChartPoint({
                time: timeStr,
                alt_m: Math.round(altM),
                temp_ext, press, hum, temp_int,
                battery, solar_kw,
                pitch, roll, yaw,
                rssi, snr, doppler: doppler_hz
            });
            notifyPacketReceived();

            // Append packet line periodically
            if (clientSimCount % 7 === 0) {
                appendTerminalPacket({
                    direction: 'RX',
                    raw: `TM_PKT: Alt=${Math.round(altM)}m VSpeed=${vertSpeed.toFixed(1)}m/s Temp=${temp_ext}C Press=${press}hPa Batt=${battery}%`,
                    raw_hex: hexSample,
                    is_ccsds: true,
                    ccsds_header: { version: 0, packet_type: 0, apid: 0x001, seq_count: clientSimCount, data_len: 32 },
                    data: { temp_ext, press, hum, temp_int, battery, solar_kw, pitch, roll, yaw, lat, lon },
                    rssi, snr, timestamp: Date.now()
                });
            }
        }, 60);
    }

    function stopClientSimulator() {
        if (clientSimInterval) {
            clearInterval(clientSimInterval);
            clientSimInterval = null;
        }
    }

    function connectWebSocket() {
        if (window.location.protocol === 'file:') {
            console.log('[WebSocket] File protocol detected, running autonomous simulator.');
            startClientSimulator();
            return;
        }

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            ws = new WebSocket(wsUrl);
        } catch (e) {
            console.warn('[WebSocket] Init failed, starting fallback simulator:', e);
            startClientSimulator();
            return;
        }

        ws.onopen = () => {
            console.log('[WebSocket] Connected to Ground Station Telemetry Server');
            stopClientSimulator();
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
                        notifyPacketReceived(msg.data?.rf?.rssi_dbm, msg.data?.rf?.snr_db);
                    }
                    if (msg.lora_logs && Array.isArray(msg.lora_logs)) {
                        msg.lora_logs.slice().reverse().forEach(pkt => appendTerminalPacket(pkt));
                    }
                } else if (msg.type === 'TELEMETRY_UPDATE') {
                    if (msg.data) renderTelemetryData(msg.data);
                    if (msg.point) appendChartPoint(msg.point);
                    else if (msg.history) updateCharts(msg.history);
                    if (msg.data && msg.data.lora) updateLoraStatus(msg.data.lora);
                    if (msg.data && msg.data.last_sdr_packet_time && (Date.now() - msg.data.last_sdr_packet_time < 3500)) {
                        notifyPacketReceived(msg.data?.rf?.rssi_dbm, msg.data?.rf?.snr_db);
                    }
                } else if (msg.type === 'LORA_STATUS') {
                    updateLoraStatus(msg.lora);
                } else if (msg.type === 'LORA_PORTS') {
                    renderPortList(msg.ports);
                } else if (msg.type === 'LORA_PACKET') {
                    notifyPacketReceived(msg.packet?.rssi, msg.packet?.snr);
                    appendTerminalPacket(msg.packet);
                    if (msg.data) renderTelemetryData(msg.data);
                } else if (msg.type === 'FLIGHT_REPLAY_TRIGGERED') {
                    notifyPacketReceived();
                    if (msg.data) renderTelemetryData(msg.data);
                }
            } catch (e) {
                console.error('[WebSocket] Data Parse Error:', e);
            }
        };

        ws.onclose = () => {
            console.warn('[WebSocket] Disconnected. Running fallback simulator & retrying in 3s...');
            startClientSimulator();
            setTimeout(connectWebSocket, 3000);
        };

        ws.onerror = (err) => {
            console.error('[WebSocket] Error, fallback to simulator:', err);
            startClientSimulator();
        };
    }

    connectWebSocket();

    // Render Telemetry Payload onto Dashboard Panels (Ultra-Fast Cached Pipeline)
    function renderTelemetryData(data) {
        if (!data) return;

        // Source Mode Indicator
        if (data.source) {
            setElText('source-badge', data.source);
            if (data.source === 'LORA_LIVE') {
                setElClass('source-badge', 'status-pill');
                setElStyleColor('source-badge', 'var(--accent-emerald)');
            } else if (data.source === 'SDR_LIVE') {
                setElClass('source-badge', 'status-pill');
                setElStyleColor('source-badge', 'var(--accent-cyan)');
            } else {
                setElClass('source-badge', 'status-pill simulating');
                setElStyleColor('source-badge', '');
            }
        }

        // Sensor Suite (BMP280, MPU9250, DHT11, NEO-6M, HW-072 LDR)
        // 1. BMP280 Sensor (External Temp, Pressure, Altitude)
        const bmpTemp = (data.sensors?.bmp280?.temp_c !== undefined) ? data.sensors.bmp280.temp_c : (data.external ? data.external.temp_c : 0.0);
        const bmpPress = (data.sensors?.bmp280?.pressure_hpa !== undefined) ? data.sensors.bmp280.pressure_hpa : (data.external ? data.external.pressure_hpa : 0.0);
        const bmpAlt = (data.sensors?.bmp280?.altitude_m !== undefined) ? data.sensors.bmp280.altitude_m : (data.gps ? Math.round(data.gps.alt_km * 1000) : 0);

        setElText('val-temp-ext', `${bmpTemp > 0 ? '+' : ''}${bmpTemp.toFixed(1)}`);
        setElText('val-press-ext', `${bmpPress.toFixed(1)}`);
        setElText('val-bmp-alt', `${bmpAlt} m`);
        setElText('nav-chip-alt', `${bmpAlt} m`);

        const hasData = (data.rf && data.rf.packets_received > 0);
        setElText('val-bmp-status', hasData ? (data.sensors?.bmp280?.status || 'NOMINAL') : 'STANDBY');
        setElStyleColor('val-bmp-status', hasData ? 'var(--accent-emerald)' : 'var(--text-dim)');

        // 2. DHT11 Sensor (Internal Cabin Temp & Humidity)
        const dhtTemp = (data.sensors?.dht11?.temp_int_c !== undefined) ? data.sensors.dht11.temp_int_c : (data.internal ? data.internal.temp_c : 0.0);
        const dhtHum = (data.sensors?.dht11?.humidity_pct !== undefined) ? data.sensors.dht11.humidity_pct : (data.external ? data.external.humidity_pct : 0.0);

        setElText('val-temp-int', `${dhtTemp.toFixed(1)}`);
        setElText('val-hum-int', `${dhtHum.toFixed(1)}%`);

        if (data.internal) {
            setElText('val-temp-cpu', `${(data.internal.cpu_temp_c || 0).toFixed(1)}°C`);
            setElText('val-board-volt', `${(data.internal.board_voltage_v || 0).toFixed(2)} V`);
        }

        // 3. HW-072 LDR & EPS Subsystem
        const ldrKw = (data.sensors?.hw072_ldr?.solar_kw !== undefined) ? data.sensors.hw072_ldr.solar_kw : (data.power ? data.power.solar_panel_kw : 0.0);
        const ldrAdc = (data.sensors?.hw072_ldr?.raw_adc !== undefined) ? data.sensors.hw072_ldr.raw_adc : (data.power && data.power.ldr_raw ? data.power.ldr_raw : 0);

        setElText('val-solar-kw', `${ldrKw.toFixed(3)}`);
        setElText('val-ldr-raw', `${ldrAdc} / 1023`);

        if (data.power) {
            setElText('val-battery-pct', `${(data.power.battery_pct || 0).toFixed(1)}%`);
            setElText('val-batt-volt', `${(data.power.battery_voltage_v || 0).toFixed(2)} V`);
            setElText('val-eclipse', data.power.eclipse_status || 'STANDBY');
            setElText('nav-chip-batt', `${Math.round(data.power.battery_pct || 0)}%`);
        }

        // 4. MPU 9250 9-DOF IMU & Orientation
        if (data.motion) {
            const pitch = data.motion.pitch_deg || 0;
            const roll = data.motion.roll_deg || 0;
            const yaw = data.motion.yaw_deg || 0;

            setElText('val-sub-angles', `${pitch.toFixed(1)}° / ${roll.toFixed(1)}°`);
            setElText('val-imu-yaw', `${yaw.toFixed(1)}°`);
            setElText('val-pitch', `${pitch.toFixed(1)}°`);
            setElText('val-roll', `${roll.toFixed(1)}°`);
            setElText('val-yaw', `${yaw.toFixed(1)}°`);

            const gyroX = data.motion.gyro_x_dps || 0;
            const gyroY = data.motion.gyro_y_dps || 0;
            const gyroZ = data.motion.gyro_z_dps || 0;
            setElText('val-gyro-xyz', `${gyroX.toFixed(1)}, ${gyroY.toFixed(1)}, ${gyroZ.toFixed(1)} °/s`);
            setElText('val-adcs-status', data.motion.adcs_mode || 'SUN POINTING');

            if (cubesat3d) {
                cubesat3d.updateOrientation(pitch, roll, yaw, dhtTemp || 0);
                if (cubesat3d.updateEnvironment) {
                    cubesat3d.updateEnvironment(ldrKw, data.power?.eclipse_status);
                }
            }
        }

        // 5. Ublox NEO-6M GPS & Orbital Track
        if (data.gps) {
            updateMap(data.gps);
            const sats = (data.sensors?.neo6m?.satellites !== undefined) ? data.sensors.neo6m.satellites : (data.gps.satellites || 0);
            setElText('map-sats', `${sats} FIX`);
            setElText('gps-sats-tag', `NEO-6M (${sats} SATS)`);
            setElText('nav-chip-gps', sats > 0 ? `FIX (${sats} SATS)` : 'ACQUIRING');
        }

        // 6. Live Hexadecimal Frame Stream Strip
        const lastHex = data.sensors?.last_hex_frame;
        if (lastHex) {
            const clean = lastHex.replace(/^5AA5|^AA55/i, '');
            setElText('hex-code-stream', clean);
            setElText('hex-status-badge', 'HEX DECODED');
            setElStyleColor('hex-status-badge', 'var(--accent-emerald)');
        }

        // RF & Frequency Medium Parameters
        if (data.rf) {
            setElText('val-rssi', `${(data.rf.rssi_dbm || 0).toFixed(1)}`);
            setElText('val-snr', `${(data.rf.snr_db || 0).toFixed(1)}`);
            setElText('val-packets', (data.rf.packets_received || 0).toLocaleString());
            setElText('val-rf-quality', `${data.rf.link_quality_pct !== undefined ? data.rf.link_quality_pct : 0}%`);
            setElText('val-rf-doppler', `${(data.rf.doppler_hz || 0).toFixed(1)} Hz`);
            setElText('rf-freq-badge', `${(data.rf.frequency_mhz || 440.000).toFixed(3)} MHz`);
        }

        // Launch Flight Dynamics & Overall Profile
        if (data.flight) {
            renderFlightDynamics(data.flight, data);
        }
    }

    // -------------------------------------------------------------------
    // LAUNCH FLIGHT PROFILE & DYNAMICS RENDERER
    // -------------------------------------------------------------------
    function renderFlightDynamics(flight, data) {
        if (!flight) return;

        // 1. Mission Flight Phase Pipeline Stepper & Active Badge
        setElText('pipeline-active-badge', flight.phase_label || flight.phase);
        setElText('badge-flight-phase', flight.phase_label || flight.phase);
        const phClass = (flight.phase || '').toLowerCase().replace(/_/g, '-');
        setElClass('badge-flight-phase', 'panel-tag chip-phase ' + phClass);

        // Update Screen Nav Bar Quick Status Chips
        setElText('nav-chip-alt', `${Math.round(flight.altitude_m || 0).toLocaleString()} m`);
        setElText('nav-chip-vz', `${(flight.vertical_speed_ms || 0) > 0 ? '+' : ''}${(flight.vertical_speed_ms || 0).toFixed(1)} m/s`);
        setElText('nav-chip-phase', flight.phase_label || flight.phase || 'ASCENT');

        // Stepper milestones: 0: Launch, 1: Ascent, 2: Chute, 3: Descent, 4: Touchdown
        const steps = ['step-launch', 'step-ascent', 'step-chute', 'step-descent', 'step-touchdown'];
        const lines = ['line-1', 'line-2', 'line-3', 'line-4'];
        const currentIndex = (flight.phase_index !== undefined) ? flight.phase_index : 1;

        for (let idx = 0; idx < steps.length; idx++) {
            const cls = idx < currentIndex ? 'pipeline-step completed' : (idx === currentIndex ? 'pipeline-step active' : 'pipeline-step');
            setElClass(steps[idx], cls);
        }

        for (let idx = 0; idx < lines.length; idx++) {
            const cls = idx < currentIndex ? 'step-line active' : 'step-line';
            setElClass(lines[idx], cls);
        }

        if (flight.altitude_m >= 1000) {
            setElText('ascent-alt-sub', `ALTITUDE > 1,000m ↑ (${Math.round(flight.altitude_m)}m)`);
            setElStyleColor('ascent-alt-sub', 'var(--accent-cyan)');
        } else {
            setElText('ascent-alt-sub', `ALTITUDE ${Math.round(flight.altitude_m)}m ↑`);
            setElStyleColor('ascent-alt-sub', '');
        }

        // 2. Velocity Card A: Ascent Speed
        const spd = flight.ascent_speed_ms || 0;
        setElText('val-ascent-speed', `${spd > 0 ? '+' : ''}${spd.toFixed(1)}`);
        setElText('val-ascent-kmh', `${(spd * 3.6).toFixed(1)} km/h`);
        setElText('val-ascent-max', `MAX: ${(flight.max_ascent_speed_ms || 82.5).toFixed(1)} m/s`);

        if (spd > 1.0) {
            setElText('badge-ascent-state', '▲ CLIMBING');
            setElClass('badge-ascent-state', 'vcard-badge climbing');
        } else if (flight.phase === 'LAUNCHING') {
            setElText('badge-ascent-state', 'LIFTOFF');
            setElClass('badge-ascent-state', 'vcard-badge');
        } else {
            setElText('badge-ascent-state', 'STANDBY');
            setElClass('badge-ascent-state', 'vcard-badge');
        }

        const maxRef = flight.max_ascent_speed_ms || 90.0;
        const pctAscent = Math.min(100, Math.max(0, (spd / maxRef) * 100));
        setElStyleWidth('meter-ascent', `${pctAscent.toFixed(0)}%`);

        // 3. Velocity Card B: Descent Speed
        const dSpd = flight.descent_speed_ms || 0;
        setElText('val-descent-speed', `${dSpd.toFixed(1)}`);
        setElText('val-descent-kmh', `${(dSpd * 3.6).toFixed(1)} km/h`);

        if (flight.phase === 'DESCENT') {
            setElText('badge-descent-state', '▼ DESCENDING');
            setElClass('badge-descent-state', 'vcard-badge active');
        } else if (flight.phase === 'TOUCHDOWN') {
            setElText('badge-descent-state', 'LANDED');
            setElClass('badge-descent-state', 'vcard-badge');
        } else {
            setElText('badge-descent-state', 'STANDBY');
            setElClass('badge-descent-state', 'vcard-badge');
        }

        if (flight.parachute_deployed) {
            setElText('val-chute-mode', 'CANOPY OPEN (7.8 m/s)');
            setElStyleColor('val-chute-mode', 'var(--accent-emerald)');
        } else if (flight.altitude_m >= 1000) {
            setElText('val-chute-mode', 'CANOPY ARMED (>1000m)');
            setElStyleColor('val-chute-mode', 'var(--accent-amber)');
        } else {
            setElText('val-chute-mode', 'CANOPY STANDBY');
            setElStyleColor('val-chute-mode', '');
        }

        const pctDescent = Math.min(100, Math.max(0, (dSpd / 15.0) * 100));
        setElStyleWidth('meter-descent', `${pctDescent.toFixed(0)}%`);

        // 4. Middle Flight Milestones
        setElText('val-flight-alt', Math.round(flight.altitude_m || 0).toLocaleString());

        if (flight.altitude_m >= 1000 && flight.vertical_speed_ms > 0) {
            setElText('status-alt-climb', '> 1000m INCREASING ↑');
            setElClass('status-alt-climb', 'm-status-text highlight-1000');
        } else if (flight.vertical_speed_ms > 0) {
            setElText('status-alt-climb', `CLIMBING (+${flight.vertical_speed_ms.toFixed(1)} m/s) ↑`);
            setElClass('status-alt-climb', 'm-status-text');
        } else if (flight.vertical_speed_ms < 0) {
            setElText('status-alt-climb', `DESCENDING (↓ ${Math.abs(flight.vertical_speed_ms).toFixed(1)} m/s)`);
            setElClass('status-alt-climb', 'm-status-text descent');
        } else if (flight.phase === 'TOUCHDOWN') {
            setElText('status-alt-climb', 'TOUCHDOWN / RECOVERY');
            setElClass('status-alt-climb', 'm-status-text');
        } else {
            setElText('status-alt-climb', 'LAUNCH PAD (T-0)');
            setElClass('status-alt-climb', 'm-status-text');
        }

        setElText('val-apogee-target', Math.round(flight.altitude_target_m || 30000).toLocaleString());

        const chuteLabel = flight.parachute_status || (flight.parachute_deployed ? 'DEPLOYED' : 'ARMED');
        setElText('badge-parachute', chuteLabel);
        if (flight.parachute_deployed) {
            setElClass('badge-parachute', 'badge-parachute deployed');
        } else if (flight.altitude_m >= 1000) {
            setElClass('badge-parachute', 'badge-parachute armed-1000');
        } else {
            setElClass('badge-parachute', 'badge-parachute');
        }

        setElText('val-pyro-status', flight.parachute_deployed ? 'PYRO: FIRED' : 'PYRO: ARMED');

        const g = flight.vertical_accel_g || 1.0;
        setElText('val-g-force', `${g > 0 ? '+' : ''}${g.toFixed(1)}`);

        // Profile elapsed time
        if (flight.flight_time_s !== undefined) {
            const s = Math.floor(flight.flight_time_s);
            const m = Math.floor(s / 60);
            const sec = s % 60;
            setElText('profile-elapsed', `T+ ${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}s`);
        }
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
            { id: 'map-lat', val: '30.768776°' },
            { id: 'map-lon', val: '76.573955°' },
            { id: 'map-alt', val: '0.0 km' },
            { id: 'map-spd', val: '0.00 km/s' },
            { id: 'map-sats', val: '0 FIX' },
            { id: 'gps-sats-tag', val: 'NEO-6M (0 SATS)' },
            { id: 'val-ascent-speed', val: '0.0' },
            { id: 'val-ascent-kmh', val: '0.0 km/h' },
            { id: 'badge-ascent-state', val: 'STANDBY' },
            { id: 'val-descent-speed', val: '0.0' },
            { id: 'val-descent-kmh', val: '0.0 km/h' },
            { id: 'badge-descent-state', val: 'STANDBY' },
            { id: 'val-flight-alt', val: '0' },
            { id: 'status-alt-climb', val: 'LAUNCH PAD (T-0)' },
            { id: 'val-apogee-target', val: '30,000' },
            { id: 'badge-parachute', val: 'ARMED' },
            { id: 'val-pyro-status', val: 'PYRO: STANDBY' },
            { id: 'val-g-force', val: '+1.0' },
            { id: 'pipeline-active-badge', val: 'LAUNCH PAD (T-0)' },
            { id: 'badge-flight-phase', val: 'LAUNCH PAD (T-0)' },
            { id: 'profile-elapsed', val: 'T+ 00:00s' },
            { id: 'ascent-alt-sub', val: 'ALTITUDE > 1,000m ↑' }
        ];

        elementsToZero.forEach(item => {
            const el = document.getElementById(item.id);
            if (el) el.textContent = item.val;
        });

        // Reset meters
        const meterAscent = document.getElementById('meter-ascent');
        if (meterAscent) meterAscent.style.width = '0%';
        const meterDescent = document.getElementById('meter-descent');
        if (meterDescent) meterDescent.style.width = '0%';

        // Reset pipeline stepper steps
        const steps = ['step-launch', 'step-ascent', 'step-chute', 'step-descent', 'step-touchdown'];
        steps.forEach((sId, idx) => {
            const el = document.getElementById(sId);
            if (el) el.className = idx === 0 ? 'pipeline-step active' : 'pipeline-step';
        });
        const lines = ['line-1', 'line-2', 'line-3', 'line-4'];
        lines.forEach(lId => {
            const el = document.getElementById(lId);
            if (el) el.className = 'step-line';
        });

        const bmpStatusEl = document.getElementById('val-bmp-status');
        if (bmpStatusEl) bmpStatusEl.style.color = 'var(--text-dim)';

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

        const allCharts = [chartAltitudeProfile, chartEnv, chartInt, chartPower, chartMotion, chartRf];
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

        clientSimFlightTime = 0.0;

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ command: 'LORA_DISCONNECT' }));
            ws.send(JSON.stringify({ command: 'RESET_TELEMETRY' }));
        }
    }

    // Toggle Source Mode Button Listener (Instant 0ms Feedback)
    const btnToggle = document.getElementById('btn-toggle-source');
    if (btnToggle) {
        btnToggle.addEventListener('click', () => {
            const currentSource = document.getElementById('source-badge').textContent.trim();
            const newSource = currentSource === 'SIMULATOR' ? 'LORA_LIVE' : 'SIMULATOR';
            // Instant 0ms Optimistic UI feedback
            setElText('source-badge', newSource);
            if (newSource === 'LORA_LIVE') {
                setElClass('source-badge', 'status-pill');
                setElStyleColor('source-badge', 'var(--pal-blue)');
            } else {
                setElClass('source-badge', 'status-pill simulating');
                setElStyleColor('source-badge', '');
            }
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'SET_SOURCE', source: newSource }));
            } else {
                fetch('/api/mode', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ source: newSource })
                });
            }
        });
    }

    // Replay Launch Mission Profile Listener (Instant 0ms Optimistic Response)
    async function triggerLaunchReplay() {
        console.log('[GroundStation] Triggering Launch Mission Replay from Pad T-0...');
        clientSimFlightTime = 0.0;

        // Instant 0ms Optimistic UI feedback
        setElText('pipeline-active-badge', 'LAUNCH PAD (T-0)');
        setElText('badge-flight-phase', 'LAUNCH PAD (T-0)');
        setElClass('badge-flight-phase', 'panel-tag chip-phase launching');
        setElText('val-flight-alt', '0');
        setElText('status-alt-climb', 'LAUNCH PAD (T-0)');
        setElClass('status-alt-climb', 'm-status-text');
        setElText('val-ascent-speed', '0.0');
        setElText('val-ascent-kmh', '0.0 km/h');
        setElText('badge-ascent-state', 'LIFTOFF');
        setElText('val-descent-speed', '0.0');
        setElText('val-descent-kmh', '0.0 km/h');
        setElText('badge-descent-state', 'STANDBY');
        setElText('badge-parachute', 'ARMED');
        setElClass('badge-parachute', 'badge-parachute');
        setElText('profile-elapsed', 'T+ 00:00s');
        setElStyleWidth('meter-ascent', '0%');
        setElStyleWidth('meter-descent', '0%');
        setElClass('step-launch', 'pipeline-step active');
        setElClass('step-ascent', 'pipeline-step');
        setElClass('step-chute', 'pipeline-step');
        setElClass('step-descent', 'pipeline-step');
        setElClass('step-touchdown', 'pipeline-step');
        for (let i = 1; i <= 4; i++) setElClass('line-' + i, 'step-line');

        try {
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({ command: 'REPLAY_LAUNCH' }));
            } else {
                await fetch('/api/flight/replay', { method: 'POST' });
            }
        } catch (e) {
            console.error('Launch Replay failed:', e);
        }
    }

    const btnReplayHeader = document.getElementById('btn-replay-header');
    if (btnReplayHeader) {
        btnReplayHeader.addEventListener('click', triggerLaunchReplay);
    }
    const btnReplayLaunch = document.getElementById('btn-replay-launch');
    if (btnReplayLaunch) {
        btnReplayLaunch.addEventListener('click', triggerLaunchReplay);
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

    const terminalLogsBuffer = [];

    function renderSingleTerminalLine(packet) {
        if (!terminalWindow || !packet) return;
        const line = document.createElement('div');
        const timeStr = new Date(packet.timestamp || Date.now()).toISOString().substr(11, 8);

        if (packet.direction === 'TX') {
            line.className = 'term-line tx';
            line.innerHTML = `<span class="term-time">[${timeStr}]</span><span class="tx-tag">TX</span> <span>${escapeHtml(packet.raw)}</span>`;
        } else {
            line.className = 'term-line rx';
            const rssiStr = packet.rssi !== undefined && packet.rssi !== null ? `<span class="rssi-tag">[${packet.rssi} dBm / ${packet.snr || 0} dB]</span>` : '';
            
            const ccsds = packet.ccsds_header;
            const ccsdsTag = ccsds ? `<span style="background:#DBEAFE; color:#1E3A8A; border:1px solid #2563EB; border-radius:3px; padding:1px 5px; font-weight:700; font-size:10px;">[CCSDS APID: 0x${(ccsds.apid || 1).toString(16).padStart(3,'0').toUpperCase()} Seq:#${ccsds.seq_count || 0} Len:${ccsds.data_len || 0}B]</span>` : '';
            
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

                decodedInfo = `<div style="margin-top:2px; color:#1D4ED8; font-size:11px; font-weight:600;">✓ CCSDS TM Decoded: TempExt=${tempExt}, Press=${press}, Hum=${hum}, CabinTemp=${tempInt}, Batt=${batt}, Solar=${solar}, Pitch=${pitch}, Roll=${roll}, Yaw=${yaw}, GPS=(${lat}, ${lon})</div>`;
            }

            line.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                    <span class="term-time">[${timeStr}]</span>
                    <span class="rx-tag">RX 440MHz</span>
                    ${ccsdsTag}
                    ${rssiStr}
                </div>
                <div style="font-family:'JetBrains Mono',monospace; color:#0F172A; word-break:break-all; margin-top:2px; font-size:11px;">
                    <span style="color:#DC2626; font-weight:700;">HEX:</span> ${rawHexStr}
                </div>
                ${decodedInfo}
            `;
        }

        terminalWindow.appendChild(line);

        while (terminalWindow.children.length > 150) {
            terminalWindow.removeChild(terminalWindow.firstChild);
        }

        terminalWindow.scrollTop = terminalWindow.scrollHeight;
    }

    function appendTerminalPacket(packet) {
        if (!packet) return;

        terminalLogsBuffer.push(packet);
        if (terminalLogsBuffer.length > 100) terminalLogsBuffer.shift();

        // Flash LED indicator on incoming packet
        if (linkDot && isLoraConnected) {
            linkDot.classList.add('receiving');
            setTimeout(() => linkDot.classList.remove('receiving'), 150);
        }

        // Only manipulate DOM if terminal window is active/open
        if (!modalOverlay || !modalOverlay.classList.contains('active')) return;
        renderSingleTerminalLine(packet);
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
            if (terminalWindow) {
                terminalWindow.innerHTML = '';
                terminalLogsBuffer.forEach(pkt => renderSingleTerminalLine(pkt));
                terminalWindow.scrollTop = terminalWindow.scrollHeight;
            }
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

    // -------------------------------------------------------------------
    // 7. MULTI-SCREEN SWITCHER ENGINE (SCREENS 1, 2, 3 & HOTKEYS)
    // -------------------------------------------------------------------
    function switchScreen(screenNum) {
        currentActiveScreen = screenNum;

        // 1. Update tab buttons
        document.querySelectorAll('.screen-tab-btn').forEach(btn => {
            const isTarget = btn.getAttribute('data-screen') === String(screenNum);
            btn.classList.toggle('active', isTarget);
        });

        // 2. Update screen views
        document.querySelectorAll('.screen-view').forEach(view => {
            const isTarget = view.id === `screen-${screenNum}-view`;
            view.classList.toggle('active', isTarget);
        });

        // 3. Viewport invalidation / adaptation (instant & next frame)
        if (screenNum === 1) {
            if (map) {
                map.invalidateSize();
                requestAnimationFrame(() => map.invalidateSize());
            }
        } else if (screenNum === 2) {
            if (cubesat3d) {
                cubesat3d.onWindowResize();
                requestAnimationFrame(() => cubesat3d.onWindowResize());
            }
        }

        // 4. Redraw charts with correct container bounds immediately
        requestChartDraw(true);
    }

    // Attach click listeners to screen tab buttons
    document.querySelectorAll('.screen-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const num = parseInt(btn.getAttribute('data-screen'), 10);
            if (num) switchScreen(num);
        });
    });

    // Keyboard Shortcuts: Keys '1', '2' switch screens instantly
    window.addEventListener('keydown', (e) => {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)) return;
        if (e.key === '1') {
            e.preventDefault();
            switchScreen(1);
        } else if (e.key === '2') {
            e.preventDefault();
            switchScreen(2);
        }
    });

    // Initial port load
    fetchSerialPorts();
});


