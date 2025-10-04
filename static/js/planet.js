(function () {
    const viewer = document.getElementById('planet-viewer');
    const nameField = document.getElementById('planet-name');
    const radiusField = document.getElementById('planet-radius');
    const predictionField = document.getElementById('planet-prediction');
    const rows = Array.from(document.querySelectorAll('.planet-row'));
    const payloadSource = window.PLANETS_PAYLOAD;
    const payload = Array.isArray(payloadSource) ? payloadSource : [];

    const threeIsReady = typeof window.THREE !== 'undefined' && viewer;

    let renderer;
    let camera;
    let holder;
    let planet;
    let glowRing;

    let rotationSpeed = 0.01;
    let targetScale = 1;
    let currentScale = 1;

    if (threeIsReady) {
        const scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(
            45,
            viewer.clientWidth / Math.max(viewer.clientHeight, 1),
            0.1,
            100
        );
        camera.position.set(0, 0, 4);

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setPixelRatio(window.devicePixelRatio);
        renderer.setSize(viewer.clientWidth, Math.max(viewer.clientHeight, 1));
        viewer.appendChild(renderer.domElement);

        const ambient = new THREE.AmbientLight(0x6b7280, 0.65);
        scene.add(ambient);
        const point = new THREE.PointLight(0x38bdf8, 1.6, 20);
        point.position.set(2, 3, 4);
        scene.add(point);

        holder = new THREE.Group();
        scene.add(holder);

        planet = new THREE.Group();
        holder.add(planet);
        planet.rotation.z = THREE.MathUtils.degToRad(18);

        const surface = new THREE.Mesh(
            new THREE.SphereGeometry(1, 48, 32),
            new THREE.MeshPhongMaterial({
                color: 0x0f172a,
                emissive: 0x1d4ed8,
                emissiveIntensity: 0.35,
                shininess: 80,
                transparent: true,
                opacity: 0.55,
            })
        );
        planet.add(surface);

        const wireframe = new THREE.LineSegments(
            new THREE.WireframeGeometry(new THREE.SphereGeometry(1.02, 28, 20)),
            new THREE.LineBasicMaterial({
                color: 0x38bdf8,
                transparent: true,
                opacity: 0.85,
            })
        );
        wireframe.material.depthWrite = false;
        planet.add(wireframe);

        const latitudes = new THREE.Group();
        for (let i = -2; i <= 2; i += 1) {
            const t = (i / 5) * (Math.PI / 2);
            const radius = Math.cos(t);
            const y = Math.sin(t);
            const curve = new THREE.EllipseCurve(0, 0, radius, radius, 0, Math.PI * 2);
            const points = curve.getPoints(120);
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({
                color: 0x7dd3fc,
                transparent: true,
                opacity: 0.45,
            });
            const circle = new THREE.LineLoop(geometry, material);
            circle.rotation.x = Math.PI / 2;
            circle.position.y = y;
            latitudes.add(circle);
        }
        planet.add(latitudes);

        const glowCurve = new THREE.EllipseCurve(0, 0, 1.45, 1.2, 0, Math.PI * 2);
        const glowPoints = glowCurve.getPoints(150);
        const glowGeometry = new THREE.BufferGeometry().setFromPoints(glowPoints);
        const glowMaterial = new THREE.LineBasicMaterial({
            color: 0x3b82f6,
            transparent: true,
            opacity: 0.35,
        });
        glowRing = new THREE.LineLoop(glowGeometry, glowMaterial);
        glowRing.rotation.x = Math.PI / 2.4;
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
            planet.scale.setScalar(currentScale);
            renderer.render(scene, camera);
        }
        render();
    }

    function formatNumber(value) {
        if (typeof value !== 'number' || Number.isNaN(value)) {
            return '-';
        }
        if (value >= 100) {
            return value.toFixed(0);
        }
        if (value >= 10) {
            return value.toFixed(1);
        }
        return value.toFixed(2);
    }

    function selectPlanet(name, sourceRow) {
        rows.forEach((row) => row.classList.toggle('active', row === sourceRow));
        const data = payload.find((item) => item && item.name === name) || null;

        nameField.textContent = name || 'Planeta';
        let radius = data && typeof data.radius === 'number' ? data.radius : null;
        const prediction = data && typeof data.prediction === 'number' ? data.prediction : null;

        radiusField.textContent = formatNumber(radius);
        predictionField.textContent = prediction !== null && !Number.isNaN(prediction)
            ? prediction.toFixed(2)
            : '-';

        if (!threeIsReady || !planet) {
            return;
        }

        if (radius === null || Number.isNaN(radius) || radius <= 0) {
            radius = 1;
        }
        const scale = Math.max(0.6, Math.min(1 + Math.log10(radius + 1), 2.4));
        targetScale = scale;

        rotationSpeed = 0.008 + (prediction ? Math.min(prediction, 2) * 0.002 : 0);
        if (glowRing) {
            glowRing.material.opacity = 0.25 + Math.min(scale / 2.5, 0.4);
        }
    }

    rows.forEach((row) => {
        row.addEventListener('click', () => {
            const name = row.getAttribute('data-name');
            selectPlanet(name, row);
        });
    });

    if (rows.length) {
        const firstRow = rows[0];
        selectPlanet(firstRow.getAttribute('data-name'), firstRow);
    }
})();
