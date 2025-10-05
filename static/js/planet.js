(function () {
    const viewer = document.getElementById("planet-viewer");
    const nameField = document.getElementById("planet-name");
    const radiusField = document.getElementById("planet-radius");
    const predictionField = document.getElementById("planet-prediction");
    const rows = Array.from(document.querySelectorAll(".planet-row"));
    const payload = Array.isArray(window.PLANETS_PAYLOAD) ? window.PLANETS_PAYLOAD : [];
    const compareButton = document.querySelector(".compare-earth-btn");
    const comparisonPanel = document.querySelector(".earth-comparison");
    const comparisonPlanet = comparisonPanel ? comparisonPanel.querySelector('[data-role="planet"]') : null;
    const comparisonEarth = comparisonPanel ? comparisonPanel.querySelector('[data-role="earth"]') : null;
    const comparisonRatio = comparisonPanel ? comparisonPanel.querySelector(".earth-comparison__ratio") : null;

    if (!rows.length) {
        return;
    }

    const hasThree = Boolean(viewer && window.THREE);

    let renderer;
    let camera;
    let scene;
    let orbGroup;
    let wireframe;
    const overlayLoops = [];

    const SPHERE_RADIUS = 0.85;
    const LOOP_RADIUS = 0.82;
    const SEGMENTS = 200;

    const STATUS_STYLES = {
        0: { hex: 0xfacc15, rotation: 0.007 },
        1: { hex: 0x22c55e, rotation: 0.01 },
        2: { hex: 0xef4444, rotation: 0.008 },
        default: { hex: 0x38bdf8, rotation: 0.009 },
    };

    let rotationSpeed = STATUS_STYLES.default.rotation;
    let targetScale = 1;
    let currentScale = 1;
    let earthComparisonEnabled = false;
    let lastRadiusValue = null;

    const EARTH_BASE_DIAMETER = 120;
    const EARTH_MIN_DIAMETER = 12;
    const EARTH_RADIUS_KM = 6371;

    function toCssRgba(color, alpha) {
        const [r, g, b] = color
            .clone()
            .multiplyScalar(255)
            .toArray()
            .map((v) => Math.min(255, Math.max(0, Math.round(v))));
        return `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(3)})`;
    }

    function createCircleGeometry(radius) {
        const points = [];
        for (let i = 0; i <= SEGMENTS; i += 1) {
            const theta = (i / SEGMENTS) * Math.PI * 2;
            points.push(new THREE.Vector3(
                Math.cos(theta) * radius,
                Math.sin(theta) * radius,
                0,
            ));
        }
        return new THREE.BufferGeometry().setFromPoints(points);
    }

    function addGreatCircle(rx, ry, rz, radiusScale = 1, opacity = 0.26) {
        const geometry = createCircleGeometry(LOOP_RADIUS * radiusScale);
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity,
            depthWrite: false,
            depthTest: true,
        });
        const loop = new THREE.LineLoop(geometry, material);
        loop.rotation.set(rx, ry, rz);
        loop.renderOrder = 1;
        overlayLoops.push(loop);
        orbGroup.add(loop);
    }

    function addLatitude(angleDeg, opacity = 0.24) {
        const phi = THREE.MathUtils.degToRad(angleDeg);
        const radius = LOOP_RADIUS * Math.cos(phi);
        const height = LOOP_RADIUS * Math.sin(phi);
        const geometry = createCircleGeometry(radius);
        const material = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity,
            depthWrite: false,
            depthTest: true,
        });
        const loop = new THREE.LineLoop(geometry, material);
        loop.rotation.x = Math.PI / 2;
        loop.position.y = height;
        loop.renderOrder = 1;
        overlayLoops.push(loop);
        orbGroup.add(loop);
    }

    function setupScene() {
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
            42,
            viewer.clientWidth / Math.max(viewer.clientHeight, 1),
            0.1,
            100,
        );
        camera.position.set(0, 0, 4.1);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(viewer.clientWidth, Math.max(viewer.clientHeight, 1));
        if (renderer.outputColorSpace !== undefined) {
            renderer.outputColorSpace = THREE.SRGBColorSpace;
        }
        viewer.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0xffffff, 0.32);
        scene.add(ambient);
        const key = new THREE.DirectionalLight(0xffffff, 1.15);
        key.position.set(3.3, 3.1, 4.1);
        scene.add(key);
        const rim = new THREE.DirectionalLight(0xffffff, 0.42);
        rim.position.set(-3.1, -2.3, -4.2);
        scene.add(rim);

        orbGroup = new THREE.Group();
        orbGroup.rotation.set(
            THREE.MathUtils.degToRad(11),
            THREE.MathUtils.degToRad(-4),
            THREE.MathUtils.degToRad(6),
        );
        scene.add(orbGroup);

        const wireMaterial = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            depthTest: true,
        });
        wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(SPHERE_RADIUS, 26, 20)),
            wireMaterial,
        );
        wireframe.renderOrder = 1;
        orbGroup.add(wireframe);

        [18, -18, 42, -42, 66, -66].forEach((deg) => addLatitude(deg, deg === 18 || deg === -18 ? 0.28 : 0.22));

        [0, 36, 72, 108, 144].forEach((deg) => addGreatCircle(
            Math.PI / 2,
            THREE.MathUtils.degToRad(deg),
            0,
            1,
            0.24,
        ));

        addGreatCircle(0, 0, 0, 1, 0.3);
        addGreatCircle(0, Math.PI / 2, 0, 1, 0.28);
        addGreatCircle(Math.PI / 2, 0, 0, 1, 0.28);

        addGreatCircle(Math.PI / 4, 0, Math.PI / 6, 0.97, 0.25);
        addGreatCircle(-Math.PI / 4, 0, Math.PI / 6, 0.97, 0.25);
        addGreatCircle(Math.PI / 4, 0, -Math.PI / 6, 0.97, 0.25);
        addGreatCircle(-Math.PI / 4, 0, -Math.PI / 6, 0.97, 0.25);

        addGreatCircle(Math.PI / 6, Math.PI / 3, 0, 0.92, 0.2);
        addGreatCircle(-Math.PI / 6, Math.PI / 3, 0, 0.92, 0.2);
        addGreatCircle(Math.PI / 6, -Math.PI / 3, 0, 0.92, 0.2);
        addGreatCircle(-Math.PI / 6, -Math.PI / 3, 0, 0.92, 0.2);

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
            currentScale += (targetScale - currentScale) * 0.06;
            orbGroup.scale.setScalar(currentScale);
            renderer.render(scene, camera);
        }
        render();
    }

    function getStatusConfig(code) {
        if (Object.prototype.hasOwnProperty.call(STATUS_STYLES, code)) {
            return STATUS_STYLES[code];
        }
        return STATUS_STYLES.default;
    }

    function updateViewerAppearance(statusCode) {
        if (!hasThree) {
            return;
        }

        const config = getStatusConfig(statusCode);
        const baseColor = new THREE.Color(config.hex);
        const accentColor = baseColor.clone().lerp(new THREE.Color(0xffffff), 0.35);
        const secondaryColor = baseColor.clone().lerp(new THREE.Color(0x081126), 0.65);

        wireframe.material.color.copy(accentColor);
        wireframe.material.opacity = 0.82;
        wireframe.material.needsUpdate = true;

        overlayLoops.forEach((loop, index) => {
            const material = loop.material;
            material.color.copy(accentColor);
            material.opacity = 0.26 + (index % 4 === 0 ? 0.12 : 0);
            material.needsUpdate = true;
        });

        if (viewer) {
            const haloCss = toCssRgba(baseColor.clone().lerp(new THREE.Color(0xffffff), 0.1), 0.5);
            const coreCss = toCssRgba(secondaryColor, 0.55);
            viewer.style.background = `radial-gradient(circle at center, ${coreCss}, rgba(8, 13, 27, 0.9))`;
            viewer.style.boxShadow = `0 0 90px ${haloCss}`;
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

    function computeScale(radius) {
        if (typeof radius !== "number" || Number.isNaN(radius) || radius <= 0) {
            return 1;
        }
        const clamped = Math.min(Math.max(radius, 0.3), 40);
        const normalized = Math.sqrt(clamped / 40);
        return 0.8 + normalized * 0.45;
    }

    function updateEarthComparison(radius) {
        if (!compareButton || !comparisonPanel || !comparisonPlanet || !comparisonEarth || !comparisonRatio) {
            return;
        }

        lastRadiusValue = radius;

        const valid = typeof radius === "number" && !Number.isNaN(radius) && radius > 0;
        if (!valid) {
            earthComparisonEnabled = false;
            compareButton.disabled = true;
            compareButton.setAttribute("aria-pressed", "false");
            compareButton.textContent = "Show Earth comparison";
            comparisonPanel.hidden = true;
            comparisonRatio.textContent = "Planet radius unavailable.";
            return;
        }

        compareButton.disabled = false;

        const ratio = radius;
        let planetDiameter;
        let earthDiameter;

        if (ratio >= 1) {
            planetDiameter = EARTH_BASE_DIAMETER;
            earthDiameter = Math.max(EARTH_BASE_DIAMETER / ratio, EARTH_MIN_DIAMETER);
        } else {
            earthDiameter = EARTH_BASE_DIAMETER;
            planetDiameter = Math.max(EARTH_BASE_DIAMETER * ratio, EARTH_MIN_DIAMETER);
        }

        comparisonPlanet.style.width = `${planetDiameter}px`;
        comparisonPlanet.style.height = `${planetDiameter}px`;
        comparisonEarth.style.width = `${earthDiameter}px`;
        comparisonEarth.style.height = `${earthDiameter}px`;

        const rounded = ratio >= 10 ? ratio.toFixed(1) : ratio.toFixed(2);
        const planetRadiusKm = EARTH_RADIUS_KM * ratio;
        const kmDisplay = planetRadiusKm >= 1000
            ? planetRadiusKm.toLocaleString(undefined, { maximumFractionDigits: 0 })
            : planetRadiusKm.toFixed(1);
        comparisonRatio.textContent = `Radius is ${rounded}× Earth's radius (~${kmDisplay} km).`;

        comparisonPanel.hidden = !earthComparisonEnabled;
        compareButton.setAttribute("aria-pressed", earthComparisonEnabled ? "true" : "false");
    }

    function toggleEarthComparison() {
        if (!comparisonPanel) {
            return;
        }
        earthComparisonEnabled = !earthComparisonEnabled;
        compareButton.setAttribute("aria-pressed", earthComparisonEnabled ? "true" : "false");
        compareButton.textContent = earthComparisonEnabled ? "Hide Earth comparison" : "Show Earth comparison";

        if (!earthComparisonEnabled) {
            comparisonPanel.hidden = true;
            return;
        }

        if (typeof lastRadiusValue === "number" && !Number.isNaN(lastRadiusValue) && lastRadiusValue > 0) {
            comparisonPanel.hidden = false;
        } else {
            comparisonPanel.hidden = true;
        }
    }

    function selectPlanet(index, sourceRow) {
        const rowData = payload[index] || null;
        rows.forEach((row) => row.classList.toggle("active", row === sourceRow));

        const fallbackName = sourceRow ? sourceRow.getAttribute("data-name") : "Planet";
        const name = rowData && rowData.name ? rowData.name : fallbackName;
        if (nameField) {
            nameField.textContent = name || "Planet";
        }

        const radius = rowData ? rowData.radius : null;
        const predictionCode = rowData ? rowData.prediction_code : null;
        const predictionLabel = rowData ? rowData.prediction_label : null;
        const predictionClass = rowData ? rowData.prediction_class : null;

        radiusField.textContent = formatNumber(radius);

        if (predictionField) {
            const classes = ["prediction-badge"];
            if (predictionClass) {
                classes.push(predictionClass);
            }
            predictionField.className = classes.join(" ");
            predictionField.textContent = predictionLabel || "Unknown";
            if (predictionCode !== null && predictionCode !== undefined) {
                predictionField.dataset.code = String(predictionCode);
            } else {
                delete predictionField.dataset.code;
            }
        }

        if (hasThree) {
            targetScale = computeScale(radius);
            const config = getStatusConfig(predictionCode);
            rotationSpeed = config.rotation;
            updateViewerAppearance(predictionCode);
        }

        updateEarthComparison(radius);
    }

    if (hasThree) {
        setupScene();
    }

    if (compareButton) {
        compareButton.addEventListener("click", toggleEarthComparison);
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
