(function () {
  'use strict';

  // ================= Config =================
  const ROWS = 5;
  const BASE_SIZE = 8;
  const HEIGHT = 9.2;
  const SURFACE_OFFSET = 0.05;
  const MOVE_DURATION = 420; // ms per hop
  const TUBE_RADIUS = 0.045;
  const MARKER_RADIUS = 0.2;
  const COLOR_PATH = 0x35c0ff;
  const COLOR_VISITED = 0xffb020;
  const COLOR_REACHABLE = 0xff8a2b;
  const COLOR_APEX = 0xffe27a;

  // ================= DOM =================
  const canvas = document.getElementById('scene');
  const hud = document.getElementById('hud');
  const timeFill = document.getElementById('timeFill');
  const timeText = document.getElementById('timeText');
  const moveText = document.getElementById('moveText');
  const hintEl = document.getElementById('hint');
  const startScreen = document.getElementById('startScreen');
  const winScreen = document.getElementById('winScreen');
  const loseScreen = document.getElementById('loseScreen');
  const loadError = document.getElementById('loadError');
  const winStats = document.getElementById('winStats');
  const loseStats = document.getElementById('loseStats');

  function supportsWebGL() {
    try {
      const c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) {
      return false;
    }
  }

  if (!supportsWebGL() || typeof THREE === 'undefined') {
    loadError.classList.remove('hidden');
    return;
  }

  // ================= Geometry setup =================
  const half = BASE_SIZE / 2;
  const cornersPlain = [
    { x: -half, y: 0, z: half },
    { x: half, y: 0, z: half },
    { x: half, y: 0, z: -half },
    { x: -half, y: 0, z: -half },
  ];
  cornersPlain.apex = { x: 0, y: HEIGHT, z: 0 };

  const graph = PyramidMaze.buildPyramidGraph(ROWS, cornersPlain);

  function v3(p) { return new THREE.Vector3(p.x, p.y, p.z); }

  // outward-facing normal per side face (0..3)
  const faceNormals = [0, 1, 2, 3].map((f) => {
    const L = v3(cornersPlain[f]);
    const R = v3(cornersPlain[(f + 1) % 4]);
    const A = v3(cornersPlain.apex);
    const n = new THREE.Vector3().subVectors(R, L).cross(new THREE.Vector3().subVectors(A, L)).normalize();
    const mid = L.clone().add(R).add(A).multiplyScalar(1 / 3);
    const outward = new THREE.Vector3(mid.x, 0, mid.z).normalize();
    if (n.dot(outward) < 0) n.negate();
    return n;
  });

  // precompute an outward offset direction for every graph node (for
  // pushing rendered geometry a hair off the pyramid's skin so it doesn't
  // z-fight with the translucent solid).
  const nodeOffsetDir = new Map();
  for (const node of graph.nodes.values()) {
    const acc = new THREE.Vector3();
    for (const f of node.onFaces) acc.add(faceNormals[f]);
    acc.normalize();
    nodeOffsetDir.set(node.id, acc);
  }
  function renderPos(nodeId) {
    const node = graph.nodes.get(nodeId);
    const dir = nodeOffsetDir.get(nodeId);
    return v3(node.pos).addScaledVector(dir, SURFACE_OFFSET);
  }

  // ================= Three.js scene =================
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x05060c, 1);

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x05060c, 0.028);

  const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 200);

  const animatables = [];

  // -- starfield --
  (function addStars() {
    const N = 900;
    const positions = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const r = 60 + Math.random() * 60;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(Math.random() * 2 - 1);
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.abs(r * Math.cos(phi)) * 0.6 + 2;
      positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({ color: 0x9fb3ff, size: 0.18, transparent: true, opacity: 0.75 });
    const stars = new THREE.Points(geo, mat);
    scene.add(stars);
    animatables.push((dt) => { stars.rotation.y += dt * 0.005; });
  })();

  // -- ground disc --
  {
    const ringGeo = new THREE.CircleGeometry(half * 1.35, 48);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x0b1024, transparent: true, opacity: 0.4 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.02;
    scene.add(ring);
  }

  // -- lights --
  scene.add(new THREE.AmbientLight(0x8891c7, 0.55));
  const sun = new THREE.DirectionalLight(0xfff4e0, 0.9);
  sun.position.set(10, 18, 8);
  scene.add(sun);

  const playerLight = new THREE.PointLight(0x35c0ff, 2.2, 8, 2);
  scene.add(playerLight);

  const apexLight = new THREE.PointLight(0xffe27a, 1.6, 10, 2);
  apexLight.position.copy(renderPos('APEX'));
  scene.add(apexLight);

  // -- pyramid solid --
  {
    const geo = new THREE.BufferGeometry();
    const L = cornersPlain;
    const A = cornersPlain.apex;
    const verts = [];
    for (let f = 0; f < 4; f++) {
      const a = L[f], b = L[(f + 1) % 4];
      verts.push(a.x, a.y, a.z, b.x, b.y, b.z, A.x, A.y, A.z);
    }
    // base (two tris)
    verts.push(L[0].x, L[0].y, L[0].z, L[1].x, L[1].y, L[1].z, L[2].x, L[2].y, L[2].z);
    verts.push(L[0].x, L[0].y, L[0].z, L[2].x, L[2].y, L[2].z, L[3].x, L[3].y, L[3].z);
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();

    const mat = new THREE.MeshStandardMaterial({
      color: 0x171b31,
      transparent: true,
      opacity: 0.42,
      roughness: 0.55,
      metalness: 0.15,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    const edges = new THREE.EdgesGeometry(geo, 1);
    const lineMat = new THREE.LineBasicMaterial({ color: 0x4a5686, transparent: true, opacity: 0.6 });
    scene.add(new THREE.LineSegments(edges, lineMat));
  }

  // -- apex beacon --
  const apexGroup = new THREE.Group();
  apexGroup.position.copy(renderPos('APEX'));
  scene.add(apexGroup);
  {
    const core = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.28, 0),
      new THREE.MeshStandardMaterial({ color: COLOR_APEX, emissive: COLOR_APEX, emissiveIntensity: 1.4, roughness: 0.3 })
    );
    apexGroup.add(core);
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.015, 0.09, 2.4, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: COLOR_APEX, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
    );
    beam.position.y = 1.2;
    apexGroup.add(beam);
    animatables.push((dt, t) => {
      core.rotation.y += dt * 0.8;
      core.rotation.x += dt * 0.35;
      const s = 1 + Math.sin(t * 2.4) * 0.12;
      core.scale.setScalar(s);
    });
  }

  // ================= Maze state (rebuilt on each (re)start) =================
  let tree = null;
  let startId = null;
  let currentId = null;
  let visitedEdges = null; // Set of "a|b" sorted edge keys already walked
  let tubeMeshes = null; // Map edgeKey -> mesh
  let markerGroup = new THREE.Group();
  scene.add(markerGroup);
  let activeMarkers = []; // [{mesh, nodeId}]
  let pathLen = 0;
  let timeLimitMs = 60000;
  let startTime = 0;
  let movesCount = 0;
  let phase = 'start'; // start | playing | won | lost
  let inputLocked = false;

  let mazeGroup = new THREE.Group();
  scene.add(mazeGroup);

  function edgeKey(a, b) { return a < b ? a + '|' + b : b + '|' + a; }

  function buildTube(id1, id2, color) {
    const p1 = renderPos(id1), p2 = renderPos(id2);
    const dir = new THREE.Vector3().subVectors(p2, p1);
    const len = dir.length();
    const geo = new THREE.CylinderGeometry(TUBE_RADIUS, TUBE_RADIUS, len, 6, 1);
    geo.translate(0, len / 2, 0);
    const mat = new THREE.MeshStandardMaterial({
      color, emissive: color, emissiveIntensity: 0.9, roughness: 0.4, metalness: 0.1,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(p1);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  function clearMarkers() {
    for (const { mesh } of activeMarkers) {
      markerGroup.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    activeMarkers = [];
  }

  function refreshMarkers() {
    clearMarkers();
    if (phase !== 'playing') return;
    const neighbors = Array.from(tree.get(currentId));
    for (const nid of neighbors) {
      const geo = new THREE.SphereGeometry(MARKER_RADIUS, 16, 12);
      const mat = new THREE.MeshStandardMaterial({
        color: COLOR_REACHABLE, emissive: COLOR_REACHABLE, emissiveIntensity: 1.1, roughness: 0.35,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.copy(renderPos(nid));
      mesh.userData.pulsePhase = Math.random() * Math.PI * 2;
      markerGroup.add(mesh);
      activeMarkers.push({ mesh, nodeId: nid });
    }
    hintEl.textContent = neighbors.length === 1
      ? 'Sackgasse! Nur der Rückweg bleibt.'
      : (movesCount === 0 ? 'Tippe/klicke auf einen orangenen Punkt, um loszulaufen.' : '');
  }

  function rebuildMazeVisuals() {
    for (const mesh of mazeGroup.children) {
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    mazeGroup.clear();
    tubeMeshes = new Map();
    const seen = new Set();
    for (const [id, nbrs] of tree.entries()) {
      for (const nb of nbrs) {
        const key = edgeKey(id, nb);
        if (seen.has(key)) continue;
        seen.add(key);
        const visited = visitedEdges.has(key);
        const mesh = buildTube(id, nb, visited ? COLOR_VISITED : COLOR_PATH);
        tubeMeshes.set(key, mesh);
        mazeGroup.add(mesh);
      }
    }
  }

  function markEdgeVisited(a, b) {
    const key = edgeKey(a, b);
    visitedEdges.add(key);
    const mesh = tubeMeshes.get(key);
    if (mesh) {
      mesh.material.color.setHex(COLOR_VISITED);
      mesh.material.emissive.setHex(COLOR_VISITED);
    }
  }

  // ================= Orbit camera controls =================
  const orbit = {
    azimuth: Math.PI * 0.25,
    polar: Math.PI * 0.33,
    distance: BASE_SIZE * 2.7,
    target: new THREE.Vector3(0, HEIGHT * 0.4, 0),
    autoRotate: true,
  };
  const MIN_POLAR = Math.PI * 0.12;
  const MAX_POLAR = Math.PI * 0.49;
  const MIN_DIST = BASE_SIZE * 1.3;
  const MAX_DIST = BASE_SIZE * 4.2;

  // where the camera "looks at": follows the player's climb, but damped
  // horizontally and biased upward so the whole pyramid silhouette stays
  // in view instead of hugging the player's exact surface position.
  function followTarget() {
    const p = playerMesh.position;
    return new THREE.Vector3(p.x * 0.45, Math.max(p.y, HEIGHT * 0.22) + HEIGHT * 0.1, p.z * 0.45);
  }

  function updateCameraPosition() {
    const { azimuth, polar, distance, target } = orbit;
    const x = target.x + distance * Math.sin(polar) * Math.sin(azimuth);
    const y = target.y + distance * Math.cos(polar);
    const z = target.z + distance * Math.sin(polar) * Math.cos(azimuth);
    camera.position.set(x, y, z);
    camera.lookAt(target);
  }

  // pointer interaction: drag = rotate camera, tap/click on a marker = move
  let pointerDown = false;
  let dragged = false;
  let downX = 0, downY = 0, downT = 0;
  let lastX = 0, lastY = 0;

  function onPointerDown(e) {
    pointerDown = true;
    dragged = false;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    downT = performance.now();
    orbit.autoRotate = false;
  }
  function onPointerMove(e) {
    if (!pointerDown) return;
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (Math.abs(e.clientX - downX) > 5 || Math.abs(e.clientY - downY) > 5) dragged = true;
    orbit.azimuth -= dx * 0.006;
    orbit.polar = Math.min(MAX_POLAR, Math.max(MIN_POLAR, orbit.polar - dy * 0.006));
  }
  function onPointerUp(e) {
    if (!pointerDown) return;
    pointerDown = false;
    const dt = performance.now() - downT;
    if (!dragged && dt < 500) {
      handleTap(e.clientX, e.clientY);
    }
  }
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    orbit.distance = Math.min(MAX_DIST, Math.max(MIN_DIST, orbit.distance * (1 + Math.sign(e.deltaY) * 0.12)));
  }, { passive: false });

  const raycaster = new THREE.Raycaster();
  function handleTap(clientX, clientY) {
    if (phase !== 'playing' || inputLocked || activeMarkers.length === 0) return;
    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    raycaster.setFromCamera(ndc, camera);
    const hits = raycaster.intersectObjects(activeMarkers.map((m) => m.mesh));
    if (hits.length) {
      const hitMesh = hits[0].object;
      const entry = activeMarkers.find((m) => m.mesh === hitMesh);
      if (entry) attemptMove(entry.nodeId);
    }
  }

  // ================= Movement =================
  function easeInOutQuad(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function attemptMove(nodeId) {
    if (phase !== 'playing' || inputLocked) return Promise.resolve(false);
    if (!tree.get(currentId).has(nodeId)) return Promise.resolve(false);

    inputLocked = true;
    const fromId = currentId;
    const from = renderPos(fromId);
    const to = renderPos(nodeId);
    const t0 = performance.now();

    return new Promise((resolve) => {
      function step() {
        const t = Math.min(1, (performance.now() - t0) / MOVE_DURATION);
        const e = easeInOutQuad(t);
        const pos = from.clone().lerp(to, e);
        playerMesh.position.copy(pos);
        playerLight.position.copy(pos);
        if (t < 1) {
          requestAnimationFrame(step);
        } else {
          markEdgeVisited(fromId, nodeId);
          currentId = nodeId;
          movesCount++;
          moveText.textContent = String(movesCount);
          refreshMarkers();
          inputLocked = false;
          if (currentId === 'APEX') {
            triggerWin();
          }
          resolve(true);
        }
      }
      step();
    });
  }

  // ================= Player mesh =================
  const playerMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 20, 16),
    new THREE.MeshStandardMaterial({ color: 0x35c0ff, emissive: 0x35c0ff, emissiveIntensity: 1.3, roughness: 0.25 })
  );
  scene.add(playerMesh);
  animatables.push((dt, t) => {
    playerMesh.scale.setScalar(1 + Math.sin(t * 5) * 0.06);
  });

  // ================= Game lifecycle =================
  function computeTimeLimit(len) {
    return Math.min(150000, Math.max(45000, 24000 + len * 3100));
  }

  function newGame() {
    startId = PyramidMaze.pickStartNode(graph);
    tree = PyramidMaze.generateMaze(graph, startId);
    const path = PyramidMaze.treePath(tree, startId, 'APEX');
    pathLen = path.length - 1;
    timeLimitMs = computeTimeLimit(pathLen);

    visitedEdges = new Set();
    currentId = startId;
    movesCount = 0;
    moveText.textContent = '0';

    rebuildMazeVisuals();

    const startPos = renderPos(startId);
    playerMesh.position.copy(startPos);
    playerLight.position.copy(startPos);

    // aim camera roughly at the starting face
    orbit.azimuth = Math.atan2(startPos.x, startPos.z) + Math.PI;
    orbit.polar = Math.PI * 0.33;
    orbit.distance = BASE_SIZE * 2.7;
    orbit.target.set(0, HEIGHT * 0.4, 0);

    phase = 'playing';
    startTime = performance.now();
    refreshMarkers();

    hud.classList.remove('hidden');
    startScreen.classList.add('hidden');
    winScreen.classList.add('hidden');
    loseScreen.classList.add('hidden');
  }

  function formatTime(ms) {
    const s = Math.max(0, Math.ceil(ms / 1000));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + ':' + String(r).padStart(2, '0');
  }

  function triggerWin() {
    phase = 'won';
    const elapsed = performance.now() - startTime;
    winStats.textContent = `Züge: ${movesCount} · Zeit: ${formatTime(elapsed)} min · ${formatTime(timeLimitMs - elapsed)} min übrig`;
    winScreen.classList.remove('hidden');
  }

  function triggerLose() {
    phase = 'lost';
    clearMarkers();
    loseStats.textContent = `Du hast es bis auf ${movesCount} Züge geschafft. Zielweg: ${pathLen} Züge.`;
    loseScreen.classList.remove('hidden');
  }

  document.getElementById('startBtn').addEventListener('click', newGame);
  document.getElementById('restartBtn').addEventListener('click', newGame);
  document.getElementById('winRestartBtn').addEventListener('click', newGame);
  document.getElementById('loseRestartBtn').addEventListener('click', newGame);

  // ================= Resize =================
  function onResize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', onResize);
  onResize();

  // ================= Main loop =================
  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    const t = clock.elapsedTime;

    if (orbit.autoRotate) orbit.azimuth += dt * 0.12;
    orbit.target.lerp(followTarget(), dt * 1.2);
    updateCameraPosition();

    for (const fn of animatables) fn(dt, t);

    // marker pulse
    for (const { mesh } of activeMarkers) {
      const s = 1 + Math.sin(t * 5 + (mesh.userData.pulsePhase || 0)) * 0.22;
      mesh.scale.setScalar(s);
    }

    if (phase === 'playing') {
      const elapsed = performance.now() - startTime;
      const remaining = timeLimitMs - elapsed;
      const frac = Math.max(0, Math.min(1, remaining / timeLimitMs));
      timeFill.style.width = (frac * 100).toFixed(1) + '%';
      timeText.textContent = formatTime(remaining);
      timeFill.style.background = frac > 0.5
        ? 'linear-gradient(90deg, #33e0a1, #35c0ff)'
        : frac > 0.2
          ? 'linear-gradient(90deg, #ffd166, #ff8a2b)'
          : 'linear-gradient(90deg, #ff4d4d, #ff8a2b)';
      if (remaining <= 0) triggerLose();
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  updateCameraPosition();
  requestAnimationFrame(tick);

  // ================= Debug / test hook =================
  window.__pyramidGame = {
    getState() {
      const elapsed = phase === 'playing' ? performance.now() - startTime : null;
      return {
        phase,
        currentId,
        startId,
        movesCount,
        pathLen,
        timeLimitMs,
        timeLeftMs: elapsed === null ? null : timeLimitMs - elapsed,
        nodeCount: graph.nodes.size,
      };
    },
    getReachable() {
      return tree && currentId ? Array.from(tree.get(currentId)) : [];
    },
    moveTo(nodeId) { return attemptMove(nodeId); },
    async autoSolve() {
      const path = PyramidMaze.treePath(tree, currentId, 'APEX');
      for (let i = 1; i < path.length; i++) {
        await attemptMove(path[i]);
      }
      return this.getState();
    },
    forceExpire() { startTime = performance.now() - timeLimitMs - 500; },
    start() { newGame(); },
    restart() { newGame(); },
    // -- test-only helpers (screen-space projection, camera introspection) --
    projectNode(nodeId) {
      const pos = renderPos(nodeId).clone();
      pos.project(camera);
      const rect = canvas.getBoundingClientRect();
      return {
        x: rect.left + (pos.x * 0.5 + 0.5) * rect.width,
        y: rect.top + (-pos.y * 0.5 + 0.5) * rect.height,
      };
    },
    getCameraState() {
      return { azimuth: orbit.azimuth, polar: orbit.polar, distance: orbit.distance };
    },
  };
})();
