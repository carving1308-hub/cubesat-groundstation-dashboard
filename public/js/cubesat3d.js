/**
 * 3D 6U CubeSat Model & Real-Time Motion/Orientation Visualizer
 * Built using Three.js
 */

class CubeSat3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cubeSatGroup = null;
        this.coreLight = null;
        this.controls = null;
        
        // Target Orientation (degrees)
        this.targetPitch = 0;
        this.targetRoll = 0;
        this.targetYaw = 0;

        // Current Orientation (smooth interpolation)
        this.currentPitch = 0;
        this.currentRoll = 0;
        this.currentYaw = 0;

        this.init();
    }

    init() {
        const width = this.container.clientWidth || 300;
        const height = this.container.clientHeight || 200;

        // 1. Scene
        this.scene = new THREE.Scene();

        // 2. Camera
        this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
        this.camera.position.set(4, 3, 5);
        this.camera.lookAt(0, 0, 0);

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.container.appendChild(this.renderer.domElement);

        // 4. Lights
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x00f0ff, 1.2);
        dirLight1.position.set(5, 10, 7);
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0xffb703, 0.8);
        dirLight2.position.set(-5, -5, -5);
        this.scene.add(dirLight2);

        // Internal Thermal Glow PointLight
        this.coreLight = new THREE.PointLight(0x00f0ff, 2, 3);
        this.coreLight.position.set(0, 0, 0);
        this.scene.add(this.coreLight);

        // 5. Build 6U CubeSat Geometry
        this.buildCubeSat();

        // 6. Grid Helper / Coordinate Axes
        const gridHelper = new THREE.GridHelper(10, 20, 0x00f0ff, 0x1d2a44);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);

        // Resize Listener
        window.addEventListener('resize', () => this.onWindowResize());

        // Animation Loop
        this.animate();
    }

    buildCubeSat() {
        this.cubeSatGroup = new THREE.Group();

        // 6U Dimensions Aspect Ratio: 10cm x 20cm x 30cm => (X: 1.0, Y: 3.0, Z: 2.0)
        const width = 1.0;
        const height = 3.0;
        const depth = 2.0;

        // Main Aluminum Chassis Frame
        const chassisGeo = new THREE.BoxGeometry(width, height, depth);
        const chassisMat = new THREE.MeshStandardMaterial({
            color: 0x1A2234,
            metalness: 0.85,
            roughness: 0.25,
            wireframe: false
        });
        const chassis = new THREE.Mesh(chassisGeo, chassisMat);
        this.cubeSatGroup.add(chassis);

        // Solar Panel Cell Overlays (Dark Blue with Grid Lines)
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0x0B1B3D,
            metalness: 0.9,
            roughness: 0.1,
            emissive: 0x001133
        });

        // External Solar Faces (+X, -X, +Z, -Z)
        const sidePanelGeoZ = new THREE.PlaneGeometry(width * 0.9, height * 0.95);
        const frontPanel = new THREE.Mesh(sidePanelGeoZ, panelMat);
        frontPanel.position.z = depth / 2 + 0.01;
        this.cubeSatGroup.add(frontPanel);

        const backPanel = new THREE.Mesh(sidePanelGeoZ, panelMat);
        backPanel.position.z = -depth / 2 - 0.01;
        backPanel.rotation.y = Math.PI;
        this.cubeSatGroup.add(backPanel);

        // Deployable Solar Wings (+X and -X sides)
        const wingWidth = 1.8;
        const wingHeight = height * 0.9;
        const wingGeo = new THREE.BoxGeometry(wingWidth, wingHeight, 0.05);
        
        // Right Wing (+X)
        const rightWing = new THREE.Mesh(wingGeo, panelMat);
        rightWing.position.set(width / 2 + wingWidth / 2 + 0.05, 0, 0);
        this.cubeSatGroup.add(rightWing);

        // Left Wing (-X)
        const leftWing = new THREE.Mesh(wingGeo, panelMat);
        leftWing.position.set(-width / 2 - wingWidth / 2 - 0.05, 0, 0);
        this.cubeSatGroup.add(leftWing);

        // Payload Camera Aperture Lens (+Y Top Face)
        const lensGroup = new THREE.Group();
        const lensHousingGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.3, 32);
        const lensHousingMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.95, roughness: 0.1 });
        const lensHousing = new THREE.Mesh(lensHousingGeo, lensHousingMat);
        
        const glassGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.32, 32);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0x00f0ff,
            transmission: 0.9,
            opacity: 1,
            transparent: true,
            roughness: 0,
            ior: 1.5
        });
        const glass = new THREE.Mesh(glassGeo, glassMat);
        lensGroup.add(lensHousing);
        lensGroup.add(glass);

        lensGroup.position.set(0, height / 2 + 0.15, 0);
        this.cubeSatGroup.add(lensGroup);

        // Antennas (Deployable Tape Measure Elements at Bottom -Y)
        const antennaMat = new THREE.MeshBasicMaterial({ color: 0xFFB703 });
        const ant1Geo = new THREE.CylinderGeometry(0.02, 0.02, 1.5);
        
        const ant1 = new THREE.Mesh(ant1Geo, antennaMat);
        ant1.position.set(width / 2, -height / 2 - 0.75, depth / 2);
        this.cubeSatGroup.add(ant1);

        const ant2 = new THREE.Mesh(ant1Geo, antennaMat);
        ant2.position.set(-width / 2, -height / 2 - 0.75, -depth / 2);
        this.cubeSatGroup.add(ant2);

        // Coordinate Axes Indicator (X: Red, Y: Green, Z: Blue)
        const axesHelper = new THREE.AxesHelper(2.5);
        this.cubeSatGroup.add(axesHelper);

        // Outer Wireframe Bounding Box for High-Tech HUD feel
        const wireframeGeo = new THREE.BoxGeometry(width * 1.08, height * 1.04, depth * 1.08);
        const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff, wireframe: true, transparent: true, opacity: 0.25 });
        const wireframe = new THREE.Mesh(wireframeGeo, wireframeMat);
        this.cubeSatGroup.add(wireframe);

        this.scene.add(this.cubeSatGroup);
    }

    updateOrientation(pitchDeg, rollDeg, yawDeg, internalTempC) {
        this.targetPitch = pitchDeg * (Math.PI / 180);
        this.targetRoll = rollDeg * (Math.PI / 180);
        this.targetYaw = yawDeg * (Math.PI / 180);

        // Dynamic Internal Temp Glow Color
        if (this.coreLight) {
            if (internalTempC > 35) {
                this.coreLight.color.setHex(0xFF3366); // Red warning glow
                this.coreLight.intensity = 3.5;
            } else if (internalTempC > 26) {
                this.coreLight.color.setHex(0xFFB703); // Amber warm glow
                this.coreLight.intensity = 2.5;
            } else {
                this.coreLight.color.setHex(0x00F0FF); // Nominal cyan glow
                this.coreLight.intensity = 1.8;
            }
        }
    }

    resetView() {
        this.targetPitch = 0;
        this.targetRoll = 0;
        this.targetYaw = 0;
        this.camera.position.set(4, 3, 5);
        this.camera.lookAt(0, 0, 0);
    }

    animate() {
        requestAnimationFrame(() => this.animate());

        // Smooth Euler Angle Interpolation (LERP) for fluid orientation tracking
        this.currentPitch += (this.targetPitch - this.currentPitch) * 0.1;
        this.currentRoll += (this.targetRoll - this.currentRoll) * 0.1;
        this.currentYaw += (this.targetYaw - this.currentYaw) * 0.1;

        if (this.cubeSatGroup) {
            // Three.js Euler order XYZ
            this.cubeSatGroup.rotation.set(
                this.currentPitch,
                this.currentYaw,
                this.currentRoll,
                'YXZ'
            );
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
