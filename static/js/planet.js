(function () {
    const viewer = document.getElementById("planet-viewer");
    const nameField = document.getElementById("planet-name");
    const radiusField = document.getElementById("planet-radius");
    const predictionField = document.getElementById("planet-prediction");
    const uncertaintyField = document.getElementById("planet-uncertainty");
    const rows = Array.from(document.querySelectorAll(".planet-row"));
    const payload = Array.isArray(window.PLANETS_PAYLOAD) ? window.PLANETS_PAYLOAD : [];

    if (!rows.length) {
        return;
    }

    const hasThree = Boolean(viewer && window.THREE);

    let renderer;
    let camera;
    let scene;
    let orbGroup;
    let glowMesh;
    let wireframeMaterial;
    let latitudeMaterial;
    let glowMaterial;

    let rotationSpeed = 0.01;
    let targetScale = 1;
    let currentScale = 1;

    function clamp01(value, fallback) {
        if (typeof value !== "number" || Number.isNaN(value)) {
            return fallback;
        }
        return Math.min(Math.max(value, 0), 1);
    }

    function toCssRgba(color, alpha) {
        const [r, g, b] = color
            .clone()
            .multiplyScalar(255)
            .toArray()
            .map((v) => Math.min(255, Math.max(0, Math.round(v))));
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }

    function createLatitude(angleDeg, material) {
        const radius = Math.cos(THREE.MathUtils.degToRad(angleDeg));
        const height = Math.sin(THREE.MathUtils.degToRad(angleDeg));
        const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
        const points = curve.getPoints(180).map((p) => new THREE.Vector3(p.x, 0, p.y));
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const loop = new THREE.LineLoop(geometry, material);
        loop.rotation.x = Math.PI / 2;
        loop.position.y = height;
        return loop;
    }

    function createMeridian(angleDeg, material) {
        const angle = THREE.MathUtils.degToRad(angleDeg);
        const points = [];
        const segments = 200;
        for (let i = 0; i <= segments; i += 1) {
            const phi = -Math.PI / 2 + (i / segments) * Math.PI;
            points.push(new THREE.Vector3(
                Math.cos(phi) * Math.cos(angle),
                Math.sin(phi),
                Math.cos(phi) * Math.sin(angle),
            ));
        }
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        return new THREE.Line(geometry, material);
    }

    function createGlow() {
        const geometry = new THREE.RingGeometry(1.3, 1.6, 128);
        const material = new THREE.MeshBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.4,
            side: THREE.DoubleSide,
            depthWrite: false,
        });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.rotation.x = Math.PI / 2.4;
        return { mesh, material };
    }

    function setupScene() {
        scene = new THREE.Scene();
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
        if (renderer.outputColorSpace !== undefined) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        viewer.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.45);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xffffff, 0.95);
        key.position.set(3, 4, 5);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.55);
        rim.position.set(-4, -3, -4);
        scene.add(rim);

        orbGroup = new THREE.Group();
        orbGroup.rotation.set(
            THREE.MathUtils.degToRad(18),
            THREE.MathUtils.degToRad(-6),
            THREE.MathUtils.degToRad(14)
        );
        scene.add(orbGroup);

        wireframeMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
        });
        const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 36, 24)),
            wireframeMaterial
        );
        orbGroup.add(wireframe);

        latitudeMaterial = wireframeMaterial.clone();
        latitudeMaterial.opacity = 0.45;
        [15, 30, 45, 60].forEach((deg) => {
            orbGroup.add(createLatitude(deg, latitudeMaterial));
            orbGroup.add(createLatitude(-deg, latitudeMaterial));
        });

        [0, 20, 40, 60, 80, 100, 120, 140, 160].forEach((deg) => {
            const meridian = createMeridian(deg, latitudeMaterial);
            orbGroup.add(meridian);
        });

        const glow = createGlow();
        glowMesh = glow.mesh;
        glowMaterial = glow.material;
        orbGroup.add(glowMesh);

        function onResize() {
            const { clientWidth, clientHeight } = viewer;
            const height = Math.max(clientHeight, 1);
            renderer.setSize(clientWidth, height, false);
            camera.aspect = clientWidth / height;
            camera.updateProjectionMatrix();
        }

        window.addEventListener("resize", onResize);
        onResize();

        function render() {
            requestAnimationFrame(render);
            orbGroup.rotation.y += rotationSpeed;
            currentScale += (targetScale - currentScale) * 0.05;
            orbGroup.scale.setScalar(currentScale);
            renderer.render(scene, camera);
        }
        render();
    }

    function updateViewerColors(prediction, uncertainty) {
        if (!hasThree) {
            return;
        }

        const baseGreen = new THREE.Color(0x2ddf85);
        const baseRed = new THREE.Color(0xff5d5d);
        const baseColor = (typeof prediction === "number" && prediction >= 0.5) ? baseGreen : baseRed;
        const uncertaintyValue = clamp01(uncertainty, 0.5);

        const accentColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.3 + (1 - uncertaintyValue) * 0.35);
        const softColor = baseColor.clone().lerp(new THREE.Color(0x0b1120), 0.65 + uncertaintyValue * 0.25);
        const haloColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.4 + uncertaintyValue * 0.3);

        wireframeMaterial.color.copy(accentColor);
        wireframeMaterial.opacity = 0.75 + (1 - uncertaintyValue) * 0.25;
        wireframeMaterial.needsUpdate = true;

        latitudeMaterial.color.copy(accentColor);
        latitudeMaterial.opacity = 0.35 + (1 - uncertaintyValue) * 0.3;
        latitudeMaterial.needsUpdate = true;

        glowMaterial.color.copy(haloColor);
        glowMaterial.opacity = 0.28 + (1 - uncertaintyValue) * 0.45;
        glowMaterial.needsUpdate = true;

        if (viewer) {
            const haloCss = toCssRgba(haloColor, 0.35 + (1 - uncertaintyValue) * 0.45);
            const coreCss = toCssRgba(softColor, 0.25 + (1 - uncertaintyValue) * 0.35);
            viewer.style.background = `radial-gradient(circle at center, ${coreCss}, rgba(8, 13, 27, 0.85))`;
            viewer.style.boxShadow = `0 0 ${70 + (1 - uncertaintyValue) * 120}px ${haloCss}`;
        }
    }

    function formatNumber(value) {
        if (typeof value !== "number" || Number.isNaN(value)) {
            return "-";
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
        rows.forEach((row) => row.classList.toggle("active", row === sourceRow));

        const name = rowData && rowData.name ? rowData.name : (sourceRow ? sourceRow.getAttribute("data-name") : "Planeta");
        if (nameField) {
            nameField.textContent = name || "Planeta";
        }

        const radius = rowData ? rowData.radius : null;
        const prediction = rowData ? rowData.prediction : null;
        const uncertainty = rowData ? rowData.uncertainty : null;

        if (radiusField) {
            radiusField.textContent = formatNumber(radius);
        }
        if (predictionField) {
            predictionField.textContent = typeof prediction === "number" && !Number.isNaN(prediction)
                ? prediction.toFixed(2)
                : "-";
        }
        if (uncertaintyField) {
            uncertaintyField.textContent = typeof uncertainty === "number" && !Number.isNaN(uncertainty)
                ? uncertainty.toFixed(2)
                : "-";
        }

        if (hasThree) {
            const effectiveRadius = (typeof radius === "number" && radius > 0) ? radius : 1;
            targetScale = Math.max(0.65, Math.min(1 + Math.log10(effectiveRadius + 1), 2.2));
            rotationSpeed = 0.006 + clamp01(prediction ?? 0.5, 0.5) * 0.01;
            updateViewerColors(prediction ?? 0, uncertainty);
        }
    }

    if (hasThree) {
        setupScene();
    }

    rows.forEach((row, fallbackIndex) => {
        const index = Number.isInteger(Number(row.dataset.index))
            ? Number(row.dataset.index)
            : fallbackIndex;
        row.dataset.index = index;
        row.addEventListener("click", () => selectPlanet(index, row));
    });

    const firstRow = rows[0];
    selectPlanet(Number(firstRow.dataset.index) || 0, firstRow);
})();
