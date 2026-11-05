/* Smooth vote terrain (three.js). Reads the grids written by build_terrain.mjs: each land cell's total
   votes and Democratic and Republican shares per election, smoothed so every county's volume equals its
   votes (Tobler's pycnophylactic interpolation). Height = k x votes per cell / cell area, the same k as
   the exact-county view; colour = margin or swing through app.js's equal-lightness ramp, blended across
   cells; shading from the surface's own slope; contour lines at 10, 100, 1,000 and 10,000 votes per
   square mile. Exposes window.VTTerrain for app.js. */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const GROUND = new THREE.Color('#E8ECEC');

async function bin(url, Type) { return new Type(await (await fetch(url)).arrayBuffer()); }

async function init({ container, geo, ramp, onHover, labels = [], locator = null }) {
  const H = await (await fetch('terrain.json')).json();
  const [owner, cells] = await Promise.all([bin('terrain-counties.bin', Uint16Array), bin('terrain-cells.bin', Uint32Array)]);
  const { cols, rows, cell: CELL, x0, yTop, land: L, k, sqmiPerUnit2, fips } = H;
  const N = cols * rows, cellArea = CELL * CELL;
  // One file per election and smoothing setting, fetched the first time that election is shown.
  const grids = {};                                      // "election@setting" -> Uint16Array
  const loadGrid = async (e, s) => (grids[`${e}@${s}`] ??= await bin(H.elections[e].file[s], Uint16Array));

  // Grid-cell index -> land index (-1 = sea)
  const landOf = new Int32Array(N).fill(-1);
  // State of each land cell, for the electoral and Senate weight views.
  const cellSt = Array.from(cells, (g, j) => { const f = fips[owner[j] - 1]; return geo.meta[f] ? geo.meta[f].st : ''; });
  cells.forEach((g, j) => (landOf[g] = j));

  // ---------- mesh: a vertex per grid cell centre, quads where any corner is land ----------
  const pos = new Float32Array(N * 3), val = new Float32Array(N), nod = new Float32Array(N), dens = new Float32Array(N), sea = new Float32Array(N);
  const nrm = new Float32Array(N * 3).fill(0); for (let g = 0; g < N; g++) nrm[g * 3 + 2] = 1;   // smooth per-vertex normals
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const g = r * cols + c;
    pos[g * 3] = x0 + (c + 0.5) * CELL; pos[g * 3 + 1] = yTop - (r + 0.5) * CELL; pos[g * 3 + 2] = 0;
    sea[g] = landOf[g] < 0 ? 1 : 0;
  }
  const idx = [];
  for (let r = 0; r < rows - 1; r++) for (let c = 0; c < cols - 1; c++) {
    const a = r * cols + c, b = a + 1, d = a + cols, e = d + 1;
    if (sea[a] && sea[b] && sea[d] && sea[e]) continue;
    idx.push(a, d, b, b, d, e);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geom.setAttribute('aVal', new THREE.BufferAttribute(val, 1));
  geom.setAttribute('aNo', new THREE.BufferAttribute(nod, 1));
  geom.setAttribute('aDens', new THREE.BufferAttribute(dens, 1));
  geom.setAttribute('aSea', new THREE.BufferAttribute(sea, 1));
  geom.setAttribute('aNorm', new THREE.BufferAttribute(nrm, 3));
  const hiAttr = new Float32Array(N).fill(1);            // 1 = in the highlighted states (or no highlight)
  geom.setAttribute('aHi', new THREE.BufferAttribute(hiAttr, 1));
  geom.setIndex(idx);

  const rampTex = new THREE.DataTexture(ramp.data, ramp.size, 1, THREE.RGBAFormat);
  rampTex.colorSpace = THREE.SRGBColorSpace; rampTex.magFilter = rampTex.minFilter = THREE.LinearFilter; rampTex.needsUpdate = true;
  const light = new THREE.Vector3(-0.55, 0.85, 1.25).normalize();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uRamp: { value: rampTex }, uMax: { value: 70 }, uLight: { value: light },
      uGround: { value: GROUND.clone().convertSRGBToLinear() }, uNoData: { value: new THREE.Color('#EEF1F1').convertSRGBToLinear() },
      uInk: { value: new THREE.Color('#23306B').convertSRGBToLinear() }, uContours: { value: 1 }, uMinLevel: { value: 1.95 }, uHiOn: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute float aVal; attribute float aNo; attribute float aDens; attribute float aSea; attribute vec3 aNorm; attribute float aHi;
      varying vec3 vPos; varying float vVal; varying float vNo; varying float vDens; varying float vSea; varying vec3 vNorm; varying float vHi;
      void main() {
        vPos = position; vVal = aVal; vNo = aNo; vDens = aDens; vSea = aSea; vNorm = aNorm; vHi = aHi;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uRamp; uniform float uMax; uniform vec3 uLight; uniform vec3 uGround; uniform vec3 uNoData;
      uniform vec3 uInk; uniform float uContours; uniform float uMinLevel; uniform float uHiOn;
      varying vec3 vPos; varying float vVal; varying float vNo; varying float vDens; varying float vSea; varying vec3 vNorm; varying float vHi;
      void main() {
        vec3 base = vNo > 0.5 ? uNoData : texture2D(uRamp, vec2(clamp(vVal / uMax * 0.5 + 0.5, 0.0, 1.0), 0.5)).rgb;
        // Smooth normals from the height field (not per-facet), so peaks read as rounded hills.
        vec3 n = normalize(vNorm);
        // Gentle light: flat ground shows its true colour; slopes shift only slightly, so a blue mountain
        // stays blue. Colour carries the margin; the light only describes the shape.
        float shade = clamp(1.0 + 0.32 * (dot(n, uLight) - uLight.z), 0.82, 1.08);
        vec3 col = base * shade;
        // Contour lines at whole powers of ten of votes per square mile (10 to 10,000).
        float fw = max(fwidth(vDens), 1e-4);
        float dist = abs(fract(vDens + 0.5) - 0.5);
        float line = (1.0 - smoothstep(0.0, fw * 1.4, dist)) * step(uMinLevel, vDens) * step(vDens, 4.05) * uContours;
        // No contours along the coast (sea cells carry no density) or where there is no race.
        line *= (1.0 - smoothstep(0.0, 0.04, vSea)) * (1.0 - vNo);
        col = mix(col, uInk, line * 0.5);
        // Highlighted states keep their colour; the rest of the country fades toward the page.
        if (uHiOn > 0.5) col = mix(col, uGround, 0.65 * (1.0 - clamp(vHi, 0.0, 1.0)));   // unselected places at about a third of their colour
        // The coast is cut, not painted: past the halfway line between land and sea cells nothing is drawn,
        // so the shoreline follows a smooth line through the grid and the page background shows beyond it.
        if (vSea > 0.5) discard;
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  material.polygonOffset = true; material.polygonOffsetFactor = 1; material.polygonOffsetUnits = 1;   // draped lines draw on top
  const mesh = new THREE.Mesh(geom, material);

  // ---------- scene, camera, controls ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
  renderer.setClearColor(GROUND);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(mesh);
  const outline = new THREE.Group(); scene.add(outline);

  // ---------- draped lines: state borders on the surface, and the ghost of the previous election ----------
  // State borders: county edges shared by two counties in different states (coastlines are left out).
  const stateSegs = (() => {
    const seen = new Map(), key = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
    for (const pc of geo.pieces) {
      const st = geo.meta[pc.f] && geo.meta[pc.f].st; if (!st) continue;
      for (const ring of (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p])) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], ka = key(a), kb = key(b); if (ka === kb) continue;
        const kk = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = seen.get(kk);
        if (e) { if (e.st !== st) e.border = true; } else seen.set(kk, { a, b, st, border: false });
      }
    }
    const out = [];
    for (const e of seen.values()) if (e.border) {             // split long edges so they follow the surface
      const n = Math.max(1, Math.ceil(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / CELL));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        out.push(e.a[0] + (e.b[0] - e.a[0]) * t0, e.a[1] + (e.b[1] - e.a[1]) * t0, e.a[0] + (e.b[0] - e.a[0]) * t1, e.a[1] + (e.b[1] - e.a[1]) * t1);
      }
    }
    return Float32Array.from(out);
  })();
  // Height of a surface grid Z at a map point, interpolated between the cell centres the mesh uses.
  const sampleZ = (Z, x, y) => {
    const fx = (x - x0) / CELL - 0.5, fy = (yTop - y) / CELL - 0.5, c = Math.floor(fx), r = Math.floor(fy), tx = fx - c, ty = fy - r;
    const at = (rr, cc) => (rr < 0 || cc < 0 || rr >= rows || cc >= cols ? 0 : Z[rr * cols + cc]);
    return (at(r, c) * (1 - tx) + at(r, c + 1) * tx) * (1 - ty) + (at(r + 1, c) * (1 - tx) + at(r + 1, c + 1) * tx) * ty;
  };
  const lineSet = (n, opacity, onTop = false) => {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    const m = new THREE.LineBasicMaterial({ color: 0x23306b, transparent: true, opacity, depthWrite: false, depthTest: !onTop });
    const l = new THREE.LineSegments(g, m); l.frustumCulled = false; if (onTop) l.renderOrder = 2; scene.add(l); return l;
  };
  const drape = (line, Z, lift) => {
    const P = line.geometry.attributes.position.array;
    for (let i = 0, s4 = 0; s4 < stateSegs.length; s4 += 4, i += 6) {
      const xa = stateSegs[s4], ya = stateSegs[s4 + 1], xb = stateSegs[s4 + 2], yb = stateSegs[s4 + 3];
      P[i] = xa; P[i + 1] = ya; P[i + 2] = sampleZ(Z, xa, ya) + lift; P[i + 3] = xb; P[i + 4] = yb; P[i + 5] = sampleZ(Z, xb, yb) + lift;
    }
    line.geometry.attributes.position.needsUpdate = true;
  };
  const stateLines = lineSet(stateSegs.length / 2, 0.34);
  const drapeSegs = (line, segs, Z, lift) => {
    const P = line.geometry.attributes.position.array;
    for (let i = 0, s4 = 0; s4 < segs.length; s4 += 4, i += 6) {
      P[i] = segs[s4]; P[i + 1] = segs[s4 + 1]; P[i + 2] = sampleZ(Z, segs[s4], segs[s4 + 1]) + lift;
      P[i + 3] = segs[s4 + 2]; P[i + 4] = segs[s4 + 3]; P[i + 5] = sampleZ(Z, segs[s4 + 2], segs[s4 + 3]) + lift;
    }
    line.geometry.attributes.position.needsUpdate = true;
  };
  // Highlight: the outline of a set of states (county edges not shared inside the set, coast included),
  // drawn in full ink on top of the surface.
  let hiSegs = null, hiLine = null;
  function outlineOf(states) {
    const set = new Set(states), seen = new Map(), key = (q) => q[0].toFixed(1) + ',' + q[1].toFixed(1);
    for (const pc of geo.pieces) {
      const st = geo.meta[pc.f] && geo.meta[pc.f].st; if (!set.has(st)) continue;
      for (const ring of (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p])) for (let i = 0; i < ring.length; i++) {
        const a = ring[i], b = ring[(i + 1) % ring.length], ka = key(a), kb = key(b); if (ka === kb) continue;
        const kk = ka < kb ? ka + '|' + kb : kb + '|' + ka, e = seen.get(kk);
        if (e) e.n++; else seen.set(kk, { a, b, n: 1 });   // an edge used twice inside the set is internal
      }
    }
    const out = [];
    for (const e of seen.values()) if (e.n === 1) {
      const n = Math.max(1, Math.ceil(Math.hypot(e.b[0] - e.a[0], e.b[1] - e.a[1]) / CELL));
      for (let i = 0; i < n; i++) {
        const t0 = i / n, t1 = (i + 1) / n;
        out.push(e.a[0] + (e.b[0] - e.a[0]) * t0, e.a[1] + (e.b[1] - e.a[1]) * t0, e.a[0] + (e.b[0] - e.a[0]) * t1, e.a[1] + (e.b[1] - e.a[1]) * t1);
      }
    }
    return Float32Array.from(out);
  }

  // Ghost: every eighth grid row and column of the previous election's surface (about 50 miles apart), plus its state borders.
  // The part in front of the current land is drawn firmly; the part buried under it, faintly, so rises
  // and falls both show as the gap between the two.
  const ghostPairs = [];
  for (let r = 0; r < rows; r += 8) for (let c = 0; c < cols - 1; c++) { const g = r * cols + c; if (landOf[g] >= 0 && landOf[g + 1] >= 0) ghostPairs.push(g, g + 1); }
  for (let c = 0; c < cols; c += 8) for (let r = 0; r < rows - 1; r++) { const g = r * cols + c; if (landOf[g] >= 0 && landOf[g + cols] >= 0) ghostPairs.push(g, g + cols); }
  const ghostGrid = lineSet(ghostPairs.length, 0.34), ghostGridHidden = lineSet(ghostPairs.length, 0.08, true);
  ghostGridHidden.geometry = ghostGrid.geometry;
  const ghostStates = lineSet(stateSegs.length / 2, 0.22), ghostStatesHidden = lineSet(stateSegs.length / 2, 0.06, true);
  ghostStatesHidden.geometry = ghostStates.geometry;
  const ghostLines = [ghostGrid, ghostGridHidden, ghostStates, ghostStatesHidden];
  const showGhost = (on) => ghostLines.forEach((l) => (l.visible = on));
  showGhost(false);
  // Only where both elections have a result: a segment touching a cell without one collapses to a point.
  function setGhost(Z, noBase, noCur) {
    const P = ghostGrid.geometry.attributes.position.array;
    for (let i = 0; i < ghostPairs.length; i += 2) {
      const ga = ghostPairs[i], gb = ghostPairs[i + 1], skip = noBase[ga] || noBase[gb] || noCur[ga] || noCur[gb];
      for (const [k2, g] of [[i, ga], [i + 1, skip ? ga : gb]]) {
        const c = g % cols, r = (g - c) / cols;
        P[k2 * 3] = x0 + (c + 0.5) * CELL; P[k2 * 3 + 1] = yTop - (r + 0.5) * CELL; P[k2 * 3 + 2] = Z[g] + 0.3;
      }
    }
    ghostGrid.geometry.attributes.position.needsUpdate = true;
    drape(ghostStates, Z, 0.3);
  }
  const camera = new THREE.PerspectiveCamera(40, 1, 1, 20000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.screenSpacePanning = false;                  // pan along the map, not the screen
  controls.mouseButtons = { LEFT: THREE.MOUSE.PAN, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };   // shift-drag rotates
  controls.touches = { ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE };
  controls.enableDamping = !reduced; controls.dampingFactor = 0.12;
  controls.minPolarAngle = THREE.MathUtils.degToRad(0.5);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(82);          // never lower than 8 degrees above the map
  controls.minDistance = 40; controls.maxDistance = 4000;
  controls.minAzimuthAngle = -Infinity;                         // turn all the way round; azimuth 0 = looking north
  controls.maxAzimuthAngle = Infinity;
  controls.zoomSpeed = 0.8;

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize); resize();

  // ---------- state -> arrays ----------
  let setting = H.defaultSetting, cur = null, flat = false;
  const zCur = new Float32Array(N);                      // current heights, also used for hover
  const decode = (s, e) => {
    const g = grids[`${e}@${s}`], o = 0, sc = H.elections[e].scale[s];
    return { T: g.subarray(o, o + L), D: g.subarray(o + L, o + 2 * L), R: g.subarray(o + 2 * L, o + 3 * L), sc };
  };
  function target(st, base) {
    const z = new Float32Array(N), v = new Float32Array(N), no = new Float32Array(N), de = new Float32Array(N).fill(-3);
    const a = decode(setting, st.e), b = base ? decode(setting, base) : null;
    const share = H.share, NODATA = H.nodata;
    const cv = {};                                         // county index -> its total of the chosen votes
    for (let j = 0; j < L; j++) {
      const g = cells[j], t = (a.T[j] * a.sc) ** 2;
      if (a.D[j] === NODATA) { no[g] = 1; continue; }
      const d = t * a.D[j] / share, r = t * a.R[j] / share;
      // Weighted views: total votes times the state's power per vote relative to the national average.
      // Net margin: signed, so the chosen party's wins rise and the other's sink below ground.
      const votes = st.weights ? t * (st.weights[cellSt[j]] || 0) : st.h === 'net' ? (d - r) * (st.u === 'r' ? -1 : 1)
        : st.h === 'dem' ? d : st.h === 'rep' ? r : t;
      z[g] = flat ? 0 : k * votes / cellArea;
      if (st.n === 'county') cv[owner[j]] = (cv[owner[j]] || 0) + votes;   // county totals for the per-county scale
      de[g] = Math.log10(Math.max(Math.abs(votes) / (cellArea * sqmiPerUnit2), 1e-3));
      const m = t > 0 ? (d - r) / t * 100 : 0;
      if (st.mode === 'swing' && b) {
        if (b.D[j] === NODATA) { no[g] = 1; continue; }
        v[g] = m - (b.D[j] - b.R[j]) / share * 100;
      } else v[g] = m;
    }
    // Per county: every cell of a county stands at that county's own total (votes, or net margin), not its
    // votes per square mile; a few smoothing passes over land blend neighbouring counties. Volume no longer
    // equals votes in this scale.
    if (st.n === 'county' && !flat) {
      for (let j = 0; j < L; j++) { const g = cells[j]; z[g] = no[g] ? 0 : st.kc * (cv[owner[j]] || 0); }
      const tmp = new Float32Array(N);
      for (let pass = 0; pass < 3; pass++) {
        tmp.set(z);
        for (let j = 0; j < L; j++) {
          const g = cells[j], c = g % cols; let sum = tmp[g], n = 1;
          for (const h of [c > 0 ? g - 1 : -1, c < cols - 1 ? g + 1 : -1, g - cols, g + cols]) {
            if (h >= 0 && h < N && landOf[h] >= 0) { sum += tmp[h]; n++; }
          }
          z[g] = sum / n;
        }
      }
    }
    return { z, v, no, de };
  }
  // Central differences on the height grid; row r+1 lies south (lower y).
  function computeNormals() {
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const g = r * cols + c;
      const zl = zCur[c > 0 ? g - 1 : g], zr = zCur[c < cols - 1 ? g + 1 : g];
      const zn = zCur[r > 0 ? g - cols : g], zs = zCur[r < rows - 1 ? g + cols : g];
      const dx = (zr - zl) / (2 * CELL), dy = (zn - zs) / (2 * CELL);
      const inv = 1 / Math.hypot(dx, dy, 1);
      nrm[g * 3] = -dx * inv; nrm[g * 3 + 1] = -dy * inv; nrm[g * 3 + 2] = inv;
    }
  }
  let anim = null;
  function apply(next, animate) {
    const from = { z: zCur.slice(), v: val.slice(), de: dens.slice() };
    const dur = animate && !reduced ? 800 : 0, t0 = performance.now();
    const step = (now) => {
      const u = dur ? Math.min(1, (now - t0) / dur) : 1, e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      for (let g = 0; g < N; g++) {
        zCur[g] = from.z[g] + (next.z[g] - from.z[g]) * e;
        pos[g * 3 + 2] = zCur[g];
        val[g] = from.v[g] + (next.v[g] - from.v[g]) * e;
        dens[g] = from.de[g] + (next.de[g] - from.de[g]) * e;
      }
      if (u >= 0.5 || !dur) nod.set(next.no);
      computeNormals();
      drape(stateLines, zCur, 0.4);
      if (hiSegs) drapeSegs(hiLine, hiSegs, zCur, 0.9);
      for (const name of ['position', 'aVal', 'aDens', 'aNo', 'aNorm']) geom.attributes[name].needsUpdate = true;
      geom.computeBoundingSphere();
      if (u < 1) anim = requestAnimationFrame(step); else anim = null;
    };
    cancelAnimationFrame(anim); anim = requestAnimationFrame(step);
  }

  // ---------- camera presets ----------
  function cameraFor(name, presets, side) {
    const W = container.clientWidth, Hh = container.clientHeight, fov = THREE.MathUtils.degToRad(camera.fov);
    let tx, ty, dist, polar, az = 0;
    if (name === 'west' || name === 'east') {
      // Across the country at a low angle: heights read as a skyline. Fit the north-south extent,
      // which is what spans the screen when looking along the east-west axis.
      tx = (x0 + (x0 + cols * CELL)) / 2; ty = (yTop + (yTop - rows * CELL)) / 2;
      const usable = Math.max(320, W - side.left - side.right) / W;
      const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
      dist = (rows * CELL * 0.5) / Math.tan(hfov / 2) / usable * 0.98; polar = 78;
      az = name === 'west' ? -90 : 90;                   // camera west of the map looking east, or the reverse
      tx += (name === 'west' ? 1 : -1) * cols * CELL * 0.08;   // aim a little past centre so the near coast stays in frame
    } else if (name === 'national') {
      tx = (x0 + (x0 + cols * CELL)) / 2; ty = (yTop + (yTop - rows * CELL)) / 2 + 20;
      const usable = Math.max(320, W - side.left - side.right) / W;
      const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
      dist = (cols * CELL * 0.5) / Math.tan(hfov / 2) / usable * 1.04; polar = 48;
      const unitsPerPx = 2 * dist * Math.tan(fov / 2) / Hh;
      tx -= (side.left - side.right) / 2 * unitsPerPx;
    } else {
      const p = presets[name], z = name === 'texas' ? 1.8 : 1.9;
      [tx, ty] = p.target; dist = (Hh / 2 ** z) / (2 * Math.tan(fov / 2)); polar = name === 'texas' ? 60 : 56;
    }
    if (flat) { polar = 0.5; az = 0; }
    return { target: new THREE.Vector3(tx, ty, 0), dist, polar: THREE.MathUtils.degToRad(polar), az: THREE.MathUtils.degToRad(az) };
  }
  let camAnim = null;
  function moveCamera(c, animate) {
    const sph0 = new THREE.Spherical().setFromVector3(camera.position.clone().sub(controls.target).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0))));
    const t0 = controls.target.clone(), dur = animate && !reduced ? 900 : 0, start = performance.now();
    const quat = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0)), inv = quat.clone().invert();
    // Turn the short way round to the preset's heading (0 = camera due south, looking north).
    let az = c.az; while (az - sph0.theta > Math.PI) az -= 2 * Math.PI; while (az - sph0.theta < -Math.PI) az += 2 * Math.PI;
    const step = (now) => {
      const u = dur ? Math.min(1, (now - start) / dur) : 1, e = u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2;
      const sph = new THREE.Spherical(sph0.radius + (c.dist - sph0.radius) * e, sph0.phi + (c.polar - sph0.phi) * e, sph0.theta + (az - sph0.theta) * e);
      controls.target.lerpVectors(t0, c.target, e);
      camera.position.copy(new THREE.Vector3().setFromSpherical(sph).applyQuaternion(inv).add(controls.target));
      camera.lookAt(controls.target);
      if (u < 1) camAnim = requestAnimationFrame(step);
      else camAnim = null;
    };
    cancelAnimationFrame(camAnim);
    if (dur) camAnim = requestAnimationFrame(step); else step(performance.now());
  }

  // ---------- hover: march the pointer's ray down onto the height field ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const ownerAt = (x, y) => {
    const c = Math.floor((x - x0) / CELL), r = Math.floor((yTop - y) / CELL);
    if (c < 0 || r < 0 || c >= cols || r >= rows) return -1;
    return r * cols + c;
  };
  function pick(clientX, clientY) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const o = ray.ray.origin, d = ray.ray.direction;
    if (d.z >= 0) return null;
    const zTop = 300, tA = Math.max(0, (zTop - o.z) / d.z), tB = (-300 - o.z) / d.z;   // valleys go below ground
    const steps = 600;
    for (let i = 0; i <= steps; i++) {
      const t = tA + (tB - tA) * (i / steps), x = o.x + d.x * t, y = o.y + d.y * t, z = o.z + d.z * t;
      const g = ownerAt(x, y); if (g < 0) continue;
      if (z <= zCur[g] + 0.01) { const j = landOf[g]; return j < 0 ? null : fips[owner[j] - 1]; }
    }
    return null;
  }
  const heightAt = (x, y) => { const g = ownerAt(x, y); return g < 0 ? 0 : zCur[g]; };
  function drawOutline(f) {
    outline.clear();
    if (!f) return;
    const mat = new THREE.LineBasicMaterial({ color: 0x23306b, transparent: true, opacity: 0.9 });
    for (const pc of geo.pieces) if (pc.f === f) for (const ring of (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p])) {
      const pts = ring.map(([x, y]) => new THREE.Vector3(x, y, heightAt(x, y) + 0.8));
      pts.push(pts[0].clone());
      outline.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
    }
  }
  let hovered = null, pending = null, pinned = null;   // pinned: the tour's current stop
  renderer.domElement.addEventListener('pointermove', (ev) => {
    if (ev.buttons) return;
    pending = ev;
    requestAnimationFrame(() => {
      if (!pending) return;
      const f = pick(pending.clientX, pending.clientY), e2 = pending; pending = null;
      if (f !== hovered) { hovered = f; drawOutline(f || pinned); }
      onHover(f, e2.clientX, e2.clientY);
    });
  });
  renderer.domElement.addEventListener('pointerleave', () => { hovered = null; drawOutline(pinned); onHover(null); });

  // The 10-votes-per-square-mile contour rings every small town: show it only well inside the national view.
  let natDist = null;

  // ---------- motion: a slow spin on first visit, and a fly-over tour; any touch stops both ----------
  const UP = new THREE.Quaternion().setFromUnitVectors(camera.up, new THREE.Vector3(0, 1, 0)), UPINV = UP.clone().invert();
  const placeCamera = (tgt, dist, polar, az) => {
    controls.target.copy(tgt);
    camera.position.copy(new THREE.Vector3().setFromSpherical(new THREE.Spherical(dist, polar, az)).applyQuaternion(UPINV).add(tgt));
    camera.lookAt(tgt);
  };
  const centroidOf = (f) => {
    let sx = 0, sy = 0, n = 0;
    for (const pc of geo.pieces) if (pc.f === f) for (const q of (Array.isArray(pc.p[0][0]) ? pc.p[0] : pc.p)) { sx += q[0]; sy += q[1]; n++; }
    return n ? new THREE.Vector3(sx / n, sy / n, 0) : null;
  };
  let motion = null, onMotionEnd = null, lastT = performance.now();
  const stopMotion = () => { if (!motion) return; motion = null; controls.enabled = true; const cb = onMotionEnd; onMotionEnd = null; if (cb) cb(); };
  for (const ev of ['pointerdown', 'wheel', 'touchstart']) renderer.domElement.addEventListener(ev, stopMotion, { passive: true });
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) ** 2 / 2);
  function stepMotion(now) {
    const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
    if (!motion) return;
    if (motion.kind === 'spin') {                       // one turn every two minutes around the current target
      const off = camera.position.clone().sub(controls.target).applyQuaternion(UP), sph = new THREE.Spherical().setFromVector3(off);
      placeCamera(controls.target.clone(), sph.radius, sph.phi, sph.theta + dt * 2 * Math.PI / 120);
      return;
    }
    // Tour: travel 5 s to each stop, hold 2.5 s; heading follows the direction of travel.
    const MOVE = 5000, HOLD = 2500, k2 = motion.keys, t = now - motion.t0, leg = Math.floor(t / (MOVE + HOLD));
    if (leg >= k2.length - 1) { stopMotion(); return; }
    const a = k2[leg], b = k2[leg + 1], u = Math.min(1, (t - leg * (MOVE + HOLD)) / MOVE), e = ease(u);
    if (u >= 1 && motion.shown !== leg + 1) { motion.shown = leg + 1; if (motion.onStop) motion.onStop(b.f); }
    const tgt = a.p.clone().lerp(b.p, e), lift = Math.sin(Math.PI * u) * 0.35;   // rise between stops, settle on arrival
    let daz = b.az - a.az; while (daz > Math.PI) daz -= 2 * Math.PI; while (daz < -Math.PI) daz += 2 * Math.PI;
    placeCamera(tgt, (a.d + (b.d - a.d) * e) * (1 + lift), a.polar + (b.polar - a.polar) * e, a.az + daz * e);
  }
  // ---------- metro labels: screen-space, tracking the top of each county's peak ----------
  const labelBox = document.createElement('div'); labelBox.className = 'peak-labels'; document.body.appendChild(labelBox);
  const fipsIdx = new Map(fips.map((f, i) => [f, i + 1]));
  const peaks = labels.map((lb) => {
    const idx = fipsIdx.get(lb.f), cl = [];
    for (let j = 0; j < L; j++) if (owner[j] === idx) cl.push(cells[j]);
    const el = document.createElement('div'); el.className = 'peak'; el.textContent = lb.name; labelBox.appendChild(el);
    return { ...lb, cells: cl, el };
  }).filter((p) => p.cells.length);
  let obstacles = [], frame = 0;
  const v3 = new THREE.Vector3();
  function placeLabels() {
    if (labelBox.style.display === 'none') return;
    if (frame % 30 === 0) obstacles = [...document.querySelectorAll('.panel, .key, .bop, .timeline, #locator, .tour-caption')]
      .filter((e) => !e.hidden && e.getClientRects().length).map((e) => e.getBoundingClientRect());   // fixed panels have no offsetParent
    const W = renderer.domElement.clientWidth, Hh = renderer.domElement.clientHeight, placed = [];
    for (const p of peaks) {
      let best = p.cells[0]; for (const g of p.cells) if (zCur[g] > zCur[best]) best = g;
      const c = best % cols, r = (best - c) / cols;
      v3.set(x0 + (c + 0.5) * CELL, yTop - (r + 0.5) * CELL, Math.max(0, zCur[best]) + 2).project(camera);
      const x = (v3.x + 1) / 2 * W, y = (1 - v3.y) / 2 * Hh;
      let show = v3.z < 1 && x > 0 && x < W && y > 0 && y < Hh;
      const w = p.el.offsetWidth || 80, h = p.el.offsetHeight || 18, box = { left: x - w / 2, right: x + w / 2, top: y - h - 9, bottom: y };
      const hit = (b) => b.left < box.right && box.left < b.right && b.top < box.bottom && box.top < b.bottom;
      if (show && (box.left < 4 || box.right > W - 4 || box.top < 4 || obstacles.some(hit) || placed.some(hit))) show = false;   // whole label on screen
      if (show) { placed.push(box); p.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, calc(-100% - 8px))`; }
      p.el.style.visibility = show ? 'visible' : 'hidden';
    }
  }

  // ---------- locator: the land from above, with the ground the camera sees ----------
  let loc = null;
  if (locator) {
    const lc = document.createElement('canvas'); lc.width = cols; lc.height = rows;
    const lx = lc.getContext('2d'), img = lx.createImageData(cols, rows);
    for (const g of cells) img.data.set([35, 48, 107, 70], g * 4);
    lx.putImageData(img, 0, 0);
    loc = { el: locator, ctx: locator.getContext('2d'), land: lc };
    const toWorld = (ev) => {
      const r = locator.getBoundingClientRect();
      return new THREE.Vector3(x0 + (ev.clientX - r.left) / r.width * cols * CELL, yTop - (ev.clientY - r.top) / r.height * rows * CELL, 0);
    };
    locator.addEventListener('click', (ev) => {
      stopMotion();
      const off = camera.position.clone().sub(controls.target).applyQuaternion(UP), sph = new THREE.Spherical().setFromVector3(off);
      moveCamera({ target: toWorld(ev), dist: sph.radius, polar: sph.phi, az: sph.theta }, true);
    });
  }
  const groundHit = new THREE.Raycaster();
  function drawLocator() {
    if (!loc || loc.el.style.display === 'none') return;
    const cw = loc.el.clientWidth, ch = loc.el.clientHeight, dpr = Math.min(2, window.devicePixelRatio || 1);
    if (loc.el.width !== cw * dpr) { loc.el.width = cw * dpr; loc.el.height = ch * dpr; }
    const ctx = loc.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true; ctx.drawImage(loc.land, 0, 0, cw, ch);
    const toC = (p) => [(p.x - x0) / (cols * CELL) * cw, (yTop - p.y) / (rows * CELL) * ch];
    // Where the corners and edges of the screen meet the ground (capped toward the horizon).
    const pts = [];
    for (const [nx, ny] of [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]]) {
      groundHit.setFromCamera(new THREE.Vector2(nx, ny), camera);
      const o = groundHit.ray.origin, d = groundHit.ray.direction;
      const t = d.z < -1e-4 ? Math.min(-o.z / d.z, 1600) : 1600;
      pts.push(toC(new THREE.Vector3(o.x + d.x * t, o.y + d.y * t, 0)));
    }
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath();
    ctx.fillStyle = 'rgba(35,48,107,0.16)'; ctx.fill(); ctx.strokeStyle = 'rgba(35,48,107,0.8)'; ctx.lineWidth = 1; ctx.stroke();
    const [cx, cy] = toC(camera.position);
    ctx.beginPath(); ctx.arc(Math.max(3, Math.min(cw - 3, cx)), Math.max(3, Math.min(ch - 3, cy)), 3, 0, 2 * Math.PI); ctx.fillStyle = '#23306B'; ctx.fill();
  }

  (function loop() {
    requestAnimationFrame(loop); frame++;
    placeLabels(); if (frame % 2 === 0) drawLocator();
    if (motion) stepMotion(performance.now()); else { lastT = performance.now(); controls.update(); }
    if (natDist) material.uniforms.uMinLevel.value = camera.position.distanceTo(controls.target) < natDist * 0.42 ? 0.95 : 1.95;
    renderer.render(scene, camera);
  })();

  return {
    async setState(st, { animate = true, base = null } = {}) {
      if (st.m && Number(st.m) !== setting && H.settings.includes(Number(st.m))) setting = Number(st.m);
      await Promise.all([loadGrid(st.e, setting), base ? loadGrid(base, setting) : null]);
      flat = st.d === '2d';
      material.uniforms.uMax.value = st.mode === 'swing' ? 26 : 70;
      material.uniforms.uContours.value = st.n === 'county' ? 0 : 1;   // contours are votes per square mile
      const next = target(st, base);
      cur = st; apply(next, animate);
      // Ghost: the baseline election's surface in the same height mode (weights of the baseline election).
      const ghostOn = st.g === '1' && base && !flat;
      if (ghostOn) { const gt = target({ ...st, e: base, mode: 'margin', weights: st.baseWeights || st.weights }, null); setGhost(gt.z, gt.no, next.no); }
      showGhost(!!ghostOn);
      drawOutline(hovered || pinned);
    },
    // Highlight the reader's selection: whole states are outlined; selected counties keep full colour and the
    // rest fade toward the ground; with fly, the camera frames them from a low angle.
    highlight(states, { fly = true, counties = null } = {}) {
      if (hiLine) { scene.remove(hiLine); hiLine.geometry.dispose(); hiLine = null; hiSegs = null; }
      if ((!states || !states.length) && (!counties || !counties.size)) { hiAttr.fill(1); material.uniforms.uHiOn.value = 0; geom.attributes.aHi.needsUpdate = true; return; }
      const set = new Set(states || []);
      const inSel = counties && counties.size ? (j) => counties.has(fips[owner[j] - 1]) : (j) => set.has(cellSt[j]);
      hiAttr.fill(0);
      let x0b = Infinity, x1b = -Infinity, y0b = Infinity, y1b = -Infinity;
      for (let j = 0; j < L; j++) if (inSel(j)) {
        const g = cells[j]; hiAttr[g] = 1;
        const x = pos[g * 3], y = pos[g * 3 + 1];
        x0b = Math.min(x0b, x); x1b = Math.max(x1b, x); y0b = Math.min(y0b, y); y1b = Math.max(y1b, y);
      }
      geom.attributes.aHi.needsUpdate = true; material.uniforms.uHiOn.value = 1;
      if (states && states.length) {
        hiSegs = outlineOf(states);
        hiLine = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(hiSegs.length / 2 * 3), 3)),
          new THREE.LineBasicMaterial({ color: 0x23306b, transparent: true, opacity: 0.95, depthWrite: false }));
        hiLine.frustumCulled = false; hiLine.renderOrder = 3; scene.add(hiLine);
        drapeSegs(hiLine, hiSegs, zCur, 0.9);
      }
      if (fly && isFinite(x0b)) {
        stopMotion();
        const fov = THREE.MathUtils.degToRad(camera.fov), span = Math.max(x1b - x0b, (y1b - y0b) * camera.aspect) * 1.35 + 40;
        const hfov = 2 * Math.atan(Math.tan(fov / 2) * camera.aspect);
        moveCamera({ target: new THREE.Vector3((x0b + x1b) / 2, (y0b + y1b) / 2 - 0.08 * (y1b - y0b), 0), dist: span / 2 / Math.tan(hfov / 2) * 1.9,
          polar: THREE.MathUtils.degToRad(64), az: 0 }, true);
      }
    },
    view(name, presets, side, animate = true) {
      natDist = cameraFor('national', presets, side).dist;
      moveCamera(cameraFor(name, presets, side), animate);
    },
    show(on) {
      renderer.domElement.style.display = labelBox.style.display = on ? 'block' : 'none';
      if (loc) loc.el.style.display = on ? 'block' : 'none';
      if (on) resize();
    },
    pin(f) { pinned = f || null; drawOutline(hovered || pinned); },
    spin(onEnd) { if (reduced) return; stopMotion(); motion = { kind: 'spin' }; onMotionEnd = onEnd; },
    // stops: [{ f: county FIPS }]; the camera looks along the direction of travel from a low angle.
    tour(stops, { onStop, onEnd } = {}) {
      stopMotion();
      const pts = stops.map((s) => ({ ...s, p: centroidOf(s.f) })).filter((s) => s.p);
      if (pts.length < 2) return;
      const W = container.clientHeight, fov = THREE.MathUtils.degToRad(camera.fov), dist = (W / 2 ** 1.6) / (2 * Math.tan(fov / 2));
      const keys = pts.map((s, i) => {
        const nxt = pts[Math.min(i + 1, pts.length - 1)], prv = pts[Math.max(i - 1, 0)];
        const dir = nxt.p.clone().sub(prv.p);              // heading: from the previous stop toward the next
        // Camera behind the stop, looking along the direction of travel.
        return { f: s.f, p: s.p, d: dist, polar: THREE.MathUtils.degToRad(66), az: Math.atan2(-dir.x, dir.y) };
      });
      // Start from wherever the camera is now.
      const off = camera.position.clone().sub(controls.target).applyQuaternion(UP), sph = new THREE.Spherical().setFromVector3(off);
      keys.unshift({ f: null, p: controls.target.clone(), d: sph.radius, polar: sph.phi, az: sph.theta });
      motion = { kind: 'tour', keys, t0: performance.now(), onStop, shown: 0 }; onMotionEnd = onEnd; controls.enabled = false;
      if (reduced) { const last = keys[keys.length - 1]; stopMotion(); placeCamera(last.p, last.d, last.polar, last.az); }
    },
    stopMotion,
    settings: H.settings,
    pick, camera, controls,                                   // for checks
  };
}

window.VTTerrain = { init };
window.dispatchEvent(new Event('vt-terrain-ready'));
