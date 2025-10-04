(function () {
    const viewer = document.getElementById('planet-viewer');
    const nameField = document.getElementById('planet-name');
    const radiusField = document.getElementById('planet-radius');
    const predictionField = document.getElementById('planet-prediction');
    const uncertaintyField = document.getElementById('planet-uncertainty');
    const rows = Array.from(document.querySelectorAll('.planet-row'));
    const payload = Array.isArray(window.PLANETS_PAYLOAD) ? window.PLANETS_PAYLOAD : [];

    if (!rows.length) {
        return;
    }

    const threeIsReady = viewer && typeof window.THREE !== 'undefined';

    let renderer;
    let camera;
    let holder;
    let planetGroup;
    let glowRing;
    let surfaceMaterial;
    const lineMaterials = [];

    let rotationSpeed = 0.01;
    let targetScale = 1;
    let currentScale = 1;

    function createLineMaterial(opacity) {
        const material = new THREE.LineBasicMaterial({
            color: 0x38bdf8,
            transparent: true,
            opacity,
            depthWrite: false,
        });
        lineMaterials.push(material);
        return material;
    }

    function createGreatCircle(radius, segments, material) {
        const points = [];
        for (let i = 0; i <= segments; i += 1) {
            const theta = (i / segments) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(theta) * radius,
                Math.sin(theta) * radius,
                0,
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return new THREE.LineLoop(geometry, material);
    }

    function setupScene() {
        const scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
            45,
            viewer.clientWidth / Math.max(viewer.clientHeight, 1),
            0.1,
            100
        );
        camera.position.set(0, 0, 4.2);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(viewer.clientWidth, Math.max(viewer.clientHeight, 1));
        renderer.setClearColor(0x000000, 0);
        viewer.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0x6b7280, 0.55);
        scene.add(ambient);
        const keyLight = new THREE.PointLight(0xffffff, 1.4, 30);
        keyLight.position.set(4, 4, 6);
        scene.add(keyLight);

        holder = new THREE.Group();
        scene.add(holder);

        planetGroup = new THREE.Group();
        holder.add(planetGroup);
        planetGroup.rotation.z = THREE.MathUtils.degToRad(18);

        surfaceMaterial = new THREE.MeshPhongMaterial({
            color: 0x0f172a,
            emissive: 0x1d4ed8,
            emissiveIntensity: 0.3,
            shininess: 90,
            transparent: true,
            opacity: 0.25,
        });
        const surface = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), surfaceMaterial);
        planetGroup.add(surface);

        const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(1.02, 30, 24)),
            createLineMaterial(0.8)
        );
        planetGroup.add(wireframe);

        const latitudeMaterial = createLineMaterial(0.45);
        for (let i = -2; i <= 2; i += 1) {
            const t = (i / 5) * (Math.PI / 2);
            const radius = Math.cos(t);
            const y = Math.sin(t);
            const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
            const points = curve.getPoints(160);
            const geometry = new THREE.BufferGeometry().setFromPoints(points.map((p) => new THREE.Vector3(p.x, 0, p.y)));
            const circle = new THREE.LineLoop(geometry, latitudeMaterial);
            circle.rotation.x = Math.PI / 2;
            circle.position.y = y;
            planetGroup.add(circle);
        }

        const greatCircleMaterial = createLineMaterial(0.35);
        const greatCircle = createGreatCircle(1.02, 220, greatCircleMaterial);
        const meridianAngles = [-Math.PI / 2, -Math.PI / 3, -Math.PI / 6, Math.PI / 6, Math.PI / 3, Math.PI / 2];
        meridianAngles.forEach((angle) => {
            const circle = greatCircle.clone();
            circle.material = greatCircleMaterial;
            circle.rotation.y = angle;
            planetGroup.add(circle);
        });

        const diagonalMaterial = createLineMaterial(0.28);
        [-Math.PI / 4, Math.PI / 4].forEach((angle) => {
            const loop = createGreatCircle(1.05, 220, diagonalMaterial);
            loop.rotation.set(Math.PI / 3, angle, angle / 2);
            planetGroup.add(loop);
        });

        const glowCurve = new THREE.EllipseCurve(0, 0, 1.55, 1.1, 0, Math.PI * 2);
        const glowPoints = glowCurve.getPoints(180).map((p) => new THREE.Vector3(p.x, 0, p.y));
        const glowGeometry = new THREE.BufferGeometry().setFromPoints(glowPoints);
        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.4,
            depthWrite: false,
        });
        glowRing = new THREE.LineLoop(glowGeometry, glowMaterial);
        glowRing.rotation.x = Math.PI / 2.5;
        holder.add(glowRing);

        function resizeRenderer() {
            const { clientWidth, clientHeight } = viewer;
            const height = Math.max(clientHeight, 1);
            renderer.setSize(clientWidth, height, false);
            camera.aspect = clientWidth / height;
            camera.updateProjectionMatrix();
        }

        window.addEventListener('resize', resizeRenderer);
        resizeRenderer();

        function render() {
            requestAnimationFrame(render);
            holder.rotation.y += rotationSpeed;
            currentScale += (targetScale - currentScale) * 0.05;
            planetGroup.scale.setScalar(currentScale);
            renderer.render(scene, camera);
        }
        render();
    }

    function clamp01(value, fallback) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return fallback;
        }
        return Math.min(Math.max(value, 0), 1);
    }

    function toCssRgba(color, alpha) {
        const [r, g, b] = color
            .clone()
            .multiplyScalar(255)
            .toArray()
            .map((v) => Math.max(0, Math.min(255, Math.round(v))));
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }

    function updateViewerColors(prediction, uncertainty) {
        if (!threeIsReady) {
            return;
        }

        const baseGreen = new THREE.Color(0x22c55e);
        const baseRed = new THREE.Color(0xef4444);
        const uncertaintyValue = clamp01(uncertainty, 0.5);
        const baseColor = prediction >= 0.5 ? baseGreen : baseRed;

        const lineColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.2 + (1 - uncertaintyValue) * 0.35);
        const glowColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35 + uncertaintyValue * 0.25);
        const coreColor = baseColor.clone().lerp(new THREE.Color(0x0f172a), 0.6 + uncertaintyValue * 0.3);

        lineMaterials.forEach((material) => {
            material.color.copy(lineColor);
            material.opacity = 0.25 + (1 - uncertaintyValue) * 0.6;
        });

        surfaceMaterial.color.copy(coreColor);
        surfaceMaterial.emissive.copy(lineColor.clone().multiplyScalar(0.6));
        surfaceMaterial.opacity = 0.15 + (1 - uncertaintyValue) * 0.25;

        glowRing.material.color.copy(glowColor);
        glowRing.material.opacity = 0.25 + (1 - uncertaintyValue) * 0.45;

        const haloStrength = 0.3 + (1 - uncertaintyValue) * 0.5;
        const haloCss = toCssRgba(glowColor, haloStrength);
        const coreCss = toCssRgba(lineColor, 0.16 + (1 - uncertaintyValue) * 0.25);
        if (viewer) {
            viewer.style.background = `radial-gradient(circle at center, ${coreCss}, rgba(14, 24, 52, 0.65))`;
            viewer.style.boxShadow = `0 0 ${70 + (1 - uncertaintyValue) * 80}px ${haloCss}`;
        }
    }

    function formatNumber(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return '-';
        }
        if (Math.abs(value) >= 100) {
            return value.toFixed(0);
        }
        if (Math.abs(value) >= 10) {
            return value.toFixed(1);
        }
        return value.toFixed(2);
    }

    function selectPlanet(index, sourceRow) {
        const rowData = payload[index] || null;
        rows.forEach((row) => row.classList.toggle('active', row === sourceRow));

        const name = rowData && rowData.name ? rowData.name : (sourceRow ? sourceRow.getAttribute('data-name') : 'Planeta');
        if (nameField) {
            nameField.textContent = name || 'Planeta';
        }

        const radius = rowData ? rowData.radius : null;
        const prediction = rowData ? rowData.prediction : null;
        const uncertainty = rowData ? rowData.uncertainty : null;

        if (radiusField) {
            radiusField.textContent = formatNumber(radius);
        }
        if (predictionField) {
            predictionField.textContent = typeof prediction === 'number' && !Number.isNaN(prediction)
                ? prediction.toFixed(2)
                : '-';
        }
        if (uncertaintyField) {
            uncertaintyField.textContent = typeof uncertainty === 'number' && !Number.isNaN(uncertainty)
                ? uncertainty.toFixed(2)
                : '-';
        }

        if (threeIsReady) {
            const effectiveRadius = typeof radius === 'number' && radius > 0 ? radius : 1;
            const scale = Math.max(0.6, Math.min(1 + Math.log10(effectiveRadius + 1), 2.6));
            targetScale = scale;
            rotationSpeed = 0.008 + clamp01(prediction ?? 0, 0) * 0.01;
            updateViewerColors(prediction ?? 0, uncertainty);
        }
    }

    if (threeIsReady) {
        setupScene();
    }

    rows.forEach((row, fallbackIndex) => {
        const index = Number.isInteger(Number(row.dataset.index))
            ? Number(row.dataset.index)
            : fallbackIndex;
        row.dataset.index = index;
        row.addEventListener('click', () => selectPlanet(index, row));
    });

    const firstRow = rows[0];
    selectPlanet(Number(firstRow.dataset.index) || 0, firstRow);
})();
