document.addEventListener('DOMContentLoaded', () => {

    // ═══════════════════════════════════════
    //  SAMPLE DATA — Branching Paleochannel
    // ═══════════════════════════════════════

    const SAMPLE_DATA = `Easting,Northing,Elevation
12.3,8.4,98.12
48.7,11.2,97.64
92.1,9.8,98.31
21.4,24.5,94.20
68.9,26.1,93.85
11.2,34.7,88.42
38.8,36.2,87.91
82.3,33.9,88.75
14.5,44.1,78.23
56.7,46.3,77.41
86.2,45.5,77.92
19.1,49.8,75.31
49.5,50.2,74.88
74.2,49.1,75.14
93.8,51.0,75.45
6.4,54.8,75.62
31.2,55.9,75.29
61.8,54.2,76.10
88.4,56.1,75.55
9.7,64.5,82.41
44.3,66.2,81.98
76.1,65.8,82.12
24.8,74.5,84.55
66.2,76.1,84.15
81.5,74.9,84.81
11.4,85.2,82.74
42.1,84.8,83.15
88.9,86.5,82.68
18.5,94.2,81.42
72.3,96.8,80.75`;

    // ═══════════════════════════════════════
    //  DOM REFERENCES
    // ═══════════════════════════════════════

    const dropArea = document.getElementById('drop-area');
    const fileInput = document.getElementById('csv-upload');
    const processBtn = document.getElementById('process-btn');
    const loadSampleBtn = document.getElementById('load-sample-btn');
    const dataSummaryBtn = document.getElementById('data-summary-btn');
    const dataSummaryModal = document.getElementById('data-summary-modal');
    const closeSummaryBtn = document.getElementById('close-summary-btn');
    const normalizeCheck = document.getElementById('normalize-check');
    const trendInfo = document.getElementById('trend-info');
    const trendEquation = document.getElementById('trend-equation');

    const loader = processBtn.querySelector('.loader');
    const btnText = processBtn.querySelector('.btn-text');

    // Sliders + number inputs
    const sigmaSlider = document.getElementById('sigma-slider');
    const sigmaNumber = document.getElementById('sigma-number');
    const minPtsSlider = document.getElementById('min-pts-slider');
    const minPtsNumber = document.getElementById('min-pts-number');
    const minDistSlider = document.getElementById('min-dist-slider');
    const minDistNumber = document.getElementById('min-dist-number');
    const maxDistSlider = document.getElementById('max-dist-slider');
    const maxDistNumber = document.getElementById('max-dist-number');
    const veFinalSlider = document.getElementById('f-ve-slider');
    const veFinalNumber = document.getElementById('f-ve-number');
    const sliceModeSelect = document.getElementById('slice-mode');
    const sliceAngleSlider = document.getElementById('slice-angle');
    const sliceAngleNumber = document.getElementById('slice-angle-number');
    const slicePosSlider = document.getElementById('slice-pos');
    const slicePosNumber = document.getElementById('slice-pos-number');
    const sliceThickSlider = document.getElementById('slice-thick');
    const sliceThickNumber = document.getElementById('slice-thick-number');
    const sliceThickGroup = document.getElementById('slice-thick-group');

    const stat = {
        pts: document.getElementById('stat-points'),
        pairs: document.getElementById('stat-pairs'),
        maxdist: document.getElementById('stat-maxdist'),
        maxdz: document.getElementById('stat-maxdz'),
    };

    // ─── State ───────────────────────────────
    let pointData = null;
    let rawZ = null;
    let globalMaxDist = 1;
    let variogramReady = false;
    let globalTrend = null;

    // Input 3D scene
    let threeScene, threeCamera, threeRenderer, labelRenderer, orbit;
    let threeMeshes = {};

    // Final 3D scene
    let fScene, fCamera, fRenderer, fOrbit;
    let fMeshes = {};
    let fClipPlanes = [];
    let fBBox = { minX: 0, maxX: 0, minY: 0, maxY: 0 };

    // Leaflet maps
    let inputPlanMap = null;
    let zoiMap = null;
    let varMap = null;
    let zoiOverlay = null;
    let zoiMarkers = null;
    let varOverlay = null;
    let varMarkers = null;
    let uncertMap = null;
    let uncertOverlay1 = null;
    let uncertOverlay2 = null;
    let uncertOverlay3 = null;
    let uncertMarkers = null;

    // Export state
    let storedSurfaces = null;
    let currentDataSource = 'Unknown';

    // RBF state
    let rbfWeights = null;
    let rbfAverageSpacing = 1;

    // ═══════════════════════════════════════
    //  HELPERS
    // ═══════════════════════════════════════

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, isNaN(v) ? lo : v)); }

    function getVariabilityWeight(dSq, maxDistSq, maxDist) {
        if (maxDistSq === 0 || maxDist === 0) return 1;
        const d = Math.sqrt(dSq);
        const taperStart = 0.8 * maxDist;
        if (d <= taperStart) return 1;
        if (d >= maxDist) return 0;
        const phase = ((d - taperStart) / (maxDist - taperStart)) * Math.PI;
        return 0.5 * (1 + Math.cos(phase));
    }

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

    function uncertaintyColour(f) {
        const r = Math.round(255 * Math.min(1, f * 2));
        const g = Math.round(255 * Math.min(1, 2 * (1 - f)));
        return [r, g, 0];
    }

    function stdevColour(t) {
        let r, g, b;
        if (t < 0.25) { const s = t / 0.25; r = 0; g = Math.round(255 * s); b = 255; }
        else if (t < 0.5) { const s = (t - 0.25) / 0.25; r = 0; g = 255; b = Math.round(255 * (1 - s)); }
        else if (t < 0.75) { const s = (t - 0.5) / 0.25; r = Math.round(255 * s); g = 255; b = 0; }
        else { const s = (t - 0.75) / 0.25; r = 255; g = Math.round(255 * (1 - s)); b = 0; }
        return [r, g, b];
    }

    function invalidateLeaflets() {
        [inputPlanMap, zoiMap, varMap, uncertMap].forEach(m => {
            if (m) {
                m.invalidateSize();
                if (pointData) m.fitBounds(leafletBounds(bbox()));
            }
        });
    }

    // ═══════════════════════════════════════
    //  TAB SYSTEM
    // ═══════════════════════════════════════

    document.querySelectorAll('.sidebar-step .step-title').forEach(title => {
        title.addEventListener('click', () => {
            const step = title.closest('.sidebar-step');
            if (step.classList.contains('active')) return;

            document.querySelectorAll('.sidebar-step').forEach(s => s.classList.remove('active'));
            document.querySelectorAll('.primary-view').forEach(v => v.classList.remove('active'));

            step.classList.add('active');
            const targetId = step.dataset.target;
            if (targetId) document.getElementById(targetId).classList.add('active');

            window.dispatchEvent(new Event('resize'));
            setTimeout(() => {
                invalidateLeaflets();
                // Force Three.js renderers to fill their containers after tab switch
                setTimeout(() => {
                    if (threeRenderer && document.getElementById('tab-input').classList.contains('active')) {
                        const c = document.getElementById('input-3d-plot');
                        if (c.clientWidth) {
                            threeCamera.aspect = c.clientWidth / c.clientHeight;
                            threeCamera.updateProjectionMatrix();
                            threeRenderer.setSize(c.clientWidth, c.clientHeight);
                            if (labelRenderer) labelRenderer.setSize(c.clientWidth, c.clientHeight);
                        }
                    }
                    if (fRenderer && document.getElementById('tab-combined').classList.contains('active')) {
                        const c = document.getElementById('final-3d-plot');
                        if (c.clientWidth) {
                            fCamera.aspect = c.clientWidth / c.clientHeight;
                            fCamera.updateProjectionMatrix();
                            fRenderer.setSize(c.clientWidth, c.clientHeight);
                        }
                    }
                    if (document.getElementById('tab-export').classList.contains('active')) {
                        refreshYAML();
                    }
                }, 50);
            }, 120);
        });
    });

    document.querySelectorAll('.sub-tabs').forEach(container => {
        container.querySelectorAll('.sub-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                container.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
                const parentView = container.closest('.primary-view');
                parentView.querySelectorAll('.sub-view').forEach(v => v.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
                window.dispatchEvent(new Event('resize'));
                setTimeout(() => {
                    invalidateLeaflets();
                    if (btn.dataset.target === 'input-3d' && threeRenderer) {
                        const c = document.getElementById('input-3d-plot');
                        if (c.clientWidth) {
                            threeCamera.aspect = c.clientWidth / c.clientHeight;
                            threeCamera.updateProjectionMatrix();
                            threeRenderer.setSize(c.clientWidth, c.clientHeight);
                            if (labelRenderer) labelRenderer.setSize(c.clientWidth, c.clientHeight);
                        }
                    }
                }, 120);
            });
        });
    });

    // ═══════════════════════════════════════
    //  SLIDER ↔ NUMBER INPUT SYNC
    // ═══════════════════════════════════════

    function linkSliderNumber(slider, number, onUpdate) {
        slider.addEventListener('input', () => {
            number.value = slider.value;
            onUpdate();
        });
        number.addEventListener('input', () => {
            const v = clamp(parseFloat(number.value), parseFloat(slider.min) || 0, parseFloat(slider.max) || 1e9);
            slider.value = v;
            number.value = v;
            onUpdate();
        });
    }

    linkSliderNumber(sigmaSlider, sigmaNumber, () => {
        if (variogramReady) updateGaussianCurve();
        if (zoiMap && pointData) renderZoiOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });

    linkSliderNumber(minPtsSlider, minPtsNumber, () => {
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });

    linkSliderNumber(minDistSlider, minDistNumber, () => {
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });

    linkSliderNumber(maxDistSlider, maxDistNumber, () => {
        if (varMap && pointData) renderVariabilityOverlay();
        if (uncertMap && pointData) renderUncertOverlay();
    });

    linkSliderNumber(veFinalSlider, veFinalNumber, () => {
        if (fScene && pointData) renderFinal3DView();
    });

    linkSliderNumber(sliceAngleSlider, sliceAngleNumber, updateClippingPlanes);
    linkSliderNumber(slicePosSlider, slicePosNumber, updateClippingPlanes);
    linkSliderNumber(sliceThickSlider, sliceThickNumber, updateClippingPlanes);

    sliceModeSelect.addEventListener('change', () => {
        sliceThickGroup.style.display = (sliceModeSelect.value === 'slice') ? 'block' : 'none';
        updateClippingPlanes();
    });

    // ═══════════════════════════════════════
    //  DATA SUMMARY MODAL
    // ═══════════════════════════════════════

    dataSummaryBtn.addEventListener('click', () => dataSummaryModal.classList.remove('hidden'));
    closeSummaryBtn.addEventListener('click', () => dataSummaryModal.classList.add('hidden'));
    dataSummaryModal.addEventListener('click', e => {
        if (e.target === dataSummaryModal) dataSummaryModal.classList.add('hidden');
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
        rawZ = null;
        clearState();
        const msg = dropArea.querySelector('.file-message');
        msg.textContent = `Parsing: ${file.name}…`;
        Papa.parse(file, {
            header: true, dynamicTyping: true, skipEmptyLines: true,
            complete(r) {
                parseRows(r.data);
                if (pointData && pointData.x.length > 2) {
                    msg.textContent = `${file.name} (${pointData.x.length} pts)`;
                    currentDataSource = file.name;
                    processBtn.disabled = false;
                    dataSummaryBtn.disabled = false;
                } else { msg.textContent = 'Could not parse X, Y, Z columns.'; }
            },
            error() { msg.textContent = 'Error reading file.'; }
        });
    }

    loadSampleBtn.addEventListener('click', () => {
        rawZ = null;
        clearState();
        const result = Papa.parse(SAMPLE_DATA, { header: true, dynamicTyping: true, skipEmptyLines: true });
        parseRows(result.data);
        if (pointData && pointData.x.length > 2) {
            dropArea.querySelector('.file-message').textContent = `Sample: Branching Paleochannel (${pointData.x.length} pts)`;
            currentDataSource = 'Sample: Branching Paleochannel';
            processBtn.disabled = false;
            dataSummaryBtn.disabled = false;
        }
    });

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
    //  ERROR HANDLING
    // ═══════════════════════════════════════

    function clearError() { document.querySelector('.error-banner')?.remove(); }
    function showError(msg) {
        clearError();
        const div = document.createElement('div');
        div.className = 'error-banner';
        div.textContent = '⚠ ' + msg;
        processBtn.parentElement.insertBefore(div, processBtn.nextSibling);
    }

    // ═══════════════════════════════════════
    //  PROCESS BUTTON
    // ═══════════════════════════════════════

    function clearState() {
        storedSurfaces = null;
        rbfWeights = null;
        ['exp-zoi','exp-stdev','exp-u1','exp-u2','exp-u3','exp-dxf'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = true; el.checked = false; }
        });
        const dlBtn = document.getElementById('export-download-btn');
        if (dlBtn) dlBtn.disabled = true;
        const yamlBtn = document.getElementById('export-yaml-btn');
        if (yamlBtn) yamlBtn.disabled = true;
        const pre = document.getElementById('yaml-preview');
        if (pre) pre.textContent = 'Run "Process All" to populate config.';
        document.getElementById('export-status').textContent = '';
    }

    processBtn.addEventListener('click', () => {
        if (!pointData) return;
        clearError();
        clearState();
        btnText.classList.add('hidden');
        loader.classList.remove('hidden');
        processBtn.disabled = true;
        setTimeout(() => {
            try {
                applyNormalisation();
                computeVariogram();
                computeRBF();
                renderInputPlan();
                render3DView();
                initZoiMap();
                initVariabilityMap();
                initUncertMap();
                renderFinal3DView();
                enableExportControls();
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
        if (rawZ) { pointData.z = rawZ.slice(); } else { rawZ = pointData.z.slice(); }

        if (!normalizeCheck.checked) {
            trendInfo.classList.add('hidden');
            globalTrend = null;
            return;
        }

        const n = pointData.x.length;
        let sx = 0, sy = 0, sz = 0, sxx = 0, syy = 0, sxy = 0, sxz = 0, syz = 0;
        for (let i = 0; i < n; i++) {
            const x = pointData.x[i], y = pointData.y[i], z = pointData.z[i];
            sx += x; sy += y; sz += z;
            sxx += x * x; syy += y * y; sxy += x * y;
            sxz += x * z; syz += y * z;
        }

        const detA = sxx * (syy * n - sy * sy) - sxy * (sxy * n - sy * sx) + sx * (sxy * sy - syy * sx);
        if (Math.abs(detA) < 1e-20) {
            showError('Cannot fit trend plane — data may be collinear.');
            trendInfo.classList.add('hidden');
            return;
        }

        const a = (sxz * (syy * n - sy * sy) - sxy * (syz * n - sy * sz) + sx * (syz * sy - syy * sz)) / detA;
        const b = (sxx * (syz * n - sy * sz) - sxz * (sxy * n - sy * sx) + sx * (sxy * sz - syz * sx)) / detA;
        const c = (sxx * (syy * sz - syz * sy) - sxy * (sxy * sz - syz * sx) + sxz * (sxy * sy - syy * sx)) / detA;

        const residuals = [];
        for (let i = 0; i < n; i++) residuals.push(pointData.z[i] - (a * pointData.x[i] + b * pointData.y[i] + c));
        pointData.z = residuals;

        const sign = v => v >= 0 ? '+' : '';
        trendEquation.textContent = `Z = ${a.toFixed(6)}·X ${sign(b)}${b.toFixed(6)}·Y ${sign(c)}${c.toFixed(2)}`;
        trendInfo.classList.remove('hidden');
        globalTrend = { a, b, c };
    }

    // ═══════════════════════════════════════
    //  RBF INTERPOLATION
    // ═══════════════════════════════════════

    function rbfPhi(r) { return Math.sqrt(r * r + rbfAverageSpacing * rbfAverageSpacing); }

    function solveLinearSystem(A, b) {
        const n = b.length;
        const M = [];
        for (let i = 0; i < n; i++) M.push([...A[i], b[i]]);
        for (let i = 0; i < n; i++) {
            let maxEl = Math.abs(M[i][i]), maxRow = i;
            for (let k = i + 1; k < n; k++) { if (Math.abs(M[k][i]) > maxEl) { maxEl = Math.abs(M[k][i]); maxRow = k; } }
            if (maxEl < 1e-12) return null;
            for (let k = i; k < n + 1; k++) { const tmp = M[maxRow][k]; M[maxRow][k] = M[i][k]; M[i][k] = tmp; }
            for (let k = i + 1; k < n; k++) {
                const c = -M[k][i] / M[i][i];
                for (let j = i; j < n + 1; j++) { if (i === j) M[k][j] = 0; else M[k][j] += c * M[i][j]; }
            }
        }
        const x = new Array(n).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            x[i] = M[i][n] / M[i][i];
            for (let k = i - 1; k >= 0; k--) M[k][n] -= M[k][i] * x[i];
        }
        return x;
    }

    function computeRBF() {
        const n = pointData.x.length;
        if (n === 0) return;
        let sumDist = 0, count = 0;
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                const dx = pointData.x[i] - pointData.x[j], dy = pointData.y[i] - pointData.y[j];
                sumDist += Math.sqrt(dx * dx + dy * dy); count++;
            }
        }
        rbfAverageSpacing = count > 0 ? (sumDist / count) : 10;
        if (rbfAverageSpacing < 1e-6) rbfAverageSpacing = 1;

        const A = [], b = [];
        for (let i = 0; i < n; i++) {
            A.push(new Array(n).fill(0));
            b.push(pointData.z[i]);
            for (let j = 0; j < n; j++) {
                const dx = pointData.x[i] - pointData.x[j], dy = pointData.y[i] - pointData.y[j];
                A[i][j] = rbfPhi(Math.sqrt(dx * dx + dy * dy));
            }
        }
        rbfWeights = solveLinearSystem(A, b);
        if (!rbfWeights) console.warn('RBF system was singular');
    }

    function evaluateRBF(x, y) {
        if (!rbfWeights) return 0;
        let z = 0;
        for (let i = 0; i < pointData.x.length; i++) {
            const dx = x - pointData.x[i], dy = y - pointData.y[i];
            z += rbfWeights[i] * rbfPhi(Math.sqrt(dx * dx + dy * dy));
        }
        return z;
    }

    // ═══════════════════════════════════════
    //  1. INPUT DATA — PLAN VIEW
    // ═══════════════════════════════════════

    function renderInputPlan() {
        document.querySelector('#input-plan .empty-state')?.remove();
        inputPlanMap = makeLeaflet('input-plan-map', inputPlanMap);

        for (let i = 0; i < pointData.x.length; i++) {
            const zVal = rawZ ? rawZ[i] : pointData.z[i];
            const diamondIcon = L.divIcon({ className: 'leaflet-marker-diamond', iconSize: [10, 10] });
            L.marker([pointData.y[i], pointData.x[i]], { icon: diamondIcon }).addTo(inputPlanMap);
            L.tooltip({ permanent: true, direction: 'right', offset: [8, 0], className: 'elevation-label' })
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

            const w = container.clientWidth || 600, h = container.clientHeight || 400;
            threeCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000);
            threeCamera.position.set(0, 1.5, 2);

            threeRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            threeRenderer.setSize(w, h);
            container.innerHTML = '';
            container.appendChild(threeRenderer.domElement);

            labelRenderer = new THREE.CSS2DRenderer();
            labelRenderer.setSize(w, h);
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
                    const id = e.target.id;
                    if (threeMeshes[id]) threeMeshes[id].visible = e.target.checked;
                    if (id === 'layer-raw-pts') {
                        const lbl = document.getElementById('layer-raw-labels');
                        if (lbl) { lbl.checked = e.target.checked; if (threeMeshes['layer-raw-labels']) threeMeshes['layer-raw-labels'].visible = e.target.checked; }
                    }
                    if (id === 'layer-norm-pts') {
                        const lbl = document.getElementById('layer-norm-labels');
                        if (lbl) { lbl.checked = e.target.checked; if (threeMeshes['layer-norm-labels']) threeMeshes['layer-norm-labels'].visible = e.target.checked; }
                    }
                });
            });
        } else {
            ['layer-raw-pts', 'layer-raw-labels', 'layer-norm-plane', 'layer-norm-pts', 'layer-norm-labels', 'layer-interpolated'].forEach(id => {
                if (threeMeshes[id]) threeScene.remove(threeMeshes[id]);
            });
        }

        const b = bbox(0.05);
        const cx = (b.rawMinX + b.rawMaxX) / 2, cy = (b.rawMinY + b.rawMaxY) / 2;
        const scaleXYZ = 1.0 / Math.max(b.rawMaxX - b.rawMinX, b.rawMaxY - b.rawMinY);
        const n = pointData.x.length;
        const isNormalized = normalizeCheck.checked;

        ['layer-raw-pts', 'layer-raw-labels', 'layer-norm-plane', 'layer-norm-pts', 'layer-norm-labels', 'layer-interpolated'].forEach(id => {
            threeMeshes[id] = new THREE.Group();
            threeScene.add(threeMeshes[id]);
        });

        const sphereGeo = new THREE.SphereGeometry(0.0075, 16, 16);
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
                const pzNorm = pointData.z[i] * scaleXYZ * 2;
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
            threeMeshes['layer-norm-plane'].add(new THREE.Mesh(cGeo, pMat));
        }

        // Coverage threshold: 2× average nearest-neighbour distance
        let nnSum = 0;
        for (let i = 0; i < n; i++) {
            let minD = Infinity;
            for (let j = 0; j < n; j++) {
                if (i === j) continue;
                const dx = pointData.x[i]-pointData.x[j], dy = pointData.y[i]-pointData.y[j];
                const d = Math.sqrt(dx*dx+dy*dy);
                if (d < minD) minD = d;
            }
            nnSum += (minD === Infinity ? 0 : minD);
        }
        const nnAvg = n > 1 ? nnSum/n : (b.rawMaxX-b.rawMinX)/5;
        const coverageDist = nnAvg * 2.0;

        const res = 50;
        const surfVerts = new Float32Array(res * res * 3);
        const surfValid = new Uint8Array(res * res);
        for (let row = 0; row < res; row++) {
            for (let col = 0; col < res; col++) {
                const worldX = b.rawMinX + (b.rawMaxX-b.rawMinX)*col/(res-1);
                const worldY = b.rawMinY + (b.rawMaxY-b.rawMinY)*row/(res-1);
                let minD = Infinity;
                for (let k = 0; k < n; k++) {
                    const dx = worldX-pointData.x[k], dy = worldY-pointData.y[k];
                    const d = Math.sqrt(dx*dx+dy*dy);
                    if (d < minD) minD = d;
                }
                const vi = (row*res+col)*3;
                surfVerts[vi]   = (worldX-cx)*scaleXYZ;
                surfVerts[vi+2] = -(worldY-cy)*scaleXYZ;
                if (minD <= coverageDist) {
                    const zInterp = evaluateRBF(worldX, worldY);
                    surfVerts[vi+1] = isNormalized ? zInterp*scaleXYZ*2 : (zInterp-cz)*scaleXYZ*2;
                    surfValid[row*res+col] = 1;
                }
            }
        }
        const surfTris = [];
        for (let row = 0; row < res-1; row++) {
            for (let col = 0; col < res-1; col++) {
                const i00=row*res+col, i10=i00+1, i01=(row+1)*res+col, i11=i01+1;
                if (surfValid[i00]&&surfValid[i10]&&surfValid[i01]&&surfValid[i11])
                    surfTris.push(i00,i10,i01, i10,i11,i01);
            }
        }
        if (surfTris.length > 0) {
            const surfGeo = new THREE.BufferGeometry();
            surfGeo.setAttribute('position', new THREE.BufferAttribute(surfVerts, 3));
            surfGeo.setIndex(surfTris);
            surfGeo.computeVertexNormals();
            const surfMat = new THREE.MeshLambertMaterial({ color: 0x8b5cf6, side: THREE.DoubleSide, opacity: 0.8, transparent: true });
            threeMeshes['layer-interpolated'].add(new THREE.Mesh(surfGeo, surfMat));
        }

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
        sigmaNumber.max = Math.ceil(maxD);
        sigmaSlider.value = Math.ceil(maxD / 3);
        sigmaNumber.value = sigmaSlider.value;

        maxDistSlider.max = Math.ceil(maxD);
        maxDistNumber.max = Math.ceil(maxD);
        maxDistSlider.value = Math.min(parseInt(maxDistSlider.value), Math.ceil(maxD));
        maxDistNumber.value = maxDistSlider.value;
        minDistSlider.max = Math.ceil(maxD / 2);
        minDistNumber.max = Math.ceil(maxD / 2);

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
                bY.push(bins[i].dzs[Math.min(Math.floor(bins[i].dzs.length * 0.95), bins[i].dzs.length - 1)]);
            }
        }

        renderVariogramPlot(sDist, sDZ, bX, bY);
    }

    function renderVariogramPlot(sDist, sDZ, bX, bY) {
        document.querySelector('#zoi-variogram .empty-state')?.remove();
        const t1 = { x: sDist, y: sDZ, mode: 'markers', type: sDist.length > 50000 ? 'scattergl' : 'scatter', marker: { color: 'rgba(37,99,235,0.4)', size: 5 }, name: 'Pairwise ΔZ', yaxis: 'y' };
        const t2 = { x: bX, y: bY, mode: 'lines+markers', type: 'scatter', marker: { color: '#dc2626', size: 6 }, line: { color: '#dc2626', width: 2, dash: 'dot' }, name: '95% Upper Bound', yaxis: 'y' };
        const t3 = { x: [0], y: [0], mode: 'lines', type: 'scatter', line: { color: '#16a34a', width: 3 }, name: 'f(d)', yaxis: 'y2' };
        const layout = {
            paper_bgcolor: 'rgba(0,0,0,0)', plot_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#1a1a2e', family: 'Inter' }, margin: { t: 35, l: 55, r: 55, b: 45 },
            title: { text: 'Pairwise ΔZ vs. Distance  |  Uncertainty Function', font: { size: 13 } },
            xaxis: { title: 'Distance (m)', gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db' },
            yaxis: { title: '|ΔZ| (m)', gridcolor: '#e5e7eb', zerolinecolor: '#d1d5db', rangemode: 'tozero', side: 'left' },
            yaxis2: { title: 'f(d)', overlaying: 'y', side: 'right', range: [0, 1.05], gridcolor: 'rgba(22,163,74,0.1)', zerolinecolor: '#d1d5db', tickfont: { color: '#16a34a' }, titlefont: { color: '#16a34a' } },
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
            L.circleMarker([pointData.y[i], pointData.x[i]], { radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1 }).addTo(zoiMarkers);
        }

        renderZoiOverlay();
        zoiMap.on('moveend', renderZoiOverlay);

        if (!zoiMap.legendControl) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.cssText = 'background:rgba(255,255,255,0.9);padding:8px;border-radius:6px;font-size:12px;';
                div.innerHTML = `<b>Uncertainty f(d)</b><br><i style="background:linear-gradient(to right,rgb(0,255,0),rgb(255,255,0),rgb(255,0,0));width:100px;height:12px;display:inline-block;margin-top:4px;"></i><br><span style="float:left;font-weight:600;">0 </span><span style="float:right;font-weight:600;"> 1</span>`;
                return div;
            };
            legend.addTo(zoiMap);
            zoiMap.legendControl = legend;
        }
    }

    function renderZoiOverlay() {
        if (!zoiMap || !pointData) return;
        const sigma = parseFloat(sigmaSlider.value), twoSS = 2 * sigma * sigma;
        const bounds = zoiMap.getBounds(), size = zoiMap.getSize();
        const W = Math.max(10, Math.min(size.x || 300, 300)), H = Math.max(10, Math.min(size.y || 300, 300));
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
            L.circleMarker([pointData.y[i], pointData.x[i]], { radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1 }).addTo(varMarkers);
        }

        renderVariabilityOverlay();
        varMap.on('moveend', renderVariabilityOverlay);

        if (!varMap.legendControl) {
            const legend = L.control({ position: 'bottomright' });
            legend.onAdd = function () {
                const div = L.DomUtil.create('div', 'info legend');
                div.style.cssText = 'background:rgba(255,255,255,0.9);padding:8px;border-radius:6px;font-size:12px;';
                div.innerHTML = `<b>Variability (StDev)</b><br><i style="background:linear-gradient(to right,rgb(0,0,255),rgb(0,255,255),rgb(255,255,0),rgb(255,0,0));width:100px;height:12px;display:inline-block;margin-top:4px;"></i><br><span style="float:left;font-weight:600;">0 </span><span style="float:right;font-weight:600;" id="var-legend-max">...</span>`;
                return div;
            };
            legend.addTo(varMap);
            varMap.legendControl = legend;
        }
    }

    function renderVariabilityOverlay() {
        if (!varMap || !pointData) return;
        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value), maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist, maxDistSq = maxDist * maxDist;

        const bounds = varMap.getBounds(), size = varMap.getSize();
        const W = Math.max(10, Math.min(size.x || 250, 250)), H = Math.max(10, Math.min(size.y || 250, 250));
        const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
        const sx = (east - west) / W, sy = (north - south) / H;

        const canvas = document.createElement('canvas'); canvas.width = W; canvas.height = H;
        const ctx = canvas.getContext('2d');
        const img = ctx.createImageData(W, H);
        const px = img.data;
        const n = pointData.x.length;
        let globalMaxStd = 0;
        const stdevGrid = new Float64Array(W * H);

        for (let py = 0; py < H; py++) {
            const wy = north - py * sy;
            for (let pxx = 0; pxx < W; pxx++) {
                const wx = west + pxx * sx;
                const dataPoints = [];
                for (let k = 0; k < n; k++) {
                    const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                    const dSq = dx * dx + dy * dy;
                    if (dSq >= minDistSq && dSq <= maxDistSq) dataPoints.push({ z: pointData.z[k], w: getVariabilityWeight(dSq, maxDistSq, maxDist) });
                }
                let sd = -1;
                if (dataPoints.length >= minPts) {
                    let wSum = 0, wzSum = 0;
                    for (let p of dataPoints) { wSum += p.w; wzSum += p.w * p.z; }
                    if (wSum > 1e-12) {
                        const wMean = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) varSum += p.w * (p.z - wMean) ** 2;
                        sd = Math.sqrt(varSum / wSum);
                        if (sd > globalMaxStd) globalMaxStd = sd;
                    }
                }
                stdevGrid[py * W + pxx] = sd;
            }
        }

        for (let py = 0; py < H; py++) {
            for (let pxx = 0; pxx < W; pxx++) {
                const idx = (py * W + pxx) * 4;
                const sd = stdevGrid[py * W + pxx];
                if (sd < 0) { px[idx] = 200; px[idx + 1] = 200; px[idx + 2] = 210; px[idx + 3] = 120; }
                else { const t = globalMaxStd > 0 ? sd / globalMaxStd : 0; const [r, g, b] = stdevColour(t); px[idx] = r; px[idx + 1] = g; px[idx + 2] = b; px[idx + 3] = 200; }
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
    //  6. UNCERTAINTY — MULTI-SIGMA MAP
    // ═══════════════════════════════════════

    function initUncertMap() {
        document.querySelector('#uncertainty-map-container .empty-state')?.remove();
        uncertMap = makeLeaflet('uncertainty-map-container', uncertMap);
        document.getElementById('uncert-2d-legend').classList.remove('hidden');

        uncertMarkers = L.featureGroup().addTo(uncertMap);
        for (let i = 0; i < pointData.x.length; i++) {
            L.circleMarker([pointData.y[i], pointData.x[i]], { radius: 4, color: '#1a1a2e', weight: 1.5, fillColor: '#2563eb', fillOpacity: 1 }).addTo(uncertMarkers);
        }

        renderUncertOverlay();
        uncertMap.on('moveend', renderUncertOverlay);

        // Sigma layer toggle listeners (set up once)
        if (!uncertMap._sigmaListeners) {
            document.getElementById('layer-u-1s')?.addEventListener('change', e => {
                if (uncertOverlay1) uncertOverlay1.setOpacity(e.target.checked ? 0.8 : 0);
            });
            document.getElementById('layer-u-2s')?.addEventListener('change', e => {
                if (uncertOverlay2) uncertOverlay2.setOpacity(e.target.checked ? 0.8 : 0);
            });
            document.getElementById('layer-u-3s')?.addEventListener('change', e => {
                if (uncertOverlay3) uncertOverlay3.setOpacity(e.target.checked ? 0.8 : 0);
            });
            uncertMap._sigmaListeners = true;
        }
    }

    function renderUncertOverlay() {
        if (!uncertMap || !pointData) return;

        const sigma = parseFloat(sigmaSlider.value), twoSS = 2 * sigma * sigma;
        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value), maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist, maxDistSq = maxDist * maxDist;

        const bounds = uncertMap.getBounds(), size = uncertMap.getSize();
        const W = Math.max(10, Math.min(size.x || 250, 250)), H = Math.max(10, Math.min(size.y || 250, 250));
        const south = bounds.getSouth(), west = bounds.getWest(), north = bounds.getNorth(), east = bounds.getEast();
        const sx = (east - west) / W, sy = (north - south) / H;
        const n = pointData.x.length;

        let globalMaxBase = 0;
        const baseGrid = new Float64Array(W * H);

        // Compute base uncertainty I*V (no z-score)
        for (let py = 0; py < H; py++) {
            const wy = north - py * sy;
            for (let pxx = 0; pxx < W; pxx++) {
                const wx = west + pxx * sx;
                let minSq = Infinity;
                const dataPoints = [];
                for (let k = 0; k < n; k++) {
                    const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                    const dSq = dx * dx + dy * dy;
                    if (dSq < minSq) minSq = dSq;
                    if (dSq >= minDistSq && dSq <= maxDistSq) dataPoints.push({ z: pointData.z[k], w: getVariabilityWeight(dSq, maxDistSq, maxDist) });
                }
                const f = 1 - Math.exp(-minSq / twoSS);
                let sd = -1;
                if (dataPoints.length >= minPts) {
                    let wSum = 0, wzSum = 0;
                    for (let p of dataPoints) { wSum += p.w; wzSum += p.w * p.z; }
                    if (wSum > 1e-12) {
                        const wMean = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) varSum += p.w * (p.z - wMean) ** 2;
                        sd = Math.sqrt(varSum / wSum);
                    }
                }
                if (sd >= 0) {
                    const base = f * sd;
                    baseGrid[py * W + pxx] = base;
                    if (base > globalMaxBase) globalMaxBase = base;
                } else {
                    baseGrid[py * W + pxx] = -1;
                }
            }
        }

        const lBounds = [[south, west], [north, east]];
        const maxRef = globalMaxBase * 3 || 1; // normalise to 3σ maximum

        function makeCanvas(sigmaFactor, colorFn) {
            const c = document.createElement('canvas'); c.width = W; c.height = H;
            const ctx = c.getContext('2d');
            const img = ctx.createImageData(W, H);
            const px = img.data;
            for (let py = 0; py < H; py++) {
                for (let pxx = 0; pxx < W; pxx++) {
                    const idx = (py * W + pxx) * 4;
                    const base = baseGrid[py * W + pxx];
                    if (base < 0) { px[idx] = 200; px[idx+1] = 200; px[idx+2] = 210; px[idx+3] = 50; }
                    else {
                        const t = Math.min(1, (base * sigmaFactor) / maxRef);
                        const [r, g, b, a] = colorFn(t);
                        px[idx] = r; px[idx+1] = g; px[idx+2] = b; px[idx+3] = a;
                    }
                }
            }
            ctx.putImageData(img, 0, 0);
            return c;
        }

        // Color functions: RGBA, normalized to 3σ max
        const col1s = t => [59, 130, 246, Math.round(15 + t * 165)];   // blue
        const col2s = t => [168, 85, 247, Math.round(15 + t * 165)];   // purple
        const col3s = t => [239, 68, 68, Math.round(15 + t * 165)];    // red

        const show1s = document.getElementById('layer-u-1s')?.checked ?? true;
        const show2s = document.getElementById('layer-u-2s')?.checked ?? true;
        const show3s = document.getElementById('layer-u-3s')?.checked ?? false;

        if (uncertOverlay1) uncertMap.removeLayer(uncertOverlay1);
        if (uncertOverlay2) uncertMap.removeLayer(uncertOverlay2);
        if (uncertOverlay3) uncertMap.removeLayer(uncertOverlay3);

        uncertOverlay1 = L.imageOverlay(makeCanvas(1, col1s).toDataURL(), lBounds, { opacity: show1s ? 0.8 : 0, interactive: false }).addTo(uncertMap);
        uncertOverlay2 = L.imageOverlay(makeCanvas(2, col2s).toDataURL(), lBounds, { opacity: show2s ? 0.8 : 0, interactive: false }).addTo(uncertMap);
        uncertOverlay3 = L.imageOverlay(makeCanvas(3, col3s).toDataURL(), lBounds, { opacity: show3s ? 0.8 : 0, interactive: false }).addTo(uncertMap);

        if (uncertMarkers) uncertMarkers.bringToFront();

        const statsEl = document.getElementById('uncert-legend-stats');
        if (statsEl) statsEl.textContent = `1σ max: ${globalMaxBase.toFixed(3)}m | 3σ max: ${(globalMaxBase * 3).toFixed(3)}m`;
    }

    // ═══════════════════════════════════════
    //  7. FINAL 3D VIEWER — MULTI-SIGMA
    // ═══════════════════════════════════════

    function renderFinal3DView() {
        const container = document.getElementById('final-3d-plot');
        if (!pointData) return;

        container.querySelector('.empty-state')?.remove();
        document.getElementById('final-3d-legend').classList.remove('hidden');

        if (!fScene) {
            fScene = new THREE.Scene();
            fScene.background = new THREE.Color(0xf1f5f9);

            const w = container.clientWidth || 600, h = container.clientHeight || 400;
            fCamera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100000);

            fRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
            fRenderer.setSize(w, h);
            fRenderer.setPixelRatio(window.devicePixelRatio);
            fRenderer.localClippingEnabled = true;
            container.innerHTML = '';
            container.appendChild(fRenderer.domElement);

            fOrbit = new THREE.OrbitControls(fCamera, fRenderer.domElement);
            fOrbit.enableDamping = true;

            fScene.add(new THREE.AmbientLight(0xffffff, 0.7));
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
            dirLight.position.set(1000, 2000, 1000);
            fScene.add(dirLight);

            const resObj = new ResizeObserver(() => {
                if (!container.clientWidth || !fCamera) return;
                fCamera.aspect = container.clientWidth / container.clientHeight;
                fCamera.updateProjectionMatrix();
                fRenderer.setSize(container.clientWidth, container.clientHeight);
            });
            resObj.observe(container);

            function animate() { requestAnimationFrame(animate); fOrbit.update(); fRenderer.render(fScene, fCamera); }
            animate();
        }

        // Legend layer listeners
        const layerMap = {
            'layer-f-pts': 'pts', 'layer-f-mean': 'mean',
            'layer-f-p1': 'p1', 'layer-f-m1': 'm1',
            'layer-f-p2': 'p2', 'layer-f-m2': 'm2',
            'layer-f-p3': 'p3', 'layer-f-m3': 'm3'
        };
        if (!fScene._listenersAdded) {
            Object.entries(layerMap).forEach(([cbId, meshKey]) => {
                document.getElementById(cbId)?.addEventListener('change', e => {
                    if (fMeshes[meshKey]) fMeshes[meshKey].visible = e.target.checked;
                });
            });
            fScene._listenersAdded = true;
        }

        const pts = pointData, n = pts.x.length;
        if (n === 0) return;

        let minX = pts.x[0], maxX = pts.x[0], minY = pts.y[0], maxY = pts.y[0], minZ = pts.z[0], maxZ = pts.z[0];
        for (let i = 1; i < n; i++) {
            if (pts.x[i] < minX) minX = pts.x[i]; if (pts.x[i] > maxX) maxX = pts.x[i];
            if (pts.y[i] < minY) minY = pts.y[i]; if (pts.y[i] > maxY) maxY = pts.y[i];
            if (pts.z[i] < minZ) minZ = pts.z[i]; if (pts.z[i] > maxZ) maxZ = pts.z[i];
        }

        const ve = parseFloat(veFinalSlider.value);
        fBBox = { minX, maxX, minY, maxY, minZ, maxZ, ve };

        fOrbit.target.set((minX + maxX) / 2, ((minZ + maxZ) / 2 - minZ) * ve, -(minY + maxY) / 2);
        fCamera.position.set((minX + maxX) / 2, ((minZ + maxZ) / 2 - minZ) * ve + (maxZ - minZ) * ve + 100, -(minY + maxY) / 2 + (maxY - minY) * 1.5);

        const gridSize = 80;
        const gsx = (maxX - minX) / (gridSize - 1), gsy = (maxY - minY) / (gridSize - 1);

        const sigma = parseFloat(sigmaSlider.value), twoSS = 2 * sigma * sigma;
        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value), maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist, maxDistSq = maxDist * maxDist;

        const zMean = [], zP1 = [], zM1 = [], zP2 = [], zM2 = [], zP3 = [], zM3 = [];

        for (let j = 0; j < gridSize; j++) {
            const rowMean = [], rowP1 = [], rowM1 = [], rowP2 = [], rowM2 = [], rowP3 = [], rowM3 = [];
            const wy = minY + j * gsy;
            for (let i = 0; i < gridSize; i++) {
                const wx = minX + i * gsx;
                let minSq = Infinity;
                const dataPoints = [];
                for (let k = 0; k < n; k++) {
                    const dx = wx - pts.x[k], dy = wy - pts.y[k], dSq = dx * dx + dy * dy;
                    if (dSq < minSq) minSq = dSq;
                    if (dSq >= minDistSq && dSq <= maxDistSq) dataPoints.push({ z: pts.z[k], w: getVariabilityWeight(dSq, maxDistSq, maxDist) });
                }
                if (Math.sqrt(minSq) > rbfAverageSpacing * 1.5) {
                    [rowMean,rowP1,rowM1,rowP2,rowM2,rowP3,rowM3].forEach(r => r.push(NaN));
                    continue;
                }
                const f = 1 - Math.exp(-minSq / twoSS);
                const wMean = evaluateRBF(wx, wy);
                let sd = -1;
                if (dataPoints.length >= minPts) {
                    let wSum = 0, wzSum = 0;
                    for (let p of dataPoints) { wSum += p.w; wzSum += p.w * p.z; }
                    if (wSum > 1e-12) {
                        const m = wzSum / wSum;
                        let varSum = 0;
                        for (let p of dataPoints) varSum += p.w * (p.z - m) ** 2;
                        sd = Math.sqrt(varSum / wSum);
                    }
                }
                if (!isNaN(wMean) && sd >= 0) {
                    const base = f * sd;
                    rowMean.push(wMean);
                    rowP1.push(wMean + base * 1); rowM1.push(wMean - base * 1);
                    rowP2.push(wMean + base * 2); rowM2.push(wMean - base * 2);
                    rowP3.push(wMean + base * 3); rowM3.push(wMean - base * 3);
                } else {
                    [rowMean, rowP1, rowM1, rowP2, rowM2, rowP3, rowM3].forEach(r => r.push(NaN));
                }
            }
            zMean.push(rowMean); zP1.push(rowP1); zM1.push(rowM1);
            zP2.push(rowP2); zM2.push(rowM2); zP3.push(rowP3); zM3.push(rowM3);
        }

        fClipPlanes = [
            new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
            new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0)
        ];

        // Dispose old meshes
        Object.keys(layerMap).forEach(cbId => {
            const k = layerMap[cbId];
            if (fMeshes[k]) {
                fScene.remove(fMeshes[k]);
                if (fMeshes[k].isGroup) {
                    fMeshes[k].children.forEach(c => { c.geometry?.dispose(); c.material?.dispose(); });
                } else { fMeshes[k].geometry?.dispose(); fMeshes[k].material?.dispose(); }
            }
        });

        const cp = fClipPlanes;
        const matMean = new THREE.MeshLambertMaterial({ color: 0xa855f7, transparent: true, opacity: 0.9, side: THREE.DoubleSide, clippingPlanes: cp });
        const matP1   = new THREE.MeshLambertMaterial({ color: 0xf97316, transparent: true, opacity: 0.65, side: THREE.DoubleSide, clippingPlanes: cp });
        const matM1   = new THREE.MeshLambertMaterial({ color: 0x38bdf8, transparent: true, opacity: 0.65, side: THREE.DoubleSide, clippingPlanes: cp });
        const matP2   = new THREE.MeshLambertMaterial({ color: 0xef4444, transparent: true, opacity: 0.5,  side: THREE.DoubleSide, clippingPlanes: cp });
        const matM2   = new THREE.MeshLambertMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.5,  side: THREE.DoubleSide, clippingPlanes: cp });
        const matP3   = new THREE.MeshLambertMaterial({ color: 0xdc2626, transparent: true, opacity: 0.35, side: THREE.DoubleSide, clippingPlanes: cp });
        const matM3   = new THREE.MeshLambertMaterial({ color: 0x2563eb, transparent: true, opacity: 0.35, side: THREE.DoubleSide, clippingPlanes: cp });
        const matPts  = new THREE.MeshLambertMaterial({ color: 0xdc2626, clippingPlanes: cp });

        fMeshes.mean = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zMean, matMean);
        fMeshes.p1   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zP1,   matP1);
        fMeshes.m1   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zM1,   matM1);
        fMeshes.p2   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zP2,   matP2);
        fMeshes.m2   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zM2,   matM2);
        fMeshes.p3   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zP3,   matP3);
        fMeshes.m3   = buildSurfaceMesh(gridSize, minX, gsx, minY, gsy, zM3,   matM3);

        fMeshes.pts = new THREE.Group();
        const dSpan = Math.max(maxX - minX, maxY - minY) || 1000;
        const ptGeo = new THREE.SphereGeometry(dSpan * 0.0075, 16, 16);
        for (let i = 0; i < n; i++) {
            const m = new THREE.Mesh(ptGeo, matPts);
            m.position.set(pts.x[i], (pts.z[i] - minZ) * ve, -pts.y[i]);
            fMeshes.pts.add(m);
        }

        Object.entries(layerMap).forEach(([cbId, meshKey]) => {
            if (fMeshes[meshKey]) {
                fScene.add(fMeshes[meshKey]);
                const cb = document.getElementById(cbId);
                if (cb) fMeshes[meshKey].visible = cb.checked;
            }
        });

        updateClippingPlanes();

        // Store surfaces for DXF export
        storedSurfaces = { gridSize, minX, gsx: gsx, minY, gsy: gsy, zMean, zP1, zM1, zP2, zM2, zP3, zM3 };
    }

    function updateClippingPlanes() {
        if (!fClipPlanes || fClipPlanes.length < 2 || !fBBox) return;

        const mode = sliceModeSelect.value;
        const angleDeg = parseFloat(sliceAngleSlider.value);
        const posPct = parseFloat(slicePosSlider.value) / 100;
        const thickPct = parseFloat(sliceThickSlider.value) / 100;

        const rad = (angleDeg - 90) * Math.PI / 180;
        const nx = Math.cos(rad), nz = Math.sin(rad);

        const cx = (fBBox.minX + fBBox.maxX) / 2;
        const czMap = (fBBox.minY + fBBox.maxY) / 2;
        const halfW = (fBBox.maxX - fBBox.minX) / 2, halfH = (fBBox.maxY - fBBox.minY) / 2;
        const maxD = Math.abs(halfW * nx) + Math.abs(halfH * nz);

        const centerOffset = cx * nx + (-czMap) * nz;
        const currentPos = centerOffset + (posPct * 2 - 1) * maxD;

        if (mode === 'front') {
            fClipPlanes[0].set(new THREE.Vector3(nx, 0, nz), -currentPos);
            fClipPlanes[1].set(new THREE.Vector3(nx, 0, nz), 1e10);
        } else if (mode === 'back') {
            fClipPlanes[0].set(new THREE.Vector3(-nx, 0, -nz), currentPos);
            fClipPlanes[1].set(new THREE.Vector3(nx, 0, nz), 1e10);
        } else if (mode === 'slice') {
            const halfThick = thickPct * maxD;
            fClipPlanes[0].set(new THREE.Vector3(nx, 0, nz), -(currentPos - halfThick));
            fClipPlanes[1].set(new THREE.Vector3(-nx, 0, -nz), (currentPos + halfThick));
        }
    }

    function buildSurfaceMesh(gridSize, minX, sx, minY, sy, zArr, material) {
        const ve = fBBox ? fBBox.ve : 1, minZ = fBBox ? fBBox.minZ : 0;
        const verts = new Float32Array(gridSize * gridSize * 3);
        const valid = new Uint8Array(gridSize * gridSize);
        let validCount = 0;
        for (let j = 0; j < gridSize; j++) {
            for (let i = 0; i < gridSize; i++) {
                const idx = j * gridSize + i;
                const wz = zArr[j][i];
                verts[idx*3]   = minX + i * sx;
                verts[idx*3+1] = isNaN(wz) ? 0 : (wz - minZ) * ve;
                verts[idx*3+2] = -(minY + j * sy);
                if (!isNaN(wz)) { valid[idx] = 1; validCount++; }
            }
        }
        if (validCount < 4) return null;
        const tris = [];
        for (let j = 0; j < gridSize - 1; j++) {
            for (let i = 0; i < gridSize - 1; i++) {
                const i00=j*gridSize+i, i10=i00+1, i01=(j+1)*gridSize+i, i11=i01+1;
                if (valid[i00] && valid[i10] && valid[i01] && valid[i11])
                    tris.push(i00, i10, i01, i10, i11, i01);
            }
        }
        if (tris.length < 3) return null;
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
        geo.setIndex(tris);
        geo.computeVertexNormals();
        return new THREE.Mesh(geo, material);
    }

    // ═══════════════════════════════════════
    //  EXPORT — UTILITIES
    // ═══════════════════════════════════════

    function downloadText(filename, text) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    function enableExportControls() {
        ['exp-zoi', 'exp-stdev', 'exp-u1', 'exp-u2', 'exp-u3', 'exp-dxf'].forEach(id => {
            const el = document.getElementById(id);
            if (el) { el.disabled = false; el.checked = true; }
        });
        const btn = document.getElementById('export-download-btn');
        if (btn) btn.disabled = false;
        const yamlBtn = document.getElementById('export-yaml-btn');
        if (yamlBtn) yamlBtn.disabled = false;
        refreshYAML();
    }

    // ═══════════════════════════════════════
    //  EXPORT — YAML CONFIG GENERATOR
    // ═══════════════════════════════════════

    function generateYAML() {
        const pts = pointData ? pointData.x.length : 0;
        const lines = [
            '# Spatial Variability Analysis — Configuration',
            'version: "1.0"',
            '',
            'data:',
            `  source: "${currentDataSource}"`,
            `  points: ${pts}`,
            `  normalise: ${normalizeCheck.checked}`,
            '',
            'zone_of_influence:',
            `  sigma: ${sigmaSlider.value}`,
            '',
            'local_variability:',
            `  min_points: ${minPtsSlider.value}`,
            `  min_distance: ${minDistSlider.value}`,
            `  max_distance: ${maxDistSlider.value}`,
            '',
            'visualisation:',
            `  vertical_exaggeration: ${veFinalSlider.value}`,
            `  slice_mode: ${sliceModeSelect.value}`,
            `  slice_angle: ${sliceAngleSlider.value}`,
            `  slice_position: ${slicePosSlider.value}`,
            `  slice_thickness: ${sliceThickSlider.value}`,
        ];
        return lines.join('\n');
    }

    function refreshYAML() {
        const el = document.getElementById('yaml-preview');
        if (el && pointData) el.textContent = generateYAML();
    }

    document.getElementById('export-yaml-btn').addEventListener('click', () => {
        downloadText('config.yaml', generateYAML());
    });

    // ═══════════════════════════════════════
    //  EXPORT — 2D GRID COMPUTATION (100×100)
    // ═══════════════════════════════════════

    function computeExportGrid2D(type, sigmaFactor) {
        if (!pointData) return null;
        const b = bbox(0);
        const rangeX = b.rawMaxX - b.rawMinX, rangeY = b.rawMaxY - b.rawMinY;
        const ncols = 100, nrows = 100;
        const cellsize = Math.max(rangeX, rangeY) / 99;
        const xll = b.rawMinX, yll = b.rawMinY;

        const sigma = parseFloat(sigmaSlider.value), twoSS = 2 * sigma * sigma;
        const minPts = parseInt(minPtsSlider.value);
        const minDist = parseFloat(minDistSlider.value), maxDist = parseFloat(maxDistSlider.value);
        const minDistSq = minDist * minDist, maxDistSq = maxDist * maxDist;
        const n = pointData.x.length;
        const grid = new Float64Array(nrows * ncols).fill(-9999);

        for (let row = 0; row < nrows; row++) {
            const wy = b.rawMaxY - row * cellsize; // row 0 = north
            for (let col = 0; col < ncols; col++) {
                const wx = xll + col * cellsize;

                if (type === 'zoi') {
                    let minSq = Infinity;
                    for (let k = 0; k < n; k++) {
                        const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                        const dSq = dx * dx + dy * dy;
                        if (dSq < minSq) minSq = dSq;
                    }
                    grid[row * ncols + col] = 1 - Math.exp(-minSq / twoSS);

                } else {
                    let minSq = Infinity;
                    const dataPoints = [];
                    for (let k = 0; k < n; k++) {
                        const dx = wx - pointData.x[k], dy = wy - pointData.y[k];
                        const dSq = dx * dx + dy * dy;
                        if (dSq < minSq) minSq = dSq;
                        if (dSq >= minDistSq && dSq <= maxDistSq)
                            dataPoints.push({ z: pointData.z[k], w: getVariabilityWeight(dSq, maxDistSq, maxDist) });
                    }
                    if (dataPoints.length >= minPts) {
                        let wSum = 0, wzSum = 0;
                        for (const p of dataPoints) { wSum += p.w; wzSum += p.w * p.z; }
                        if (wSum > 1e-12) {
                            const wMean = wzSum / wSum;
                            let varSum = 0;
                            for (const p of dataPoints) varSum += p.w * (p.z - wMean) ** 2;
                            const sd = Math.sqrt(varSum / wSum);
                            if (type === 'stdev') {
                                grid[row * ncols + col] = sd;
                            } else {
                                const f = 1 - Math.exp(-minSq / twoSS);
                                grid[row * ncols + col] = f * sd * sigmaFactor;
                            }
                        }
                    }
                }
            }
        }
        return { grid, ncols, nrows, xll, yll, cellsize };
    }

    // ═══════════════════════════════════════
    //  EXPORT — ASC FORMATTER
    // ═══════════════════════════════════════

    function gridToASC({ grid, ncols, nrows, xll, yll, cellsize }) {
        const header = [
            `ncols ${ncols}`, `nrows ${nrows}`,
            `xllcorner ${xll}`, `yllcorner ${yll}`,
            `cellsize ${cellsize}`, `NODATA_value -9999`
        ].join('\n');
        const rows = [];
        for (let r = 0; r < nrows; r++) {
            const vals = [];
            for (let c = 0; c < ncols; c++) {
                const v = grid[r * ncols + c];
                vals.push(v === -9999 ? '-9999' : v.toFixed(6));
            }
            rows.push(vals.join(' '));
        }
        return header + '\n' + rows.join('\n');
    }

    // ═══════════════════════════════════════
    //  EXPORT — DXF FORMATTER
    // ═══════════════════════════════════════

    function surfacesToDXF(s) {
        const layers = [
            { key: 'zMean', name: 'MEAN_SURFACE'  },
            { key: 'zP1',   name: 'PLUS_1SIGMA'   },
            { key: 'zM1',   name: 'MINUS_1SIGMA'  },
            { key: 'zP2',   name: 'PLUS_2SIGMA'   },
            { key: 'zM2',   name: 'MINUS_2SIGMA'  },
            { key: 'zP3',   name: 'PLUS_3SIGMA'   },
            { key: 'zM3',   name: 'MINUS_3SIGMA'  },
        ];
        const lines = ['0', 'SECTION', '2', 'ENTITIES'];

        for (const { key, name } of layers) {
            const zArr = s[key];
            if (!zArr) continue;
            for (let j = 0; j < s.gridSize - 1; j++) {
                for (let i = 0; i < s.gridSize - 1; i++) {
                    const x0 = s.minX + i * s.gsx,       y0 = s.minY + j * s.gsy;
                    const x1 = s.minX + (i + 1) * s.gsx, y1 = s.minY + (j + 1) * s.gsy;
                    const z00 = zArr[j][i], z10 = zArr[j][i+1];
                    const z01 = zArr[j+1][i], z11 = zArr[j+1][i+1];
                    if (isNaN(z00) || isNaN(z10) || isNaN(z01) || isNaN(z11)) continue;

                    lines.push('0','3DFACE','8',name,
                        '10',x0.toFixed(4),'20',y0.toFixed(4),'30',z00.toFixed(4),
                        '11',x1.toFixed(4),'21',y0.toFixed(4),'31',z10.toFixed(4),
                        '12',x0.toFixed(4),'22',y1.toFixed(4),'32',z01.toFixed(4),
                        '13',x0.toFixed(4),'23',y1.toFixed(4),'33',z01.toFixed(4));

                    lines.push('0','3DFACE','8',name,
                        '10',x1.toFixed(4),'20',y0.toFixed(4),'30',z10.toFixed(4),
                        '11',x1.toFixed(4),'21',y1.toFixed(4),'31',z11.toFixed(4),
                        '12',x0.toFixed(4),'22',y1.toFixed(4),'32',z01.toFixed(4),
                        '13',x0.toFixed(4),'23',y1.toFixed(4),'33',z01.toFixed(4));
                }
            }
        }
        lines.push('0', 'ENDSEC', '0', 'EOF');
        return lines.join('\n');
    }

    // ═══════════════════════════════════════
    //  EXPORT — DOWNLOAD SELECTED BUTTON
    // ═══════════════════════════════════════

    document.getElementById('export-download-btn').addEventListener('click', () => {
        if (!pointData) return;
        const statusEl = document.getElementById('export-status');
        statusEl.textContent = 'Computing…';
        setTimeout(() => {
            let count = 0;
            try {
                if (document.getElementById('exp-zoi')?.checked) {
                    downloadText('zoi.asc', gridToASC(computeExportGrid2D('zoi', 1))); count++;
                }
                if (document.getElementById('exp-stdev')?.checked) {
                    downloadText('stdev.asc', gridToASC(computeExportGrid2D('stdev', 1))); count++;
                }
                if (document.getElementById('exp-u1')?.checked) {
                    downloadText('uncertainty_1sigma.asc', gridToASC(computeExportGrid2D('uncert', 1))); count++;
                }
                if (document.getElementById('exp-u2')?.checked) {
                    downloadText('uncertainty_2sigma.asc', gridToASC(computeExportGrid2D('uncert', 2))); count++;
                }
                if (document.getElementById('exp-u3')?.checked) {
                    downloadText('uncertainty_3sigma.asc', gridToASC(computeExportGrid2D('uncert', 3))); count++;
                }
                if (document.getElementById('exp-dxf')?.checked && storedSurfaces) {
                    downloadText('uncertainty_surfaces.dxf', surfacesToDXF(storedSurfaces)); count++;
                }
                statusEl.textContent = count > 0
                    ? `✓ ${count} file${count > 1 ? 's' : ''} downloaded.`
                    : 'No items selected.';
            } catch (e) {
                statusEl.textContent = '⚠ Export error: ' + e.message;
                console.error(e);
            }
        }, 20);
    });

});
