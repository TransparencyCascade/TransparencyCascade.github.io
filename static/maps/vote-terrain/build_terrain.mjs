#!/usr/bin/env node
// Smooth vote terrain: Tobler's pycnophylactic interpolation of county vote totals onto a grid.
//
//   node build_terrain.mjs
//
// Reads geometry.json (pre-projected AlbersUsa county polygons, from build_data.mjs) and elections.json
// (per county [total, Republican, Democratic]). Writes:
//   terrain.json            grid header, county order, per-election scales, the volume check
//   terrain-counties.bin    Uint16 county index for every land cell (1-based; order in terrain.json)
//   terrain-s<N>.bin        per election: total votes per land cell (Uint16, square-root coded) and the
//                           Democratic and Republican shares of that total (Uint16 each; 65535 = no data)
//
// Method (Tobler 1979): each county's votes start spread evenly over its cells; then, repeatedly,
// every land cell becomes the mean of itself and its four neighbours (sea counts as 0), and each
// county's cells are rescaled so they again sum exactly to its votes. Democratic, Republican and all
// other votes are smoothed separately and the total is their sum, so each county keeps every volume and
// a cell's shares always add up to at most its total. Snapshots are
// written for two smoothing settings. Alaska is left out (no county data).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CELL = 2;                              // projected units per cell (about 6 miles)
// Smoothing settings: smoothing passes between rescales. More iterations add little (the method converges
// well before 80), but more passes per rescale spread each county's votes further before the volume is
// restored, so the hills come out broader. Both keep every county's volume exact.
const SETTINGS = [1, 8];
const ITERATIONS = 80;
const SHARE = 65534, NODATA = 65535;          // share coding: 0..65534 of the cell's total; 65535 = no data
const geo = JSON.parse(fs.readFileSync(path.join(HERE, 'geometry.json'), 'utf8'));
const el = JSON.parse(fs.readFileSync(path.join(HERE, 'elections.json'), 'utf8'));
const ELECTIONS = [...el.order, 'senprior'];

// ---------- grid ----------
const pieces = geo.pieces.filter((pc) => !pc.f.startsWith('02'));
const ringsOf = (pc) => (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p]);
let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
for (const pc of pieces) for (const r of ringsOf(pc)) for (const [x, y] of r) {
  minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
}
const x0 = Math.floor(minX) - CELL, yTop = Math.ceil(maxY) + CELL;
const cols = Math.ceil((maxX + CELL - x0) / CELL), rows = Math.ceil((yTop - (minY - CELL)) / CELL);
const N = cols * rows;
const fipsList = [...new Set(pieces.map((p) => p.f))].sort();
const fipsIdx = new Map(fipsList.map((f, i) => [f, i + 1]));
const owner = new Uint16Array(N);            // 0 = sea

// Scanline fill, even-odd within each piece (so holes such as enclosed independent cities stay out).
for (const pc of pieces) {
  const rings = ringsOf(pc), id = fipsIdx.get(pc.f);
  let py0 = Infinity, py1 = -Infinity;
  for (const r of rings) for (const [, y] of r) { py0 = Math.min(py0, y); py1 = Math.max(py1, y); }
  const r0 = Math.max(0, Math.floor((yTop - py1) / CELL - 0.5)), r1 = Math.min(rows - 1, Math.ceil((yTop - py0) / CELL));
  for (let row = r0; row <= r1; row++) {
    const y = yTop - (row + 0.5) * CELL, xs = [];
    for (const r of rings) for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if ((a[1] <= y && b[1] > y) || (b[1] <= y && a[1] > y)) xs.push(a[0] + (y - a[1]) * (b[0] - a[0]) / (b[1] - a[1]));
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const c0 = Math.max(0, Math.ceil((xs[k] - x0) / CELL - 0.5)), c1 = Math.min(cols - 1, Math.floor((xs[k + 1] - x0) / CELL - 0.5));
      for (let c = c0; c <= c1; c++) owner[row * cols + c] = id;
    }
  }
}
// Counties too small to own a cell take the cell under their centroid.
const count = new Int32Array(fipsList.length + 1);
for (let i = 0; i < N; i++) count[owner[i]]++;
let stolen = 0;
for (const f of fipsList) {
  const id = fipsIdx.get(f);
  if (count[id]) continue;
  const ring = ringsOf(pieces.find((p) => p.f === f))[0];
  const cx = ring.reduce((s, q) => s + q[0], 0) / ring.length, cy = ring.reduce((s, q) => s + q[1], 0) / ring.length;
  const c = Math.min(cols - 1, Math.max(0, Math.floor((cx - x0) / CELL))), r = Math.min(rows - 1, Math.max(0, Math.floor((yTop - cy) / CELL)));
  // The centroid cell, or the nearest cell whose owner can spare it (two tiny cities can share a centroid cell).
  let i = -1;
  for (let rad = 0; rad <= 6 && i < 0; rad++) for (let dr = -rad; dr <= rad && i < 0; dr++) for (let dc = -rad; dc <= rad; dc++) {
    if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
    const rr = r + dr, cc = c + dc; if (rr < 0 || cc < 0 || rr >= rows || cc >= cols) continue;
    const g = rr * cols + cc;
    if (owner[g] && count[owner[g]] > 1) { i = g; break; }
  }
  if (i < 0) continue;
  count[owner[i]]--;
  owner[i] = id; count[id] = 1; stolen++;
}
for (let i = 0; i < count.length; i++) count[i] = 0;
for (let i = 0; i < N; i++) count[owner[i]]++;
const noCells = fipsList.filter((f) => !count[fipsIdx.get(f)]);

