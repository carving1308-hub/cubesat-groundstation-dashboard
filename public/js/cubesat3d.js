/**
 * 3D Space Day CAD Model & Real-Time Motion/Orientation Visualizer
 * Parses converted STEP CAD geometry (Space Day.step -> models/space_day.json)
 * Driven by real-time MPU-9250 IMU Pitch, Roll, and Yaw Telemetry.
 */

class CubeSat3D {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) return;

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.cubeSatGroup = null;
        this.cadModelGroup = null;
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
        const ambientLight = new THREE.AmbientLight(0xffffff, 0.7);
        this.scene.add(ambientLight);

        const dirLight1 = new THREE.DirectionalLight(0x0284c7, 1.4);
        dirLight1.position.set(5, 10, 7);
        this.scene.add(dirLight1);

        const dirLight2 = new THREE.DirectionalLight(0x38bdf8, 0.9);
        dirLight2.position.set(-5, -5, -5);
        this.scene.add(dirLight2);

        // Internal Thermal Glow PointLight
        this.coreLight = new THREE.PointLight(0x0284c7, 2, 4);
        this.coreLight.position.set(0, 0, 0);
        this.scene.add(this.coreLight);

        // 5. Root Orientation Group
        this.cubeSatGroup = new THREE.Group();

        // 6. Build Fallback Frame & Load Space Day.step CAD Model
        this.buildFallbackFrame();
        this.loadSpaceDayCadModel();

        // 7. Grid Helper / Coordinate Reference Grid
        const gridHelper = new THREE.GridHelper(10, 20, 0x0284c7, 0x334155);
        gridHelper.position.y = -2;
        this.scene.add(gridHelper);

        this.scene.add(this.cubeSatGroup);

        // Resize Listener
        window.addEventListener('resize', () => this.onWindowResize());

        // Animation Loop
        this.animate();
    }

    buildFallbackFrame() {
        // Temporary placeholder geometry while CAD model loads
        const width = 1.0;
        const height = 3.0;
        const depth = 2.0;

        const fallbackGeo = new THREE.BoxGeometry(width, height, depth);
        const fallbackMat = new THREE.MeshStandardMaterial({
            color: 0x1E293B,
            metalness: 0.8,
            roughness: 0.3,
            wireframe: false,
            transparent: true,
            opacity: 0.8
        });
        this.placeholderMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
        this.cubeSatGroup.add(this.placeholderMesh);

        // Coordinate Axes Indicator (X: Red, Y: Green, Z: Blue)
        const axesHelper = new THREE.AxesHelper(2.2);
        this.cubeSatGroup.add(axesHelper);

        // Outer Wireframe Bounding Box
        const wireframeGeo = new THREE.BoxGeometry(width * 1.08, height * 1.04, depth * 1.08);
        const wireframeMat = new THREE.MeshBasicMaterial({ color: 0x0284c7, wireframe: true, transparent: true, opacity: 0.35 });
        const wireframe = new THREE.Mesh(wireframeGeo, wireframeMat);
        this.cubeSatGroup.add(wireframe);
    }

    async loadSpaceDayCadModel() {
        try {
            console.log('Loading Space Day STEP CAD Model...');
            const response = await fetch('models/space_day.json');
            if (!response.ok) {
                throw new Error(`HTTP error ${response.status}`);
            }
            const meshesData = await response.json();

            this.cadModelGroup = new THREE.Group();

            meshesData.forEach((meshData) => {
                const geometry = new THREE.BufferGeometry();
                
                geometry.setAttribute(
                    'position',
                    new THREE.Float32BufferAttribute(meshData.positions, 3)
                );

                if (meshData.normals && meshData.normals.length > 0) {
                    geometry.setAttribute(
                        'normal',
                        new THREE.Float32BufferAttribute(meshData.normals, 3)
                    );
                } else {
                    geometry.computeVertexNormals();
                }

                if (meshData.indices && meshData.indices.length > 0) {
                    geometry.setIndex(meshData.indices);
                }

                // Compute Bounding Box & Center
                geometry.computeBoundingBox();
                geometry.center();

                const bbox = geometry.boundingBox;
                const sizeY = bbox.max.y - bbox.min.y;
                const targetScale = 3.0 / (sizeY || 1.0); // Scale model to 3.0 units high

                // Create High-Precision Aerospace Metallic Material
                const material = new THREE.MeshStandardMaterial({
                    color: 0x1E3A8A, // Royal Deep Blue
                    metalness: 0.85,
                    roughness: 0.25,
                    envMapIntensity: 1.2
                });

                const cadMesh = new THREE.Mesh(geometry, material);
                cadMesh.scale.set(targetScale, targetScale, targetScale);
                
                // Add metallic wireframe overlay edge lines for crisp STEP CAD presentation
                const wireGeo = new THREE.WireframeGeometry(geometry);
                const wireMat = new THREE.LineBasicMaterial({ color: 0x38BDF8, transparent: true, opacity: 0.15 });
                const wireLine = new THREE.LineSegments(wireGeo, wireMat);
                wireLine.scale.set(targetScale, targetScale, targetScale);

                this.cadModelGroup.add(cadMesh);
                this.cadModelGroup.add(wireLine);
            });

            // Remove temporary placeholder once CAD STEP model is loaded
            if (this.placeholderMesh) {
                this.cubeSatGroup.remove(this.placeholderMesh);
                this.placeholderMesh.geometry.dispose();
                this.placeholderMesh.material.dispose();
            }

            this.cubeSatGroup.add(this.cadModelGroup);
            console.log('Space Day STEP CAD Model successfully added to 3D orientation scene!');

        } catch (err) {
            console.warn('Could not load space_day.json, keeping 6U CubeSat fallback geometry:', err);
        }
    }

    updateOrientation(pitchDeg, rollDeg, yawDeg, internalTempC) {
        this.targetPitch = pitchDeg * (Math.PI / 180);
        this.targetRoll = rollDeg * (Math.PI / 180);
        this.targetYaw = yawDeg * (Math.PI / 180);

        // Dynamic Internal Temp Glow Color
        if (this.coreLight) {
            if (internalTempC > 35) {
                this.coreLight.color.setHex(0xDC2626); // Red warning glow
                this.coreLight.intensity = 3.5;
            } else if (internalTempC > 26) {
                this.coreLight.color.setHex(0xD97706); // Amber warm glow
                this.coreLight.intensity = 2.5;
            } else {
                this.coreLight.color.setHex(0x0284C7); // Nominal sky blue glow
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
            // Three.js Euler order YXZ for standard flight attitude (Yaw, Pitch, Roll)
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
