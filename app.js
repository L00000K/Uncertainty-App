document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════
    //  DOM REFERENCES
    // ═══════════════════════════════════════

    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('csv-upload');
    const processBtn = document.getElementById('process-btn');
    const sigmaSlider = document.getElementById('sigma-slider');
    const sigmaVal = document.getElementById('sigma-value');
    const minPtsSlider = document.getElementById('min-pts-slider');
    const minPtsVal = document.getElementById('min-pts-value');
    const minDistSlider = document.getElementById('min-dist-slider');
    const minDistVal = document.getElementById('min-dist-value');
    const maxDistSlider = document.getElementById('max-dist-slider');
    const maxDistVal = document.getElementById('max-dist-value');
    const normalizeCheck = document.getElementById('normalize-check');
    const trendInfo = document.getElementById('trend-info');
    const trendEquation = document.getElementById('trend-equation');
    const confidenceSelect = document.getElementById('confidence-select');

    const loader = processBtn.querySelector('.loader');
    const btnText = processBtn.querySelector('.btn-text');

    // Taper Helper Function for Local Variablity weights
    function getVariabilityWeight(dSq, maxDistSq, maxDist) {
        if (maxDistSq === 0 || maxDist === 0) return 1;
        const d = Math.sqrt(dSq);
        const taperStart = 0.8 * maxDist; // 80% flat top

        if (d <= taperStart) return 1;
        if (d >= maxDist) return 0;

        const phase = ((d - taperStart) / (maxDist - taperStart)) * Math.PI;
        return 0.5 * (1 + Math.cos(phase));
    }

    const sliceModeSelect = document.getElementById('slice-mode');
    const sliceAngleSlider = document.getElementById('slice-angle');
    const sliceAngleVal = document.getElementById('slice-angle-val');
    const slicePosSlider = document.getElementById('slice-pos');
    const slicePosVal = document.getElementById('slice-pos-val');
    const sliceThickSlider = document.getElementById('slice-thick');
    const sliceThickVal = document.getElementById('slice-thick-val');
    const sliceThickGroup = document.getElementById('slice-thick-group');
    const veFinalSlider = document.getElementById('f-ve-slider');
    const veFinalVal = document.getElementById('f-ve-val');

    const stat = {
        pts: document.getElementById('stat-points'),
        pairs: document.getElementById('stat-pairs'),
        maxdist: document.getElementById('stat-maxdist'),
        maxdz: document.getElementById('stat-maxdz'),
    };

    let pointData = null;   // { x:[], y:[], z:[] }
    let rawZ = null;        // original Z values before normalisation
    let globalMaxDist = 1;
    let variogramReady = false;
    let globalTrend = null;

    let threeScene, threeCamera, threeRenderer, labelRenderer, orbit;
    let threeMeshes = {};

    let fScene, fCamera, fRenderer, fOrbit;
    let fMeshes = {};
    let fClipPlanes = [];

    // Leaflet maps — we keep references so we can destroy / rebuild
    let inputPlanMap = null;
    let zoiMap = null;
    let varMap = null;
    let zoiOverlay = null;
    let zoiMarkers = null;
    let varOverlay = null;
    let varMarkers = null;
    let uncertMap = null;
    let uncertOverlay = null;
    let uncertMarkers = null;

    // ═══════════════════════════════════════
    //  TAB SYSTEM
    // ═══════════════════════════════════════

    function setupTabs(containerSel, btnClass, viewClass) {
        const btns = document.querySelectorAll(containerSel + ' .' + btnClass);
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                const parent = btn.closest(containerSel) || btn.parentElement;
                // find views — siblings in the same primary-view or sub-view-container
                const primaryView = btn.closest('.primary-view') || document;
                const views = primaryView.querySelectorAll('.' + viewClass);
                const sibBtns = parent.querySelectorAll('.' + btnClass);

                sibBtns.forEach(b => b.classList.remove('active'));
                views.forEach(v => v.classList.remove('active'));

                btn.classList.add('active');
                const target = document.getElementById(btn.dataset.target);
                if (target) target.classList.add('active');

                window.dispatchEvent(new Event('resize'));
                invalidateLeaflets();
            });
        });
    }

    // Sidebar Accordion Steps
    document.querySelectorAll('.sidebar-step .step-title').forEach(title => {
        title.addEventListener('click', () => {
            const step = title.closest('.sidebar-step');
            if (step.classList.contains('active')) return;

            document.querySelectorAll('.sidebar-step').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.primary-view').forEach(v => v.classList.remove('active'));

            step.classList.add('active');
            const targetId = step.dataset.target;
            if (targetId) {
                document.getElementById(targetId).classList.add('active');
            }
            window.dispatchEvent(new Event('resize'));
            setTimeout(invalidateLeaflets, 120);
        });
    });

    // Sub-tabs inside each primary view
    document.querySelectorAll('.sub-tabs').forEach(container => {
        container.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
                const parentView = container.closest('.primary-view');
                parentView.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
                window.dispatchEvent(new Event('resize'));
                setTimeout(invalidateLeaflets, 120);
            });
        });
    });

    function invalidateLeaflets() {
        [inputPlanMap, zoiMap, varMap].forEach(m => { if (m) m.invalidateSize(); });
    }

    // ═══════════════════════════════════════
    //  SLIDERS
    // ═══════════════════════════════════════

    sigmaSlider.addEventListener('input', e => {
        sigmaVal.textContent = e.target.value;
        if (variogramReady) updateGaussianCurve();
        if (zoiMap && pointData) renderZoiOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });
    minPtsSlider.addEventListener('input', e => {
        minPtsVal.textContent = e.target.value;
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });
    minDistSlider.addEventListener('input', e => {
        minDistVal.textContent = e.target.value;
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });
    maxDistSlider.addEventListener('input', e => {
        maxDistVal.textContent = e.target.value;
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });
    confidenceSelect.addEventListener('change', () => {
        if (uncertMap && pointData) renderUncertOverlay();
        if (fScene && pointData) renderFinal3DView();
    });

    veFinalSlider.addEventListener('input', e => {
        veFinalVal.textContent = e.target.value;
        if (fScene && pointData) renderFinal3DView();
    });

    sliceModeSelect.addEventListener('change', () => {
        sliceThickGroup.style.display = (sliceModeSelect.value === 'slice') ? 'block' : 'none';
        updateClippingPlanes();
    });
    sliceAngleSlider.addEventListener('input', e => {
        sliceAngleVal.textContent = e.target.value;
        updateClippingPlanes();
    });
    slicePosSlider.addEventListener('input', e => {
        slicePosVal.textContent = e.target.value;
        updateClippingPlanes();
    });
    sliceThickSlider.addEventListener('input', e => {
        sliceThickVal.textContent = e.target.value;
        updateClippingPlanes();
    });

    // ═══════════════════════════════════════
    //  FILE HANDLING
    // ═══════════════════════════════════════

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }, false));
    ['dragenter', 'dragover'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.add('dragover')));
    ['dragleave', 'drop'].forEach(ev => dropArea.addEventListener(ev, () => dropArea.classList.remove('dragover')));

    dropArea.addEventListener('drop', e => { if (e.dataTransfer.files.length) handleFile(e.dataTransfer.files[0]); });
    fileInput.addEventListener('change', e => { if (e.target.files.length) handleFile(e.target.files[0]); });

    function handleFile(file) {
        const msg = dropArea.querySelector('.file-message');
        msg.textContent = `Parsing: ${file.name}…`;
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete(r) {
                parseRows(r.data);
                if (pointData && pointData.x.length > 2) {
                    msg.textContent = `${file.name} (${pointData.x.length} pts)`;
                    processBtn.disabled = false;
                } else { msg.textContent = 'Could not parse X, Y, Z columns.'; }
            },
            error() { msg.textContent = 'Error reading file.'; }
        });
    }

    function parseRows(data) {
        if (!data.length) return;
        const k = Object.keys(data[0]);
        let xK = k.find(c => /^x$|easting/i.test(c));
        let yK = k.find(c => /^y$|northing/i.test(c));
        let zK = k.find(c => /^z$|elevation|level/i.test(c));
        if (!xK || !yK || !zK) { xK = k[0]; yK = k[1]; zK = k[2]; }

        const x = [], y = [], z = [];
        data.forEach(r => {
            const vx = parseFloat(r[xK]), vy = parseFloat(r[yK]), vz = parseFloat(r[zK]);
            if (!isNaN(vx) && !isNaN(vy) && !isNaN(vz)) { x.push(vx); y.push(vy); z.push(vz); }
        });
        pointData = { x, y, z };
        stat.pts.textContent = x.length;
        stat.pairs.textContent = ((x.length * (x.length - 1)) / 2).toLocaleString();
    }

    // ═══════════════════════════════════════
    //  PROCESS BUTTON
    // ═══════════════════════════════════════

    // Remove any previous error banner
    function clearError() {
        document.querySelector('.error-banner')?.remove();
    }
    function showError(msg) {
        clearError();
        const div = document.createElement('div');
        div.className = 'error-banner';
        div.textContent = '⚠ ' + msg;
        processBtn.parentElement.insertBefore(div, processBtn.nextSibling);
    }

    processBtn.addEventListener('click', () => {
        if (!pointData) return;
        clearError();
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
        processBtn.disabled = true;
        setTimeout(() => {
            try {
                applyNormalisation();
                computeVariogram();
                renderInputPlan();
                render3DView();
                initZoiMap();
                initVariabilityMap();
                initUncertMap();
                renderFinal3DView();
            } catch (err) {
                console.error('Processing error:', err);
                showError(err.message || 'An unexpected error occurred during processing.');
            } finally {
                btnText.classList.remove('hidden');
                loader.classList.add('hidden');
                processBtn.disabled = false;
            }
        }, 80);
    });

    // ═══════════════════════════════════════
    //  NORMALISATION (First-Order Detrending)
    // ═══════════════════════════════════════

    function applyNormalisation() {
        // Always reset Z to original raw values first
        if (rawZ) {
            pointData.z = rawZ.slice();
        } else {
            rawZ = pointData.z.slice();
        }

        if (!normalizeCheck.checked) {
            trendInfo.classList.add('hidden');
            globalTrend = null;
            return;
        }

        // Fit plane: Z = a*X + b*Y + c  via least-squares (normal equations)
        const n = pointData.x.length;
        let sx = 0, sy = 0, sz = 0;
        let sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;

        for (let i = 0; i < n; i++) {
            const x = pointData.x[i], y = pointData.y[i], z = pointData.z[i];
            sx += x; sy += y; sz += z;
            sxx += x * x; syy += y * y; sxy += x * y;
            sxz += x * z; syz += y * z;
        }

        // 3x3 system:  [sxx sxy sx] [a]   [sxz]
        //              [sxy syy sy] [b] = [syz]
        //              [sx  sy  n ] [c]   [sz ]
        // Solve via Cramer's rule
        const detA = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);

        if (Math.abs(detA) < 1e-20) {
            showError('Cannot fit trend plane — data may be collinear.');
            trendInfo.classList.add('hidden');
            return;
        }

        const a = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / detA;
        const b = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sy * sx) + sx * (sxy * sz - syz * sx)) / detA;
        const c = (sxx * (syy * sz - syz * sy) - sxy * (sxy * sz - syz * sx) + sxz * (sxy * sy - syy * sx)) / detA;

        // Subtract trend: residual = Z - (aX + bY + c)
        const residuals = [];
        for (let i = 0; i < n; i++) {
            residuals.push(pointData.z[i] - (a * pointData.x[i] + b * pointData.y[i] + c));
        }
        pointData.z = residuals;

        // Display the equation
        const sign = v => v >= 0 ? '+' : '';
        trendEquation.textContent = `Z = ${a.toFixed(6)}·X ${sign(b)}${b.toFixed(6)}·Y ${sign(c)}${c.toFixed(2)}`;
        trendInfo.classList.remove('hidden');
        globalTrend = { a, b, c };
    }

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    function bbox(pad = 0.15) {
        const minX = Math.min(...pointData.x), maxX = Math.max(...pointData.x);
        const minY = Math.min(...pointData.y), maxY = Math.max(...pointData.y);
        const rX = (maxX - minX) || 1, rY = (maxY - minY) || 1;
        return {
            minX: minX - rX * pad, maxX: maxX + rX * pad,
            minY: minY - rY * pad, maxY: maxY + rY * pad,
            rawMinX: minX, rawMaxX: maxX, rawMinY: minY, rawMaxY: maxY
        };
    }

    function leafletBounds(b) { return [[b.minY, b.minX], [b.maxY, b.maxX]]; }

    function makeLeaflet(containerId, existingMap) {
        if (existingMap) existingMap.remove();
        const m = L.map(containerId, { crs: L.CRS.Simple, minZoom: -5, maxZoom: 5, attributionControl: false });
        m.fitBounds(leafletBounds(bbox()));
        return m;
    }

    // Colour ramp: green → yellow → red
    function uncertaintyColour(f) {
        const r = Math.round(255 * Math.min(1, f * 2));
        const g = Math.round(255 * Math.min(1, 2 * (1 - f)));
        return [r, g, 0];
    }

    // Colour ramp for StDev: deep blue → cyan → yellow → red
    function stdevColour(t) {
        // t in [0,1]
        let r, g, b;
        if (t < 0.25) { const s = t / 0.25; r = 0; g = Math.round(255 * s); b = 255; }
        else if (t < 0.5) { const s = (t - 0.25) / 0.25; r = 0; g = 255; b = Math.round(255 * (1 - s)); }
        else if (t < 0.75) { const s = (t - 0.5) / 0.25; r = Math.round(255 * s); g = 255; b = 0; }
        else { const s = (t - 0.75) / 0.25; r = 255; g = Math.round(255 * (1 - s)); b = 0; }
        return [r, g, b];
    }

    // ═══════════════════════════════════════
    //  1. INPUT DATA — PLAN VIEW
    // ═══════════════════════════════════════

    function renderInputPlan() {
        document.querySelector('#input-plan .empty-state')?.remove();
        inputPlanMap = makeLeaflet('input-plan-map', inputPlanMap);

        for (let i = 0; i < pointData.x.length; i++) {
            const zVal = rawZ ? rawZ[i] : pointData.z[i];

            // Use the red diamond class
            const diamondIcon = L.divIcon({ className: 'leaflet-marker-diamond', iconSize: [10, 10] });
            L.marker([pointData.y[i], pointData.x[i]], { icon: diamondIcon }).addTo(inputPlanMap);

            // Permanent elevation label (always original elevation)
            L.tooltip({
                permanent: true, direction: 'right', offset: [8, 0],
                className: 'elevation-label'
            })
                .setContent(zVal.toFixed(2))
                .setLatLng([pointData.y[i], pointData.x[i]])
                .addTo(inputPlanMap);
        }
    }

    // ═══════════════════════════════════════
    //  2. INPUT DATA — 3D INTERPOLATION
    // ═══════════════════════════════════════

    function render3DView() {
        const container = document.getElementById('input-3d-plot');
        document.querySelector('#input-3d .empty-state')?.remove();
        document.getElementById('viewer-3d-legend')?.classList.remove('hidden');

        if (!threeScene) {
            threeScene = new THREE.Scene();
            threeScene.background = new THREE.Color(0xf0f2f5);

            threeCamera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
            threeCamera.position.set(0, 1.5, 2);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            threeRenderer.setSize(container.clientWidth, container.clientHeight);
            container.innerHTML = '';
            container.appendChild(threeRenderer.domElement);

            labelRenderer = new THREE.CSS2DRenderer();
            labelRenderer.setSize(container.clientWidth, container.clientHeight);
            labelRenderer.domElement.style.position = 'absolute';
            labelRenderer.domElement.style.top = '0px';
            labelRenderer.domElement.style.pointerEvents = 'none';
            container.appendChild(labelRenderer.domElement);

            orbit = new THREE.OrbitControls(threeCamera, threeRenderer.domElement);
            orbit.enableDamping = true;

            const light = new THREE.DirectionalLight(0xffffff, 1);
            light.position.set(1, 2, 1);
            threeScene.add(light);
            threeScene.add(new THREE.AmbientLight(0x404040, 2));

            threeScene.add(new THREE.AxesHelper(1));

            function animate() {
                requestAnimationFrame(animate);
                orbit.update();
                threeRenderer.render(threeScene, threeCamera);
                labelRenderer.render(threeScene, threeCamera);
            }
            animate();

            window.addEventListener('resize', () => {
                if (container.clientWidth) {
                    threeCamera.aspect = container.clientWidth / container.clientHeight;
                    threeCamera.updateProjectionMatrix();
                    threeRenderer.setSize(container.clientWidth, container.clientHeight);
                    labelRenderer.setSize(container.clientWidth, container.clientHeight);
                }
            });

            document.querySelectorAll('#viewer-3d-legend input').forEach(chk => {
                chk.addEventListener('change', e => {
                    if (threeMeshes[e.target.id]) {
                        threeMeshes[e.target.id].visible = e.target.checked;
                    }
                });
            });
        } else {
            ['layer-raw-pts', 'layer-raw-labels', 'layer-norm-plane', 'layer-norm-pts', 'layer-norm-labels', 'layer-interpolated'].forEach(id => {
                if (threeMeshes[id]) threeScene.remove(threeMeshes[id]);
            });
        }

        const b = bbox(0.05);
        const cx = (b.rawMinX + b.rawMaxX) / 2;
        const cy = (b.rawMinY + b.rawMaxY) / 2;
        const scaleXYZ = 1.0 / Math.max(b.rawMaxX - b.rawMinX, b.rawMaxY - b.rawMinY);
        const n = pointData.x.length;
        const isNormalized = normalizeCheck.checked;

        threeMeshes['layer-raw-pts'] = new THREE.Group();
        threeMeshes['layer-raw-labels'] = new THREE.Group();
        threeMeshes['layer-norm-plane'] = new THREE.Group();
        threeMeshes['layer-norm-pts'] = new THREE.Group();
        threeMeshes['layer-norm-labels'] = new THREE.Group();
        threeMeshes['layer-interpolated'] = new THREE.Group();
        Object.values(threeMeshes).forEach(m => threeScene.add(m));

        const sphereGeo = new THREE.SphereGeometry(0.015, 16, 16);
        const rawMat = new THREE.MeshLambertMaterial({ color: 0xdc2626 });
        const normMat = new THREE.MeshLambertMaterial({ color: 0x2563eb });

        const zRawOffset = rawZ ? rawZ : pointData.z;
        let cz = 0;
        for (let i = 0; i < n; i++) cz += zRawOffset[i];
        cz /= n;

        for (let i = 0; i < n; i++) {
            const px = (pointData.x[i] - cx) * scaleXYZ;
            const py = -(pointData.y[i] - cy) * scaleXYZ;
            const pzRaw = (zRawOffset[i] - cz) * scaleXYZ * 2;

            const rawMesh = new THREE.Mesh(sphereGeo, rawMat);
            rawMesh.position.set(px, pzRaw, py);
            threeMeshes['layer-raw-pts'].add(rawMesh);

            const rawDiv = document.createElement('div');
            rawDiv.className = 'label-3d';
            rawDiv.textContent = zRawOffset[i].toFixed(2);
            const rawLabel = new THREE.CSS2DObject(rawDiv);
            rawLabel.position.set(px, pzRaw + 0.03, py);
            threeMeshes['layer-raw-labels'].add(rawLabel);

            if (isNormalized) {
                const pzNorm = (pointData.z[i]) * scaleXYZ * 2;
                const normMesh = new THREE.Mesh(sphereGeo, normMat);
                normMesh.position.set(px, pzNorm, py);
                threeMeshes['layer-norm-pts'].add(normMesh);

                const normDiv = document.createElement('div');
                normDiv.className = 'label-3d label-3d-norm';
                normDiv.textContent = pointData.z[i].toFixed(2);
                const normLabel = new THREE.CSS2DObject(normDiv);
                normLabel.position.set(px, pzNorm + 0.03, py);
                threeMeshes['layer-norm-labels'].add(normLabel);
            }
        }

        if (isNormalized && globalTrend) {
            const corners = [[b.rawMinX, b.rawMinY], [b.rawMaxX, b.rawMinY], [b.rawMaxX, b.rawMaxY], [b.rawMinX, b.rawMaxY]];
            const vertices = new Float32Array(18);
            const indices = [0, 1, 2, 0, 2, 3];
            let idx = 0;
            indices.forEach(vIdx => {
                const vx = corners[vIdx][0], vy = corners[vIdx][1];
                const vz = globalTrend.a * vx + globalTrend.b * vy + globalTrend.c;
                vertices[idx++] = (vx - cx) * scaleXYZ;
                vertices[idx++] = (vz - cz) * scaleXYZ * 2;
                vertices[idx++] = -(vy - cy) * scaleXYZ;
            });
            const cGeo = new THREE.BufferGeometry();
            cGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
            cGeo.computeVertexNormals();
            const pMat = new THREE.MeshBasicMaterial({ color: 0x22c55e, opacity: 0.2, transparent: true, side: THREE.DoubleSide });
            const cMesh = new THREE.Mesh(cGeo, pMat);
            threeMeshes['layer-norm-plane'].add(cMesh);
        }

        const res = 40;
        const sigma3d = globalMaxDist / 3 || 200;
        const twoSS = 2 * sigma3d * sigma3d;
        const w = (b.rawMaxX - b.rawMinX) * scaleXYZ, h = (b.rawMaxY - b.rawMinY) * scaleXYZ;
        const surfGeo = new THREE.PlaneGeometry(w, h, res - 1, res - 1);
        surfGeo.rotateX(-Math.PI / 2);

        const positions = surfGeo.attributes.position;
        for (let i = 0; i < positions.count; i++) {
            const vx = positions.getX(i), vz = positions.getZ(i);
            const worldX = cx + (vx / scaleXYZ), worldY = cy - (vz / scaleXYZ);

            let wSum = 0, zSum = 0;
            for (let k = 0; k < n; k++) {
                const dx = worldX - pointData.x[k], dy = worldY - pointData.y[k];
                const wght = Math.exp(-(dx * dx + dy * dy) / twoSS);
                wSum += wght; zSum += pointData.z[k] * wght;
            }
            const zInterp = wSum > 1e-12 ? zSum / wSum : 0;
            const vy = isNormalized ? (zInterp * scaleXYZ * 2) : ((zInterp - cz) * scaleXYZ * 2);
            positions.setY(i, vy);
        }
        surfGeo.computeVertexNormals();

        const surfMat = new THREE.MeshLambertMaterial({ color: 0x8b5cf6, side: THREE.DoubleSide, opacity: 0.8, transparent: true });
        const surfMesh = new THREE.Mesh(surfGeo, surfMat);
        threeMeshes['layer-interpolated'].add(surfMesh);

        ['layer-raw-pts', 'layer-raw-labels', 'layer-norm-plane', 'layer-norm-pts', 'layer-norm-labels', 'layer-interpolated'].forEach(id => {
            const cb = document.getElementById(id);
            if (cb && threeMeshes[id]) threeMeshes[id].visible = cb.checked;
        });
    }

    // ═══════════════════════════════════════
    //  3. ZONE OF INFLUENCE — VARIOGRAM
    // ═══════════════════════════════════════

    function computeVariogram() {
        const n = pointData.x.length;
        const sDist = [], sDZ = [];
        let maxD = 0, maxZ = 0;

        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = pointData.x[i] - pointData.x[j], dy = pointData.y[i] - pointData.y[j];
                const d = Math.sqrt(dx * dx + dy * dy);
                const dz = Math.abs(pointData.z[i] - pointData.z[j]);
                sDist.push(d); sDZ.push(dz);
                if (d > maxD) maxD = d;
                if (dz > maxZ) maxZ = dz;
            }
        }

        globalMaxDist = maxD;
        stat.maxdist.textContent = maxD.toFixed(1) + ' m';
        stat.maxdz.textContent = maxZ.toFixed(2) + ' m';

        sigmaSlider.max = Math.ceil(maxD);
        sigmaSlider.value = Math.ceil(maxD / 3);
        sigmaVal.textContent = sigmaSlider.value;

        maxDistSlider.max = Math.ceil(maxD);
        maxDistSlider.value = Math.min(parseInt(maxDistSlider.value), Math.ceil(maxD));
        maxDistVal.textContent = maxDistSlider.value;
        minDistSlider.max = Math.ceil(maxD / 2);

        // Binned Upper Bound (95th Percentile)
        const nBins = 50, binSz = maxD / nBins;
        const bins = Array.from({ length: nBins }, () => ({ sumDist: 0, dzs: [] }));

        for (let i = 0; i < sDist.length; i++) {
            const idx = Math.min(Math.floor(sDist[i] / binSz), nBins - 1);
            bins[idx].sumDist += sDist[i];
            bins[idx].dzs.push(sDZ[i]);
        }

        const bX = [], bY = [];
        for (let i = 0; i < nBins; i++) {
            if (bins[i].dzs.length > 0) {
                bX.push(bins[i].sumDist / bins[i].dzs.length);
                bins[i].dzs.sort((a, b) => a - b);
                const p95Idx = Math.min(Math.floor(bins[i].dzs.length * 0.95), bins[i].dzs.length - 1);
                bY.push(bins[i].dzs[p95Idx]);
            }
        }

        renderVariogramPlot(sDist, sDZ, bX, bY);
    }

    function renderVariogramPlot(sDist, sDZ, bX, bY) {
        document.querySelector('#zoi-variogram .empty-state')?.remove();

        const t1 = {
            x: sDist, y: sDZ, mode: 'markers', type: sDist.length > 50000 ? 'scattergl' : 'scatter',
            marker: { color: 'rgba(37,99,235,0.4)', size: 5 }, name: 'Pairwise ΔZ', yaxis: 'y'
        };
        const t2 = {
            x: bX, y: bY, mode: 'lines+markers', type: 'scatter',
            marker: { color: '#dc2626', size: 6 }, line: { color: '#dc2626', width: 2, dash: 'dot' }, name: '95% Upper Bound', yaxis: 'y'
        };
        const t3 = { x: [0], y: [0], mode: 'lines', type: 'scatter', line: { color: '#16a34a', width: 3 }, name: 'f(d)', yaxis: 'y2' };

        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#1a1a2e', family: 'Inter' }, margin: { t: 35, l: 55, r: 55, b: 45 },
            title: { text: 'Pairwise ΔZ vs. Distance  |  Uncertainty Function', font: { size: 13 } },
            xaxis: { title: 'Distance (m)', gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db' },
            yaxis: { title: '|ΔZ| (m)', gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db', rangemode: 'tozero', side: 'left' },
            yaxis2: {
                title: 'f(d)', overlaying: 'y', side: 'right', range: [0, 1.05],
                gridcolor: 'rgba(22,163,74,0.1)', zerolinecolor: '#d1d5db',
                tickfont: { color: '#16a34a' }, titlefont: { color: '#16a34a' }
            },
            showlegend: true, legend: { x: .02, y: .98, bgcolor: 'rgba(255,255,255,0.8)' }
        };

        Plotly.newPlot('plotly-variogram', [t1, t2, t3], layout, { responsive: true, displayModeBar: true });
        variogramReady = true;
        updateGaussianCurve();
    }

    function updateGaussianCurve() {
        if (!variogramReady) return;
        const s = parseFloat(sigmaSlider.value), ss = 2 * s * s;
        const cx = [], cy = [], step = globalMaxDist / 200;
        for (let d = 0; d <= globalMaxDist; d += step) { cx.push(d); cy.push(1 - Math.exp(-d * d / ss)); }
        Plotly.restyle('plotly-variogram', { x: [cx], y: [cy] }, [2]);
    }

    // ═══════════════════════════════════════
    //  4. ZONE OF INFLUENCE — MAP
    // ═══════════════════════════════════════

    function initZoiMap() {
        document.querySelector('#zoi-map .empty-state')?.remove();
        zoiMap = makeLeaflet('zoi-leaflet-map', zoiMap);

        zoiMarkers = L.featureGroup().addTo(zoiMap);
        for (let i = 0; i < pointData.x.length; i++) {
            L.circleMarker([pointData.y[i], pointData.x[i]], {
                radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1
            }).addTo(zoiMarkers);
        }

        renderZoiOverlay();
        zoiMap.on('moveend', renderZoiOverlay);

        if (!zoiMap.legendControl) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'rgba(255,255,255,0.9)';
                div.style.padding = '8px';
                div.style.borderRadius = '6px';
                div.style.fontSize = '12px';
                div.innerHTML = `<b>Uncertainty f(d)</b><br>
                                 <i style="background: linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0)); width: 100px; height: 12px; display: inline-block; margin-top: 4px;"></i><br>
                                 <span style="float:left; font-weight:600;">0 &nbsp;</span> <span style="float:right; font-weight:600;">&nbsp; 1</span>`;
                return div;
            };
            legend.addTo(zoiMap);
            zoiMap.legendControl = legend;
        }
    }

    function renderZoiOverlay() {
        if (!zoiMap || !pointData) return;
        const sigma = parseFloat(sigmaSlider.value);
        const twoSS = 2 * sigma * sigma;
        const bounds = zoiMap.getBounds(), size = zoiMap.getSize();
        const W = Math.min(size.x, 300), H = Math.min(size.y, 300);
        const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
        const sx = (east - west) / W, sy = (north - south) / H;

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const n = pointData.x.length;

        for (let py = 0; py < H; py++) {
            const wy = north - py * sy;
            for (let pxx = 0; pxx < W; pxx++) {
                const wx = west + pxx * sx;
                let minSq = Infinity;
                for (let k = 0; k < n; k++) { const dx = wx - pointData.x[k], dy = wy - pointData.y[k]; const sq = dx * dx + dy * dy; if (sq < minSq) minSq = sq; }
                const f = 1 - Math.exp(-minSq / twoSS);
                const [r, g, b] = uncertaintyColour(f);
                const i = (py * W + pxx) * 4;
                px[i] = r; px[i + 1] = g; px[i + 2] = b; px[i + 3] = 180 + Math.round(40 * f);
            }
        }
        ctx.putImageData(img, 0, 0);
        if (zoiOverlay) zoiMap.removeLayer(zoiOverlay);
        zoiOverlay = L.imageOverlay(canvas.toDataURL(), [[south, west], [north, east]], { opacity: 0.75, interactive: false }).addTo(zoiMap);
        if (zoiMarkers) zoiMarkers.bringToFront();
    }

    // ═══════════════════════════════════════
    //  5. VARIABILITY — MOVING STDEV MAP
    // ═══════════════════════════════════════

    function initVariabilityMap() {
        document.querySelector('#variability-map-container .empty-state')?.remove();
        varMap = makeLeaflet('variability-map-container', varMap);

        varMarkers = L.featureGroup().addTo(varMap);
        for (let i = 0; i < pointData.x.length; i++) {
            L.circleMarker([pointData.y[i], pointData.x[i]], {
                radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1
            }).addTo(varMarkers);
        }

        renderVariabilityOverlay();
        varMap.on('moveend', renderVariabilityOverlay);

        if (!varMap.legendControl) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'rgba(255,255,255,0.9)';
                div.style.padding = '8px';
                div.style.borderRadius = '6px';
                div.style.fontSize = '12px';
                div.innerHTML = `<b>Variability (StDev)</b><br>
                                 <i style="background: linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0)); width: 100px; height: 12px; display: inline-block; margin-top: 4px;"></i><br>
                                 <span style="float:left; font-weight:600;">0 &nbsp;</span> <span style="float:right; font-weight:600;" id="var-legend-max">...</span>`;
                return div;
            };
            legend.addTo(varMap);
            varMap.legendControl = legend;
        }
    }

    function renderVariabilityOverlay() {
        if (!varMap || !pointData) return;

        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value);
        const maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist;
        const maxDistSq = maxDist * maxDist;

        const bounds = varMap.getBounds(), size = varMap.getSize();
        const W = Math.min(size.x, 250), H = Math.min(size.y, 250);
        const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
        const sx = (east - west) / W, sy = (north - south) / H;

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const n = pointData.x.length;

        let globalMaxStd = 0;

        // First pass: compute stdev grid
        const stdevGrid = new Float64Array(W * H);

        for (let py = 0; py < H; py++) {
            const wy = north - py * sy;
            for (let pxx = 0; pxx < W; pxx++) {
                const wx = west + pxx * sx;

                // Gather elevations and bisquare weights of contacts within [minDist, maxDist]
                const dataPoints = [];
                for (let k = 0; k < n; k++) {
                    const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                    const dSq = dx * dx + dy * dy;
                    if (dSq >= minDistSq && dSq <= maxDistSq) {
                        const w = getVariabilityWeight(dSq, maxDistSq, maxDist);
                        dataPoints.push({ z: pointData.z[k], w: w });
                    }
                }

                let sd = -1;
                if (dataPoints.length >= minPts) {
                    // Compute weighted mean and weighted standard deviation
                    let wSum = 0;
                    let wzSum = 0;
                    for (let p of dataPoints) {
                        wSum += p.w;
                        wzSum += p.w * p.z;
                    }
                    if (wSum > 1e-12) {
                        const wMean = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) {
                            varSum += p.w * (p.z - wMean) * (p.z - wMean);
                        }
                        sd = Math.sqrt(varSum / wSum);
                        if (sd > globalMaxStd) globalMaxStd = sd;
                    }
                }

                stdevGrid[py * W + pxx] = sd;
            }
        }

        // Second pass: colour pixels (normalise by global max)
        for (let py = 0; py < H; py++) {
            for (let pxx = 0; pxx < W; pxx++) {
                const idx = (py * W + pxx) * 4;
                const sd = stdevGrid[py * W + pxx];

                if (sd < 0) {
                    // Insufficient points — render dark semi-transparent
                    px[idx] = 200; px[idx + 1] = 200; px[idx + 2] = 210; px[idx + 3] = 120;
                } else {
                    const t = globalMaxStd > 0 ? sd / globalMaxStd : 0;
                    const [r, g, b] = stdevColour(t);
                    px[idx] = r; px[idx + 1] = g; px[idx + 2] = b; px[idx + 3] = 200;
                }
            }
        }

        ctx.putImageData(img, 0, 0);

        if (varOverlay) varMap.removeLayer(varOverlay);
        varOverlay = L.imageOverlay(canvas.toDataURL(), [[south, west], [north, east]], { opacity: 0.8, interactive: false }).addTo(varMap);
        if (varMarkers) varMarkers.bringToFront();

        const varMaxSpan = document.getElementById('var-legend-max');
        if (varMaxSpan) varMaxSpan.innerHTML = `&nbsp; ${globalMaxStd.toFixed(2)}`;
    }

    // ═══════════════════════════════════════
    //  6. UNCERTAINTY — MAP
    // ═══════════════════════════════════════

    function initUncertMap() {
        document.querySelector('#uncertainty-map-container .empty-state')?.remove();
        uncertMap = makeLeaflet('uncertainty-map-container', uncertMap);

        uncertMarkers = L.featureGroup().addTo(uncertMap);
        for (let i = 0; i < pointData.x.length; i++) {
            L.circleMarker([pointData.y[i], pointData.x[i]], {
                radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1
            }).addTo(uncertMarkers);
        }

        renderUncertOverlay();
        uncertMap.on('moveend', renderUncertOverlay);

        if (!uncertMap.legendControl) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.background = 'rgba(255,255,255,0.9)';
                div.style.padding = '8px';
                div.style.borderRadius = '6px';
                div.style.fontSize = '12px';
                div.innerHTML = `<b>Uncertainty</b><br>
                                 <i style="background: linear-gradient(to right, rgb(0,255,0), rgb(255,255,0), rgb(255,0,0)); width: 100px; height: 12px; display: inline-block; margin-top: 4px;"></i><br>
                                 <span style="float:left; font-weight:600;">0 &nbsp;</span> <span style="float:right; font-weight:600;" id="uncert-legend-max">...</span>`;
                return div;
            };
            legend.addTo(uncertMap);
            uncertMap.legendControl = legend;
        }
    }

    function renderUncertOverlay() {
        if (!uncertMap || !pointData) return;

        const sigma = parseFloat(sigmaSlider.value);
        const twoSS = 2 * sigma * sigma;

        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value);
        const maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist;
        const maxDistSq = maxDist * maxDist;

        const zScore = parseFloat(confidenceSelect.value); // 1, 2, or 3

        const bounds = uncertMap.getBounds(), size = uncertMap.getSize();
        const W = Math.min(size.x, 250), H = Math.min(size.y, 250);
        const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
        const sx = (east - west) / W, sy = (north - south) / H;

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const n = pointData.x.length;

        let globalMaxUncert = 0;
        const uncertGrid = new Float64Array(W * H);

        for (let py = 0; py < H; py++) {
            const wy = north - py * sy;
            for (let pxx = 0; pxx < W; pxx++) {
                const wx = west + pxx * sx;

                let minSq = Infinity;
                const dataPoints = [];

                for (let k = 0; k < n; k++) {
                    const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                    const dSq = dx * dx + dy * dy;

                    // for ZOI nearest point distance
                    if (dSq < minSq) minSq = dSq;

                    // for Variability flat-top weight
                    if (dSq >= minDistSq && dSq <= maxDistSq) {
                        const w = getVariabilityWeight(dSq, maxDistSq, maxDist);
                        dataPoints.push({ z: pointData.z[k], w: w });
                    }
                }

                // 1) Zone of influence function
                const f = 1 - Math.exp(-minSq / twoSS);

                // 2) Moving StDev
                let sd = -1;
                if (dataPoints.length >= minPts) {
                    let wSum = 0;
                    let wzSum = 0;
                    for (let p of dataPoints) {
                        wSum += p.w;
                        wzSum += p.w * p.z;
                    }
                    if (wSum > 1e-12) {
                        const wMean = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) {
                            varSum += p.w * (p.z - wMean) * (p.z - wMean);
                        }
                        sd = Math.sqrt(varSum / wSum);
                    }
                }

                // 3) Combined Uncertainty = I * V * Z-Score
                if (sd >= 0) {
                    const uncert = f * sd * zScore;
                    uncertGrid[py * W + pxx] = uncert;
                    if (uncert > globalMaxUncert) globalMaxUncert = uncert;
                } else {
                    uncertGrid[py * W + pxx] = -1;
                }
            }
        }

        // Output colors
        for (let py = 0; py < H; py++) {
            for (let pxx = 0; pxx < W; pxx++) {
                const idx = (py * W + pxx) * 4;
                const u = uncertGrid[py * W + pxx];

                if (u < 0 || globalMaxUncert === 0) {
                    // lack of data
                    px[idx] = 200; px[idx + 1] = 200; px[idx + 2] = 210; px[idx + 3] = 120;
                } else {
                    const normU = u / globalMaxUncert;
                    const [r, g, b] = uncertaintyColour(normU);
                    px[idx] = r; px[idx + 1] = g; px[idx + 2] = b; px[idx + 3] = 200;
                }
            }
        }

        ctx.putImageData(img, 0, 0);

        if (uncertOverlay) uncertMap.removeLayer(uncertOverlay);
        uncertOverlay = L.imageOverlay(canvas.toDataURL(), [[south, west], [north, east]], { opacity: 0.8, interactive: false }).addTo(uncertMap);
        if (uncertMarkers) uncertMarkers.bringToFront();

        const uncertMaxSpan = document.getElementById('uncert-legend-max');
        if (uncertMaxSpan) uncertMaxSpan.innerHTML = `&nbsp; ${globalMaxUncert.toFixed(2)}`;
    }

    // ═══════════════════════════════════════
    //  7. FINAL 3D VIEWER
    // ═══════════════════════════════════════

    // Bounding Box state for the final view
    let fBBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    function renderFinal3DView() {
        const container = document.getElementById('final-3d-plot');
        if (!pointData) return;

        // Cleanup empty state if present
        container.querySelector('.empty-state')?.remove();
        document.getElementById('final-3d-legend').classList.remove('hidden');

        // Init Scene
        if (!fScene) {
            fScene = new THREE.Scene();
            fScene.background = new THREE.Color(0xf1f5f9);

            const w = container.clientWidth || 600, h = container.clientHeight || 400;
            fCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);

            fRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            fRenderer.setSize(w, h);
            fRenderer.setPixelRatio(window.devicePixelRatio);
            fRenderer.localClippingEnabled = true; // Crucial for slicing
            container.innerHTML = '';
            container.appendChild(fRenderer.domElement);

            fOrbit = new THREE.OrbitControls(fCamera, fRenderer.domElement);
            fOrbit.enableDamping = true;

            const ambLight = new THREE.AmbientLight(0xffffff, 0.7);
            fScene.add(ambLight);
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
            dirLight.position.set(1000, 2000, 1000);
            fScene.add(dirLight);

            // Handle resize
            const resObj = new ResizeObserver(() => {
                if (!container.clientWidth || !fCamera) return;
                fCamera.aspect = container.clientWidth / container.clientHeight;
                fCamera.updateProjectionMatrix();
                fRenderer.setSize(container.clientWidth, container.clientHeight);
            });
            resObj.observe(container);

            function animate() {
                requestAnimationFrame(animate);
                fOrbit.update();
                fRenderer.render(fScene, fCamera);
            }
            animate();
        }

        // Add Listeners to Legend
        document.getElementById('layer-f-mean').addEventListener('change', e => { if (fMeshes.mean) fMeshes.mean.visible = e.target.checked; });
        document.getElementById('layer-f-plus').addEventListener('change', e => { if (fMeshes.plus) fMeshes.plus.visible = e.target.checked; });
        document.getElementById('layer-f-minus').addEventListener('change', e => { if (fMeshes.minus) fMeshes.minus.visible = e.target.checked; });

        const pts = pointData;
        const n = pts.x.length;
        if (n === 0) return;

        let minX = pts.x[0], maxX = pts.x[0], minY = pts.y[0], maxY = pts.y[0], minZ = pts.z[0], maxZ = pts.z[0];
        for (let i = 1; i < n; i++) {
            if (pts.x[i] < minX) minX = pts.x[i]; if (pts.x[i] > maxX) maxX = pts.x[i];
            if (pts.y[i] < minY) minY = pts.y[i]; if (pts.y[i] > maxY) maxY = pts.y[i];
            if (pts.z[i] < minZ) minZ = pts.z[i]; if (pts.z[i] > maxZ) maxZ = pts.z[i];
        }

        const ve = parseFloat(veFinalSlider.value);
        fBBox = { minX, maxX, minY, maxY, minZ, maxZ, ve };

        const cx = (minX + maxX) / 2;
        const cy = (minY + maxY) / 2;
        const cz = (minZ + maxZ) / 2;

        // In Three.js: X=DataX, Y=Elevation*VE, Z=-DataY
        fOrbit.target.set(cx, (cz - minZ) * ve, -cy);
        fCamera.position.set(cx, (cz - minZ) * ve + (maxZ - minZ) * ve + 100, -cy + (maxY - minY) * 1.5);

        // Generate Grid
        const gridSize = 80;
        const sx = (maxX - minX) / (gridSize - 1);
        const sy = (maxY - minY) / (gridSize - 1);

        const zMean = [], zPlus = [], zMinus = [];
        const sigma = parseFloat(sigmaSlider.value);
        const twoSS = 2 * sigma * sigma;
        const zScore = parseFloat(confidenceSelect.value); // 1, 2, or 3
        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value);
        const maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist;
        const maxDistSq = maxDist * maxDist;

        for (let j = 0; j < gridSize; j++) {
            let rowMean = []; let rowPlus = []; let rowMinus = [];
            const wy = minY + j * sy;
            for (let i = 0; i < gridSize; i++) {
                const wx = minX + i * sx;

                let minSq = Infinity;
                const dataPoints = [];
                for (let k = 0; k < n; k++) {
                    const dx = wx - pts.x[k], dy = wy - pts.y[k];
                    const dSq = dx * dx + dy * dy;

                    if (dSq < minSq) minSq = dSq;
                    if (dSq >= minDistSq && dSq <= maxDistSq) {
                        const w = getVariabilityWeight(dSq, maxDistSq, maxDist);
                        dataPoints.push({ z: pts.z[k], w: w });
                    }
                }

                const f = 1 - Math.exp(-minSq / twoSS);
                let wMean = NaN, sd = -1;

                if (dataPoints.length >= minPts) {
                    let wSum = 0;
                    let wzSum = 0;
                    for (let p of dataPoints) {
                        wSum += p.w;
                        wzSum += p.w * p.z;
                    }
                    if (wSum > 1e-12) {
                        wMean = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) {
                            varSum += p.w * (p.z - wMean) * (p.z - wMean);
                        }
                        sd = Math.sqrt(varSum / wSum);
                    }
                }

                if (!isNaN(wMean) && sd >= 0) {
                    rowMean.push(wMean);
                    const uncert = f * sd * zScore;
                    rowPlus.push(wMean + uncert);
                    rowMinus.push(wMean - uncert);
                } else {
                    rowMean.push(NaN); rowPlus.push(NaN); rowMinus.push(NaN);
                }
            }
            zMean.push(rowMean); zPlus.push(rowPlus); zMinus.push(rowMinus);
        }

        // Clipping Planes
        fClipPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
        ];

        // Replace meshes
        ['mean', 'plus', 'minus'].forEach((k) => {
            if (fMeshes[k]) { fScene.remove(fMeshes[k]); fMeshes[k].geometry.dispose(); fMeshes[k].material.dispose(); }
        });

        const matMean = new THREE.MeshLambertMaterial({ color: 0xa855f7, transparent: true, opacity: 0.9, side: THREE.DoubleSide, clippingPlanes: fClipPlanes });
        const matPlus = new THREE.MeshLambertMaterial({ color: 0xef4444, transparent: true, opacity: 0.7, side: THREE.DoubleSide, clippingPlanes: fClipPlanes });
        const matMinus = new THREE.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.7, side: THREE.DoubleSide, clippingPlanes: fClipPlanes });

        fMeshes.mean = buildSurfaceMesh(gridSize, minX, sx, minY, sy, zMean, matMean);
        fMeshes.plus = buildSurfaceMesh(gridSize, minX, sx, minY, sy, zPlus, matPlus);
        fMeshes.minus = buildSurfaceMesh(gridSize, minX, sx, minY, sy, zMinus, matMinus);

        ['mean', 'plus', 'minus'].forEach((k) => {
            if (fMeshes[k]) {
                fScene.add(fMeshes[k]);
                fMeshes[k].visible = document.getElementById(`layer-f-${k}`).checked;
            }
        });

        updateClippingPlanes();
    }

    function updateClippingPlanes() {
        if (!fClipPlanes || fClipPlanes.length < 2 || !fBBox) return;

        const mode = sliceModeSelect.value;
        const angleDeg = parseFloat(sliceAngleSlider.value);
        const posPct = parseFloat(slicePosSlider.value) / 100;
        const thickPct = parseFloat(sliceThickSlider.value) / 100;

        const rad = (angleDeg - 90) * Math.PI / 180;
        const nx = Math.cos(rad);
        const nz = Math.sin(rad);

        const cx = (fBBox.minX + fBBox.maxX) / 2;
        const czMap = (fBBox.minY + fBBox.maxY) / 2; // Data Y is Three Z

        // Max possible distance from center to a corner in projection on normal
        const halfW = (fBBox.maxX - fBBox.minX) / 2;
        const halfH = (fBBox.maxY - fBBox.minY) / 2;
        const maxD = Math.abs(halfW * nx) + Math.abs(halfH * nz);

        // Center dot N
        // In Three space, mapped coordinates are (X, Z) -> (DataX, -DataY)
        // Wait, mapping is: Three.X = Data.X, Three.Z = -Data.Y
        // So the horizontal normal in Three space is (nx, nz)
        // Point in Three space: P = (X, Y, Z)
        // We slice in the XZ plane.

        const centerOffset = cx * nx + (-czMap) * nz;
        const currentPos = centerOffset + (posPct * 2 - 1) * maxD;

        if (mode === 'front') {
            fClipPlanes[0].set(new THREE.Vector3(nx, 0, nz), -currentPos);
            fClipPlanes[1].set(new THREE.Vector3(nx, 0, nz), 1e10); // Discard nothing
        } else if (mode === 'back') {
            fClipPlanes[0].set(new THREE.Vector3(-nx, 0, -nz), currentPos);
            fClipPlanes[1].set(new THREE.Vector3(nx, 0, nz), 1e10);
        } else if (mode === 'slice') {
            const halfThick = thickPct * maxD;
            fClipPlanes[0].set(new THREE.Vector3(nx, 0, nz), -(currentPos - halfThick));
            fClipPlanes[1].set(new THREE.Vector3(-nx, 0, -nz), (currentPos + halfThick));
        }
    }

    // Helper common function to generate Plane geometry from Z array
    function buildSurfaceMesh(gridSize, minX, sx, minY, sy, zArr, material) {
        const geo = new THREE.PlaneGeometry(0, 0, gridSize - 1, gridSize - 1);
        const pos = geo.attributes.position;
        let validPoints = 0;

        const ve = fBBox ? fBBox.ve : 1;
        const minZ = fBBox ? fBBox.minZ : 0;

        for (let j = 0; j < gridSize; j++) {
            for (let i = 0; i < gridSize; i++) {
                const idx = j * gridSize + i;
                const wx = minX + i * sx;
                const wy = minY + j * sy;
                const wz = zArr[j][i];
                if (!isNaN(wz)) {
                    // Mapping: Three.X = Data.X, Three.Y = (Elev - minZ) * VE, Three.Z = -Data.Y
                    pos.setXYZ(idx, wx, (wz - minZ) * ve, -wy);
                    validPoints++;
                } else {
                    pos.setXYZ(idx, wx, 0, -wy);
                }
            }
        }
        geo.computeVertexNormals();

        if (validPoints < 10) return null;

        const mesh = new THREE.Mesh(geo, material);
        return mesh;
    }

});