// Land cells, in grid order; neighbours as land-cell indices (-1 = sea or off the grid).
const landCells = [];
for (let i = 0; i < N; i++) if (owner[i]) landCells.push(i);
const L = landCells.length;
const landOf = new Int32Array(N).fill(-1);
landCells.forEach((g, j) => (landOf[g] = j));
const nb = new Int32Array(L * 4);
const cid = new Uint16Array(L);
landCells.forEach((g, j) => {
  const r = Math.floor(g / cols), c = g % cols;
  nb[j * 4] = c > 0 ? landOf[g - 1] : -1;
  nb[j * 4 + 1] = c < cols - 1 ? landOf[g + 1] : -1;
  nb[j * 4 + 2] = r > 0 ? landOf[g - cols] : -1;
  nb[j * 4 + 3] = r < rows - 1 ? landOf[g + cols] : -1;
  cid[j] = owner[g];
});
console.log(`grid ${cols} x ${rows} (${N} cells), ${L} land cells, ${fipsList.length} counties; ${stolen} given a centroid cell; ${noCells.length} with no cell`);

// ---------- pycnophylactic smoothing ----------
function smooth(target, settings) {              // target[id] = votes for county id (1-based); returns {passes: Float32Array}
  const out = {};
  for (const passes of settings) out[passes] = smoothOnce(target, passes);
  return out;
}
function smoothOnce(target, passes) {
  let v = new Float32Array(L), w = new Float32Array(L);
  for (let j = 0; j < L; j++) v[j] = target[cid[j]] / count[cid[j]];
  const sums = new Float64Array(fipsList.length + 1);
  for (let it = 1; it <= ITERATIONS; it++) {
    for (let p = 0; p < passes; p++) {
      for (let j = 0; j < L; j++) {
        let s = v[j];
        for (let k = 0; k < 4; k++) { const n = nb[j * 4 + k]; if (n >= 0) s += v[n]; }
        w[j] = s / 5;                             // sea and off-grid neighbours count as 0
      }
      [v, w] = [w, v];
    }
    sums.fill(0);
    for (let j = 0; j < L; j++) sums[cid[j]] += v[j];
    for (let j = 0; j < L; j++) {
      const id = cid[j], t = target[id];
      v[j] = t <= 0 ? 0 : sums[id] > 0 ? v[j] * (t / sums[id]) : t / count[id];
    }
  }
  return v;
}

// ---------- per election ----------
const header = {
  cell: CELL, cols, rows, x0, yTop, land: L, k: el.k, sqmiPerUnit2: 0, fips: fipsList, settings: SETTINGS,
  defaultSetting: SETTINGS[0], elections: {}, check: {},
};
// Square miles per projected unit squared, from the lower-48 counties (AlbersUsa is equal-area there).
let sa = 0, ss = 0;
for (const [f, m] of Object.entries(geo.meta)) if (!/^(02|15)/.test(f) && m.a > 0) { sa += m.a; ss += m.sqmi; }
header.sqmiPerUnit2 = ss / sa;

