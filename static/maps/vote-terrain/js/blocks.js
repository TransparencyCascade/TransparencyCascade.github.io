/* Exact counties (three.js): each county extruded flat, height = votes / area, with two reference blocks
   of 1,000,000 votes on different footprints. Drag pans; shift-drag (or right-drag) tilts and turns,
   inside limits so the map cannot flip. Heights and colours live in a small per-county texture the
   vertex shader reads, so a change of election moves 3,000 numbers, not the whole mesh. The light is the
   one the deck.gl version used (ambient plus one directional light, Phong), so the blocks look the same.
   main.js imports this module the first time Exact counties is shown. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { clamp, reduced } from './util.js';
import { rgb, NEUTRAL } from './colour.js';

const GROUND = new THREE.Color('#E8ECEC');
const ALT = 0.5 / Math.tan(THREE.MathUtils.degToRad(20));   // camera distance per screen height at zoom 0 (fov 40)

export function createBlocks({ container, pieces, presets, k, onHover, initial }) {
  // ---------- per-county data texture: rgb colour (0..1) and height ----------
  const fipsList = [...new Set(pieces.map((p) => p.f))], idxOf = new Map(fipsList.map((f, i) => [f, i]));
  const NC = fipsList.length, REF_IDX = NC;                // two more texels for the reference blocks
  const TW = 64, TH = Math.ceil((NC + 2) / TW);
  const tex = new Float32Array(TW * TH * 4), from = new Float32Array(NC * 4), to = new Float32Array(NC * 4);
  const dataTex = new THREE.DataTexture(tex, TW, TH, THREE.RGBAFormat, THREE.FloatType);
  dataTex.magFilter = dataTex.minFilter = THREE.NearestFilter;

  // ---------- reference blocks: 1,000,000 votes on two footprints ----------
  const REF = 1000000, [rx, ry] = presets.ref.target;
  const square = (cx, cy, s) => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2], [cx - s / 2, cy - s / 2]];
  const refs = [{ s: 9, x: rx - 34 }, { s: 22, x: rx + 12 }].map((r, i) => ({ idx: REF_IDX + i, p: [square(r.x, ry, r.s)], h: k * REF / (r.s * r.s) }));
  const nc = rgb(NEUTRAL);
  refs.forEach((r) => tex.set([nc[0] / 255, nc[1] / 255, nc[2] / 255, r.h], r.idx * 4));

  // ---------- geometry: tops and sides; z comes from the texture (position.z is 1 on top, 0 at the base) ----------
  // aNrm: the side's outward normal in the plane; (0, 0) marks a top face.
  function prisms(list) {
    const P = [], N = [], I = [], idx = [];
    for (const { idx: ci, p: rings } of list) {
      const flat2 = rings.map((r) => r.map((q) => new THREE.Vector2(q[0], q[1])));
      const tris = THREE.ShapeUtils.triangulateShape(flat2[0], flat2.slice(1));
      // triangulateShape drops a closing point equal to the first, in place: its indices are into these rings joined.
      const base = P.length / 3, all = flat2.flat();
      for (const v of all) { P.push(v.x, v.y, 1); N.push(0, 0); I.push(ci); }
      for (const t of tris) {
        // Counter-clockwise from above, so the top faces up.
        const [a, b, c] = t, A = all[a], B = all[b], C = all[c];
        const cw = (B.x - A.x) * (C.y - A.y) - (B.y - A.y) * (C.x - A.x) < 0;
        idx.push(base + a, base + (cw ? c : b), base + (cw ? b : c));
      }
      rings.forEach((ring, ri) => {
        const n = ring.length;
        let area = 0; for (let i = 0; i < n; i++) area += ring[i][0] * ring[(i + 1) % n][1] - ring[(i + 1) % n][0] * ring[i][1];
        const s = (area > 0 ? 1 : -1) * (ri ? -1 : 1);         // outward from the solid, for outer rings and holes
        for (let i = 0; i < n; i++) {
          const a = ring[i], b = ring[(i + 1) % n], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
          if (!l) continue;
          const nx = s * dy / l, ny = -s * dx / l, v = P.length / 3;
          P.push(a[0], a[1], 0, b[0], b[1], 0, b[0], b[1], 1, a[0], a[1], 1);
          for (let j = 0; j < 4; j++) { N.push(nx, ny); I.push(ci); }
          idx.push(v, v + 1, v + 2, v, v + 2, v + 3);
        }
      });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aNrm', new THREE.Float32BufferAttribute(N, 2));
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(I, 1));
    g.setIndex(idx);
    return g;
  }
  const countyList = pieces.map((pc) => ({ idx: idxOf.get(pc.f), p: pc.p }));
  const countyGeom = prisms(countyList), refGeom = prisms(refs);
  countyGeom.boundingSphere = refGeom.boundingSphere = new THREE.Sphere(new THREE.Vector3(490, -300, 0), 2000);

  const VERT_HEAD = /* glsl */`
    uniform sampler2D uData; uniform vec2 uTexSize;
    attribute float aIdx; attribute vec2 aNrm;
    vec4 dataOf(float i) { return texture2D(uData, vec2((mod(i, uTexSize.x) + 0.5) / uTexSize.x, (floor(i / uTexSize.x) + 0.5) / uTexSize.y)); }
    vec3 placed(vec4 d) { return vec3(position.xy, position.z > 0.5 ? max(d.a, 0.0) : min(d.a, 0.0)); }`;
  const shared = { uData: { value: dataTex }, uTexSize: { value: new THREE.Vector2(TW, TH) } };
  // deck.gl's lighting: ambient 1.15 white, one directional light (255, 252, 246) at 0.75 toward (1, 1.6, -2.2);
  // material ambient 0.82, diffuse 0.42, shininess 2, specular 8/255. Colours are used as given, without
  // colour-space conversion, as deck.gl did.
  const material = new THREE.ShaderMaterial({
    uniforms: { ...shared, uLightDir: { value: new THREE.Vector3(1, 1.6, -2.2).normalize() }, uLightCol: { value: new THREE.Vector3(255, 252, 246).multiplyScalar(0.75 / 255) } },
    vertexShader: VERT_HEAD + /* glsl */`
      varying vec3 vCol; varying vec3 vN; varying vec3 vPos;
      void main() {
        vec4 d = dataOf(aIdx); vec3 p = placed(d);
        vCol = d.rgb; vN = aNrm == vec2(0.0) ? vec3(0.0, 0.0, 1.0) : vec3(aNrm, 0.0); vPos = p;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uLightDir; uniform vec3 uLightCol;
      varying vec3 vCol; varying vec3 vN; varying vec3 vPos;
      void main() {
        vec3 n = normalize(gl_FrontFacing ? vN : -vN), l = -uLightDir, v = normalize(cameraPosition - vPos);
        float lam = dot(l, n), spec = lam > 0.0 ? pow(max(dot(n, normalize(l + v)), 0.0), 2.0) : 0.0;
        vec3 c = 0.82 * 1.15 * vCol + (max(lam, 0.0) * 0.42 * vCol + spec * vec3(8.0 / 255.0)) * uLightCol;
        gl_FragColor = vec4(c, 1.0);
      }`,
    side: THREE.DoubleSide,                              // a sunk county shows its walls from inside
  });
  material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1;   // edges draw on top
  const counties = new THREE.Mesh(countyGeom, material), refMesh = new THREE.Mesh(refGeom, material);
  counties.frustumCulled = refMesh.frustumCulled = false;

  // Edges once zoomed in: top and base outlines and a strut at every corner, in faint ink (built on first use).
  let edges = null;
  const buildEdges = () => {
    const P = [], I = [];
    for (const { idx: ci, p: rings } of countyList) for (const ring of rings) for (let i = 0; i < ring.length; i++) {
      const a = ring[i], b = ring[(i + 1) % ring.length];
      if (a[0] === b[0] && a[1] === b[1]) continue;
      P.push(a[0], a[1], 1, b[0], b[1], 1, a[0], a[1], 0, b[0], b[1], 0, a[0], a[1], 0, a[0], a[1], 1);
      for (let j = 0; j < 6; j++) I.push(ci);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('aIdx', new THREE.Float32BufferAttribute(I, 1));
    const m = new THREE.ShaderMaterial({ uniforms: shared, transparent: true, depthWrite: false,
      vertexShader: VERT_HEAD + 'void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(placed(dataOf(aIdx)), 1.0); }',
      fragmentShader: 'void main() { gl_FragColor = vec4(35.0 / 255.0, 48.0 / 255.0, 107.0 / 255.0, 34.0 / 255.0); }' });
    edges = new THREE.LineSegments(g, m); edges.frustumCulled = false; scene.add(edges);
  };

  // ---------- scene, camera, controls ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(GROUND);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(counties, refMesh);
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;                  // pan along the map, not the screen
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };   // shift-drag rotates
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_PAN };
  controls.enableDamping = !reduced; controls.dampingFactor = 0.12;
  controls.zoomToCursor = true;                          // zoom toward the pointer
  controls.zoomSpeed = 7.4;                              // about deck.gl's step per wheel notch
  controls.minAzimuthAngle = -Math.PI; controls.maxAzimuthAngle = Math.PI;

  // The camera is described the deck.gl way: target, zoom (2^zoom pixels per map unit at the target),
  // rotationX (90 looks straight down; lower is more oblique) and rotationOrbit (the opposite sign of the
  // terrain's azimuth).
  const Z0 = presets.national.zoom;
  const LIMITS = { minZoom: Z0 - 1.2, maxZoom: Z0 + 5, minTilt: 8, maxTilt: 88 };
  const EDGE_ZOOM = Z0 + 1.1;                           // county edges appear once zoomed in past the national view
  let flat = initial.flat;
  const H = () => container.clientHeight || window.innerHeight;
  const distOf = (zoom) => ALT * H() / 2 ** zoom;
  const limits = () => {
    controls.minDistance = distOf(LIMITS.maxZoom); controls.maxDistance = distOf(LIMITS.minZoom);
    controls.minPolarAngle = flat ? 0 : THREE.MathUtils.degToRad(90 - LIMITS.maxTilt);
    controls.maxPolarAngle = flat ? 0 : THREE.MathUtils.degToRad(90 - LIMITS.minTilt);
  };
  const UP = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0)), UPINV = UP.clone().invert();
  const place = (vs) => {
    const tgt = new THREE.Vector3(vs.target[0], vs.target[1], 0);
    controls.target.copy(tgt);
    const sph = new THREE.Spherical(distOf(vs.zoom), THREE.MathUtils.degToRad(Math.max(1e-3, 90 - vs.rotationX)), THREE.MathUtils.degToRad(-vs.rotationOrbit));
    camera.position.copy(new THREE.Vector3().setFromSpherical(sph).applyQuaternion(UPINV).add(tgt));
    camera.lookAt(tgt);
  };
  const current = () => {
    const sph = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(UP));
    return { target: [controls.target.x, controls.target.y, 0], zoom: Math.log2(ALT * H() / sph.radius),
      rotationX: 90 - THREE.MathUtils.radToDeg(sph.phi), rotationOrbit: -THREE.MathUtils.radToDeg(sph.theta) };
  };
  // Linear moves between deck-style views, as deck.gl's LinearInterpolator did.
  let move = null;
  const look = (vs, duration, fields = ['target', 'zoom', 'rotationX', 'rotationOrbit']) => {
    const a = current(), b = { ...a, ...vs };
    move = null;
    if (!duration || reduced) { place(b); return; }
    for (const f of ['target', 'zoom', 'rotationX', 'rotationOrbit']) if (!fields.includes(f)) a[f] = b[f];
    move = { a, b, t0: performance.now(), duration };
  };
  const stepMove = (now) => {
    const u = Math.min(1, (now - move.t0) / move.duration), lerp = (x, y) => x + (y - x) * u, { a, b } = move;
    place({ target: [lerp(a.target[0], b.target[0]), lerp(a.target[1], b.target[1]), 0], zoom: lerp(a.zoom, b.zoom), rotationX: lerp(a.rotationX, b.rotationX), rotationOrbit: lerp(a.rotationOrbit, b.rotationOrbit) });
    if (u >= 1) move = null;
  };
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) renderer.domElement.addEventListener(ev, () => { move = null; }, { passive: true });

  // The national view is fitted to the space between the panel (left) and the key (right); the
  // projection is 975 units wide. Close-ups look in at a lower, more oblique angle, so their blocks stand
  // against the horizon. West and east look across the country from low on the horizon, so heights read as a skyline.
  const LOOK = { national: { tilt: 42 }, west: { tilt: 14, orbit: 90, across: true }, east: { tilt: 14, orbit: -90, across: true },
                 texas: { tilt: 30, zoom: 1.45 }, maine: { tilt: 34, zoom: 1.9 } };
  const viewFor = (name, side) => {
    const lk = LOOK[name] || { tilt: 42 }, p = presets[name] || presets.national, { left, right } = side;
    const avail = Math.max(320, window.innerWidth - left - right);
    const zoom = name === 'national' ? Math.log2(avail * 1.08 / 975) : lk.across ? Math.log2(avail * 0.95 / 610) : lk.zoom ?? p.zoom;
    const shift = (left - right) / 2 / 2 ** zoom;
    return { target: [p.target[0] - shift, p.target[1] - (flat ? 0 : 18 / 2 ** zoom), 0], zoom, rotationX: flat ? 90 : lk.tilt, rotationOrbit: flat ? 0 : lk.orbit || 0 };
  };

  // ---------- size, labels, render loop ----------
  let size = '';
  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight, key = w + 'x' + h;
    if (key === size || !w || !h) return false;
    const vs = size ? current() : null;
    size = key; renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); limits();
    if (vs) place(vs);                                 // the same zoom keeps the same scale on screen
    return true;
  };
  // Inside the map's container, so the panels draw over it as they did over deck.gl's text layer.
  const label = document.createElement('div'); label.className = 'blocks-label'; label.textContent = '1,000,000 votes each'; container.appendChild(label);
  const labelAt = new THREE.Vector3(rx - 12, ry - 26, 0), v3 = new THREE.Vector3();
  const placeLabel = (on) => {
    v3.copy(labelAt).project(camera);
    const show = on && !flat && v3.z < 1;
    label.style.display = show ? 'block' : 'none';
    if (show) label.style.transform = `translate(${(v3.x + 1) / 2 * container.clientWidth}px, ${(1 - v3.y) / 2 * container.clientHeight}px) translate(-50%, -50%)`;
  };
  // Heights and colours ease over 800 ms, as deck.gl's transitions did.
  let anim = null;
  const stepAnim = (now) => {
    const u = anim.duration ? Math.min(1, (now - anim.t0) / anim.duration) : 1;
    for (let i = 0; i < NC * 4; i++) tex[i] = from[i] + (to[i] - from[i]) * u;
    dataTex.needsUpdate = true;
    if (u >= 1) anim = null;
  };
  (function loop() {
    requestAnimationFrame(loop);
    const on = container.style.display !== 'none';
    placeLabel(on);
    if (!on) return;
    resize();
    if (move) stepMove(performance.now()); else controls.update();
    if (anim) stepAnim(performance.now());
    const z = current().zoom;
    if (z > EDGE_ZOOM && !edges) buildEdges();
    if (edges) edges.visible = z > EDGE_ZOOM;
    renderer.render(scene, camera);
  })();

  // ---------- picking: render county indices into one pixel under the pointer ----------
  const pickTarget = new THREE.WebGLRenderTarget(1, 1), pickScene = new THREE.Scene(), pixel = new Uint8Array(4);
  const pickMat = new THREE.ShaderMaterial({ uniforms: shared, side: THREE.DoubleSide,
    vertexShader: VERT_HEAD + 'varying float vI; void main() { vI = aIdx + 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(placed(dataOf(aIdx)), 1.0); }',
    fragmentShader: 'varying float vI; void main() { float i = floor(vI + 0.5); gl_FragColor = vec4(mod(i, 256.0), mod(floor(i / 256.0), 256.0), 0.0, 255.0) / 255.0; }' });
  pickScene.add(new THREE.Mesh(countyGeom, pickMat)); pickScene.children[0].frustumCulled = false;
  function pick(clientX, clientY) {
    if (container.style.display === 'none') return null;
    const r = renderer.domElement.getBoundingClientRect();
    camera.setViewOffset(r.width, r.height, clientX - r.left, clientY - r.top, 1, 1);
    renderer.setRenderTarget(pickTarget); renderer.setClearColor(0x000000, 0); renderer.clear(); renderer.render(pickScene, camera);
    renderer.readRenderTargetPixels(pickTarget, 0, 0, 1, 1, pixel);
    renderer.setRenderTarget(null); renderer.setClearColor(GROUND); camera.clearViewOffset();
    const i = pixel[0] + pixel[1] * 256 - 1;
    return i >= 0 && i < NC ? fipsList[i] : null;
  }
  let pending = null;
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return;
    const first = !pending; pending = ev;
    if (first) requestAnimationFrame(() => { const e2 = pending; pending = null; onHover(pick(e2.clientX, e2.clientY), e2.clientX, e2.clientY); });
  });
  renderer.domElement.addEventListener('pointerleave', () => { pending = null; onHover(null); });

  resize(); limits(); place(viewFor(initial.view, initial.side));
  const setData = (sceneSpec, animate) => {
    const { heightOf, colourOf } = sceneSpec;
    from.set(tex.subarray(0, NC * 4));
    for (let i = 0; i < NC; i++) { const f = fipsList[i], c = colourOf(f); to.set([c[0] / 255, c[1] / 255, c[2] / 255, heightOf(f)], i * 4); }
    anim = { t0: performance.now(), duration: animate && !reduced ? 800 : 0 };
    if (!anim.duration) stepAnim(performance.now());
  };
  setData(initial.scene, false);
  let lastKey = initial.scene.key;

  return {
    // scene: { heightOf(f), colourOf(f) -> [r,g,b], flat, key } (key changes whenever heights or colours do).
    draw(next) {
      flat = next.flat; limits(); refMesh.visible = !flat;
      if (next.key !== lastKey) { lastKey = next.key; setData(next, true); }
    },
    view(name, side, animate = true) { look(viewFor(name, side), animate ? 900 : 0); },
    // Frame a set of counties from a low angle.
    frame(set) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const pc of pieces) if (set.has(pc.f)) for (const q of pc.p[0]) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      }
      if (!isFinite(x0)) return;
      const zoom = Math.log2(Math.min(window.innerWidth * 0.55 / (x1 - x0 + 30), window.innerHeight * 0.6 / (y1 - y0 + 30)));
      look({ target: [(x0 + x1) / 2, (y0 + y1) / 2, 0], zoom: clamp(zoom, LIMITS.minZoom, LIMITS.maxZoom), rotationX: 34, rotationOrbit: 0 }, 900);
    },
    // The Flat map button: tip straight down (or back up) without moving.
    tip(toFlat) {
      flat = toFlat; limits();
      look({ rotationX: toFlat ? 90 : 42, rotationOrbit: toFlat ? 0 : current().rotationOrbit }, 600, ['rotationX', 'rotationOrbit']);
    },
    pick,
    heightOf: (f) => to[idxOf.get(f) * 4 + 3],      // for the smoke test: the height the blocks are moving to
    destroy() { renderer.dispose(); renderer.domElement.remove(); label.remove(); },
  };
}
