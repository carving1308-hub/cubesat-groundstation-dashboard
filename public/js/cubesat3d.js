/**
 * 3D 1 RU Generic CubeSat Model & Real-Time Motion/Orientation Visualizer
 * Loads "CubeSat - 1 RU Generic.glb" via Three.js GLTFLoader.
 * Dynamically driven by live data ingestion:
 *  - MPU-9250 IMU Pitch, Roll, and Yaw Telemetry (Attitude tracking)
 *  - DHT11 / BMP280 Internal Thermal status (Core Beacon light reaction)
 *  - HW-072 LDR Solar Subsystem (Sun vector & solar illumination changes)
 *  - Real-time Packet Ingestion pulses (RF transmission beacon wave)
 */

class CubeSat3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cubeSatGroup = null;
        this.modelGroup = null;
        this.placeholderMesh = null;
        this.coreLight = null;
        this.sunLight = null;
        this.pulseMesh = null;
        this.pulseScale = 1.0;
        this.pulseOpacity = 0.0;
        this.controls = null;

        // Target Orientation (radians)
        this.targetPitch = 0;
        this.targetRoll = 0;
        this.targetYaw = 0;

        // Current Orientation (smooth fast interpolation)
        this.currentPitch = 0;
        this.currentRoll = 0;
        this.currentYaw = 0;

        // Thermal & Ingestion status
        this.lastPacketTime = 0;

        this.init();
    }

    init() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 200;

        // 1. Scene
        this.scene = new THREE.Scene();

        // 2. Camera: Framed for a standard 1U CubeSat form factor
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(3.5, 2.5, 4.2);
        this.camera.lookAt(0, 0, 0);

        // 3. Renderer with antialiasing and shadow support
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.outputEncoding = THREE.sRGBEncoding || 3001;
        this.container.appendChild(this.renderer.domElement);

        // 4. Aerospace Lighting Suite
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.85);
        this.scene.add(ambientLight);

        // Directional Sun Light (Illuminates solar cells on 1U model)
        this.sunLight = new THREE.DirectionalLight(0xffffff, 1.4);
        this.sunLight.position.set(6, 8, 6);
        this.scene.add(this.sunLight);

        // Earth Albedo Fill Light (Soft cool reflection from planetary surface below)
        const earthLight = new THREE.DirectionalLight(0x93C5FD, 0.65);
        earthLight.position.set(-5, -6, -4);
        this.scene.add(earthLight);

        // Internal Telemetry Beacon PointLight (reacts to packet ingestion & temperature)
        this.coreLight = new THREE.PointLight(0x2563EB, 2.0, 5);
        this.coreLight.position.set(0, 0, 0);
        this.scene.add(this.coreLight);

        // 5. Root Orientation Group (Attitude rotations applied here)
        this.cubeSatGroup = new THREE.Group();

        // RF Ingestion Pulse Ring (Expands when telemetry packets arrive)
        const pulseGeo = new THREE.RingGeometry(1.2, 1.35, 32);
        const pulseMat = new THREE.MeshBasicMaterial({
            color: 0x2563EB,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.0
        });
        this.pulseMesh = new THREE.Mesh(pulseGeo, pulseMat);
        this.pulseMesh.rotation.x = Math.PI / 2;
        this.cubeSatGroup.add(this.pulseMesh);

        // 6. Build Initial 1U Frame & Load 1 RU Generic GLB
        this.buildFallback1UFrame();
        this.load1UCubeSatModel();

        // 7. Aerospace Coordinate Reference Grid
        const gridHelper = new THREE.GridHelper(10, 20, 0x2563EB, 0xE2E8F0);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);

        this.scene.add(this.cubeSatGroup);

        // 8. Interactive Orbit Controls
        if (typeof THREE.OrbitControls !== 'undefined') {
            this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
            this.controls.enableDamping = true;
            this.controls.dampingFactor = 0.08;
            this.controls.rotateSpeed = 0.8;
            this.controls.enableZoom = true;
            this.controls.minDistance = 2.0;
            this.controls.maxDistance = 15.0;
        }

        // Resize Listener
        window.addEventListener('resize', () => this.onWindowResize());

        // Animation Loop
        this.animate();
    }

    buildFallback1UFrame() {
        // 1U CubeSat form factor: 1:1:1 standard cube (10 cm x 10 cm x 10 cm)
        const size = 1.8;
        const fallbackGeo = new THREE.BoxGeometry(size, size, size);
        const fallbackMat = new THREE.MeshStandardMaterial({
            color: 0x0F172A,
            metalness: 0.85,
            roughness: 0.25,
            transparent: true,
            opacity: 0.9
        });
        this.placeholderMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
        this.cubeSatGroup.add(this.placeholderMesh);

        // Coordinate Axes Indicator (X: Red, Y: Green, Z: Blue)
        const axesHelper = new THREE.AxesHelper(2.0);
        this.cubeSatGroup.add(axesHelper);

        // Crisp Outer Wireframe
        const wireframeGeo = new THREE.BoxGeometry(size * 1.04, size * 1.04, size * 1.04);
        const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x2563EB, wireframe: true, transparent: true, opacity: 0.45 });
        this.placeholderWire = new THREE.Mesh(wireframeGeo, wireframeMat);
        this.cubeSatGroup.add(this.placeholderWire);
    }

    load1UCubeSatModel() {
        const glbPath = 'models/cubesat_1u.glb';
        console.log(`[CubeSat3D] Ingesting 1 RU Generic 3D CAD Model from ${glbPath}...`);

        if (typeof THREE.GLTFLoader === 'undefined') {
            console.warn('[CubeSat3D] THREE.GLTFLoader not found, retaining 1U fallback frame.');
            return;
        }

        const loader = new THREE.GLTFLoader();
        loader.load(
            glbPath,
            (gltf) => {
                const model = gltf.scene;
                this.modelGroup = new THREE.Group();

                // Compute Bounding Box & Scale to fit viewport perfectly
                const box = new THREE.Box3().setFromObject(model);
                const center = box.getCenter(new THREE.Vector3());
                const size = box.getSize(new THREE.Vector3());

                // Center model pivot
                model.position.x -= center.x;
                model.position.y -= center.y;
                model.position.z -= center.z;

                // Scale 1U model so longest dimension is ~2.8 units
                const maxDim = Math.max(size.x, size.y, size.z);
                const targetScale = 2.8 / (maxDim || 1.0);
                this.modelGroup.scale.set(targetScale, targetScale, targetScale);

                // Enhance materials for aerospace realism
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        if (child.material) {
                            child.material.envMapIntensity = 1.3;
                            child.material.needsUpdate = true;
                        }
                    }
                });

                this.modelGroup.add(model);

                // Remove placeholder 1U mesh
                if (this.placeholderMesh) {
                    this.cubeSatGroup.remove(this.placeholderMesh);
                    this.placeholderMesh.geometry.dispose();
                    this.placeholderMesh.material.dispose();
                    this.placeholderMesh = null;
                }
                if (this.placeholderWire) {
                    this.cubeSatGroup.remove(this.placeholderWire);
                    this.placeholderWire.geometry.dispose();
                    this.placeholderWire.material.dispose();
                    this.placeholderWire = null;
                }

                this.cubeSatGroup.add(this.modelGroup);
                console.log('[CubeSat3D] 1 RU Generic CubeSat 3D model loaded and active!');
            },
            (xhr) => {
                // Progress
            },
            (err) => {
                console.warn('[CubeSat3D] Failed to load 1 RU GLB model, keeping 1U fallback:', err);
            }
        );
    }

    /**
     * Updates real-time 3D orientation and thermal beacon from incoming telemetry
     */
    updateOrientation(pitchDeg, rollDeg, yawDeg, internalTempC) {
        this.targetPitch = (pitchDeg || 0) * (Math.PI / 180);
        this.targetRoll = (rollDeg || 0) * (Math.PI / 180);
        this.targetYaw = (yawDeg || 0) * (Math.PI / 180);

        // Thermal Beacon Color Shift based on DHT11 cabin temperature
        if (this.coreLight) {
            const temp = (internalTempC !== undefined && internalTempC !== null) ? internalTempC : 22.0;
            if (temp > 35) {
                this.coreLight.color.setHex(0xDC2626); // Alert Crimson (>35°C)
                this.coreLight.intensity = 3.2;
            } else if (temp > 28) {
                this.coreLight.color.setHex(0xEA580C); // Warm Orange (28°C-35°C)
                this.coreLight.intensity = 2.4;
            } else {
                this.coreLight.color.setHex(0x2563EB); // Nominal Aerospace Royal Blue
                this.coreLight.intensity = 1.8;
            }
        }
    }

    /**
     * Triggered on every telemetry packet ingestion (LoRa 440MHz, SDR, or Sim)
     * Creates an expanding RF signal pulse wave around the 1U spacecraft
     */
    triggerPacketPulse(rssi, snr) {
        this.pulseScale = 1.0;
        this.pulseOpacity = 0.85;

        // If RSSI is exceptionally strong (>-70 dBm), pulse brighter blue; if poor (<-100 dBm), pulse red
        if (this.pulseMesh && this.pulseMesh.material) {
            if (rssi !== undefined && rssi !== null && rssi < -100) {
                this.pulseMesh.material.color.setHex(0xDC2626);
            } else {
                this.pulseMesh.material.color.setHex(0x2563EB);
            }
        }
    }

    /**
     * Adjusts Sun directional light according to HW-072 LDR solar generation & eclipse mode
     */
    updateEnvironment(solarKw, eclipseStatus) {
        if (!this.sunLight) return;
        if (eclipseStatus === 'ECLIPSE' || solarKw <= 0.05) {
            // Orbital night / Eclipse: dim sunlight
            this.sunLight.intensity = 0.35;
        } else {
            // Sunlit: full intensity hitting 1U solar panels
            this.sunLight.intensity = Math.min(2.0, 1.2 + (solarKw || 0.5) * 0.8);
        }
    }

    resetView() {
        this.targetPitch = 0;
        this.targetRoll = 0;
        this.targetYaw = 0;
        this.camera.position.set(3.5, 2.5, 4.2);
        this.camera.lookAt(0, 0, 0);
        if (this.controls) {
            this.controls.reset();
        }
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Performance: skip WebGL rendering if 3D viewport is hidden (e.g. user is on Screen 1)
        if (!this.container || this.container.offsetParent === null) {
            return;
        }

        if (this.controls) {
            this.controls.update();
        }

        // Ultra-snappy Euler Angle Interpolation (LERP) for zero-latency attitude response
        this.currentPitch += (this.targetPitch - this.currentPitch) * 0.70;
        this.currentRoll += (this.targetRoll - this.currentRoll) * 0.70;
        this.currentYaw += (this.targetYaw - this.currentYaw) * 0.70;

        if (this.cubeSatGroup) {
            // Three.js Euler order YXZ for standard flight attitude (Yaw, Pitch, Roll)
            this.cubeSatGroup.rotation.set(
                this.currentPitch,
                this.currentYaw,
                this.currentRoll,
                'YXZ'
            );
        }

        // Animate RF Packet Ingestion Pulse Wave
        if (this.pulseMesh && this.pulseOpacity > 0.01) {
            this.pulseScale += 0.06;
            this.pulseOpacity *= 0.91;
            this.pulseMesh.scale.set(this.pulseScale, this.pulseScale, this.pulseScale);
            this.pulseMesh.material.opacity = this.pulseOpacity;
        }

        if (this.renderer && this.scene && this.camera) {
            this.renderer.render(this.scene, this.camera);
        }
    }

    onWindowResize() {
        if (!this.container || !this.renderer || !this.camera) return;
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }
}