const blobs = Object.fromEntries(SETTINGS.map((s) => [s, []]));
let offset = 0;
for (const e of ELECTIONS) {
  const data = el.elections[e].data;
  const T = new Float64Array(fipsList.length + 1), D = new Float64Array(fipsList.length + 1), R = new Float64Array(fipsList.length + 1);
  for (const [f, v] of Object.entries(data)) {
    const id = fipsIdx.get(f); if (!id) continue;
    T[id] = v[0]; R[id] = v[1]; D[id] = v[2];
  }
  const O = T.map((t, id) => Math.max(0, t - D[id] - R[id]));
  const sD = smooth(D, SETTINGS), sR = smooth(R, SETTINGS), sO = smooth(O, SETTINGS);
  const sT = Object.fromEntries(SETTINGS.map((s) => [s, sD[s].map((d, j) => d + sR[s][j] + sO[s][j])]));
  const entry = { label: el.elections[e].label, offset, scale: {} };
  for (const s of SETTINGS) {
    const t = sT[s], d = sD[s], r = sR[s];
    let maxSqrt = 0;
    for (let j = 0; j < L; j++) maxSqrt = Math.max(maxSqrt, Math.sqrt(t[j]));
    const scale = maxSqrt / 65535 || 1;
    const qT = new Uint16Array(L), qD = new Uint16Array(L), qR = new Uint16Array(L);
    // Shares are coded in 1/65534ths (65535 = no data); each cell's rounding error carries into the county's next cell
    // (error diffusion), so county sums stay exact even where a party's share is small.
    const carryD = new Float64Array(fipsList.length + 1), carryR = new Float64Array(fipsList.length + 1);
    for (let j = 0; j < L; j++) {
      qT[j] = Math.round(Math.sqrt(t[j]) / scale);
      const id = cid[j], tv = (qT[j] * scale) ** 2;
      if (!(T[id] > 0) || !(tv > 0)) { qD[j] = NODATA; qR[j] = NODATA; continue; }
      const wantD = d[j] + carryD[id], wantR = r[j] + carryR[id];
      qD[j] = Math.max(0, Math.min(SHARE, Math.round(wantD / tv * SHARE)));
      qR[j] = Math.max(0, Math.min(SHARE - qD[j], Math.round(wantR / tv * SHARE)));
      carryD[id] = wantD - tv * qD[j] / SHARE; carryR[id] = wantR - tv * qR[j] / SHARE;
    }
    entry.scale[s] = scale;
    blobs[s].push(Buffer.from(qT.buffer), Buffer.from(qD.buffer), Buffer.from(qR.buffer));
    // Volume check on the coded values: each county's decoded total, Democratic and Republican sums.
    const sumT = new Float64Array(fipsList.length + 1), sumD = new Float64Array(fipsList.length + 1), sumR = new Float64Array(fipsList.length + 1);
    for (let j = 0; j < L; j++) {
      const tv = (qT[j] * scale) ** 2; sumT[cid[j]] += tv;
      if (qD[j] !== NODATA) { sumD[cid[j]] += tv * qD[j] / SHARE; sumR[cid[j]] += tv * qR[j] / SHARE; }
    }
    const worst = { T: [0, ''], D: [0, ''], R: [0, ''] };
    for (let id = 1; id <= fipsList.length; id++) for (const [key, want, got] of [['T', T, sumT], ['D', D, sumD], ['R', R, sumR]]) {
      if (!(want[id] > 0)) continue;
      const err = Math.abs(got[id] - want[id]) / want[id];
      if (err > worst[key][0]) worst[key] = [err, fipsList[id - 1]];
    }
    header.check[`${e}@${s}`] = Object.fromEntries(Object.entries(worst).map(([k, [er, f]]) => [k, { maxRelError: +er.toFixed(5), fips: f }]));
  }
  header.elections[e] = entry;
  header.share = SHARE; header.nodata = NODATA;
  offset += L * 6;                                // three Uint16 per land cell
  console.log(e, JSON.stringify(SETTINGS.map((s) => header.check[`${e}@${s}`])));
}

fs.writeFileSync(path.join(HERE, 'terrain-counties.bin'), Buffer.from(new Uint16Array(landCells.map((g) => owner[g])).buffer));
// Land cell positions: grid index of each land cell (Uint32), so the page can rebuild the grid.
fs.writeFileSync(path.join(HERE, 'terrain-cells.bin'), Buffer.from(new Uint32Array(landCells).buffer));
for (const s of SETTINGS) fs.writeFileSync(path.join(HERE, `terrain-s${s}.bin`), Buffer.concat(blobs[s]));
fs.writeFileSync(path.join(HERE, 'terrain.json'), JSON.stringify(header));
const worstAll = Math.max(...Object.values(header.check).flatMap((c) => Object.values(c).map((x) => x.maxRelError)));
console.log('worst per-county volume error across all elections, settings and surfaces:', (worstAll * 100).toFixed(3) + '%');
for (const f of ['terrain.json', 'terrain-counties.bin', 'terrain-cells.bin', ...SETTINGS.map((s) => `terrain-s${s}.bin`)]) {
  console.log(f, (fs.statSync(path.join(HERE, f)).size / 1024).toFixed(0) + ' KB');
}
