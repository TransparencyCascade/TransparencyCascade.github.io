// People (dot map): where the dots go. One slot is one possible dot, placed inside its county where people live.
//
//   VT_MODULES=<dir with node_modules/d3-geo> node tools/vote-terrain/build_people.mjs
//
// Method, in one line: each county's slots are drawn from its 2020 census tracts, a tract chosen in proportion to its population and the slot placed
// at random within the tract's own extent around its population centre (Census Bureau 2020 tract centres of population, with the Gazetteer's land
// area), kept inside the county outline.
//
// Reads  .census-cache/CenPop2020_Mean_TR.txt   (tract population and population-weighted centre; census.gov cenpop2020)
//        .census-cache/2020_Gaz_tracts_national.zip   (tract land area, square miles; the Gazetteer)
//        static/maps/vote-terrain/geometry.json + geometry.bin, elections.json
// Writes static/maps/vote-terrain/people.json (the county order, how many slots each holds, the method) and people.bin (x, y of every slot as
// unsigned 16-bit, little endian, county after county, in the page's projected coordinates (screen y, down)).
//
// Slots are placed once, for where people live, not for how they voted: the page gives each slot a party at run time from the election's county
// totals. A county holds slots for the most votes any election in the data counts there at one dot per 500 votes (the finest the page offers), plus
// one. Slots are in random order, so any first k of a county's slots are as representative of where people live as all of them. The random numbers
// are seeded (SEED below, then the county's code): rebuilding gives the same bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, '..', '..', 'static', 'maps', 'vote-terrain');
const CACHE = path.join(HERE, '.census-cache');
const MODULES = process.env.VT_MODULES || path.join(HERE, 'node_modules');
const d3 = createRequire(path.join(MODULES, 'x.js'))('d3-geo');
const SEED = 20201001, PER = 500, QMAX = 65535;

const meta = {}, headJson = JSON.parse(fs.readFileSync(path.join(PAGE, 'geometry.json'), 'utf8'));
for (const [f, n, st, a, sqmi] of headJson.meta) meta[f] = { n, st, a, sqmi };
const elections = JSON.parse(fs.readFileSync(path.join(PAGE, 'elections.json'), 'utf8')).elections;

// County outlines in the page's projection (geometry.bin: LEB128 varints of zigzag deltas, tenths of a unit; x right, y up, so the page's screen y is -y).
const bin = fs.readFileSync(path.join(PAGE, 'geometry.bin'));
const fipsList = headJson.meta.map((m) => m[0]);
const rings = {};   // county -> list of polygons (outer ring first), each [[x, screenY]]
{
  let i = 0;
  const next = () => { let v = 0, s = 1, b; do { b = bin[i++]; v += (b & 127) * s; s *= 128; } while (b & 128); return v; };
  const zig = (v) => (v % 2 ? -(v + 1) / 2 : v / 2);
  let x = 0, y = 0;
  for (let p = 0, np = next(); p < np; p++) {
    const f = fipsList[next()], rs = [];
    for (let r = 0, nr = next(); r < nr; r++) {
      const ring = new Array(next());
      for (let k = 0; k < ring.length; k++) { x += zig(next()); y += zig(next()); ring[k] = [x / headJson.scale, -y / headJson.scale]; }
      rs.push(ring);
    }
    (rings[f] ||= []).push(rs);
  }
}
const inRing = (pt, ring) => d3.geoContains ? false : false;   // placeholder replaced below
function pip(x, y, ring) {
  let c = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
const inCounty = (f, x, y) => (rings[f] || []).some((rs) => pip(x, y, rs[0]) && !rs.slice(1).some((h) => pip(x, y, h)));

// Same projection as build_data.mjs.
const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);

// Tracts: population, centre, land area.
const gaz = {};
{
  const txt = execFileSync('unzip', ['-p', path.join(CACHE, '2020_Gaz_tracts_national.zip')], { maxBuffer: 1 << 28 }).toString('latin1').split('\n');
  const h = txt.shift().trim().split('\t').map((s) => s.trim());
  for (const ln of txt) { if (!ln.trim()) continue; const c = ln.split('\t'); gaz[c[h.indexOf('GEOID')].trim()] = +c[h.indexOf('ALAND_SQMI')]; }
}
// FIPS differences between the census tracts (2020) and the page's county outlines.
const ALIAS = { '51610': '51059', '51515': '51019', '46102': '46113', '02158': '02270' };   // Falls Church city, Bedford city, Oglala Lakota (was Shannon), Kusilvak (was Wade Hampton)
const pageCounty = (c) => (meta[c] ? c : ALIAS[c] && meta[ALIAS[c]] ? ALIAS[c] : null);
const unmatched = {};
const tractsOf = {};
let nTract = 0, popTotal = 0, popDropped = 0, noProj = 0;
{
  const lines = fs.readFileSync(path.join(CACHE, 'CenPop2020_Mean_TR.txt'), 'utf8').replace(/^﻿/, '').split(/\r?\n/);
  lines.shift();
  for (const ln of lines) {
    if (!ln) continue;
    const [st, co, tr, pop, lat, lon] = ln.split(',');
    const code = st + co, f = pageCounty(code), P = +pop;
    popTotal += P;
    if (!f || !(P > 0)) { if (st !== '72' && P > 0) { popDropped += P; unmatched[code] = (unmatched[code] || 0) + P; } continue; }
    const xy = projection([+lon, +lat]);
    if (!xy) { noProj++; popDropped += P; continue; }
    (tractsOf[f] ||= []).push({ pop: P, x: xy[0], y: xy[1], sqmi: gaz[st + co + tr] || 0 });
    nTract++;
  }
}

// Seeded generator (mulberry32) per county.
const rngFor = (f) => { let a = (SEED ^ (+f * 2654435761)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

// Slots per county: the most votes any election counts there, per 500, plus one.
const maxVotes = {};
for (const e of Object.values(elections)) for (const [f, v] of Object.entries(e.data)) maxVotes[f] = Math.max(maxVotes[f] || 0, v[0]);
const order = Object.keys(meta).filter((f) => maxVotes[f] > 0).sort();
const counts = order.map((f) => Math.ceil(maxVotes[f] / PER) + 1);
const total = counts.reduce((a, b) => a + b, 0);

// Bounds of the page's projected map, to quantize into 16 bits.
let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
for (const f in rings) for (const rs of rings[f]) for (const [x, y] of rs[0]) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
x0 = Math.floor(x0) - 1; y0 = Math.floor(y0) - 1; x1 = Math.ceil(x1) + 1; y1 = Math.ceil(y1) + 1;
const qx = (x) => Math.max(0, Math.min(QMAX, Math.round(((x - x0) / (x1 - x0)) * QMAX)));
const qy = (y) => Math.max(0, Math.min(QMAX, Math.round(((y - y0) / (y1 - y0)) * QMAX)));

const out = Buffer.alloc(total * 4);
let o = 0, noTract = [], fallback = 0, placed = 0, inside = 0;
order.forEach((f, ci) => {
  const T = tractsOf[f], rnd = rngFor(f), n = counts[ci], pxMi = Math.sqrt(meta[f].a / Math.max(1, meta[f].sqmi));
  if (!T || !T.length) {
    // No census tract data for this county (it should not happen): put its slots at the county outline's first vertex.
    noTract.push(f); const [px, py] = rings[f][0][0][0];
    for (let k = 0; k < n; k++) { out.writeUInt16LE(qx(px), o); out.writeUInt16LE(qy(py), o + 2); o += 4; }
    return;
  }
  const cum = []; let s = 0; for (const t of T) { s += t.pop; cum.push(s); }
  for (let k = 0; k < n; k++) {
    const r = rnd() * s; let lo = 0, hi = cum.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] >= r) hi = mid; else lo = mid + 1; }
    const t = T[lo], rad = Math.sqrt(t.sqmi / Math.PI) * pxMi;   // a disc as large as the tract's land
    let px = t.x, py = t.y, ok = false;
    for (let a = 0; a < 12; a++) {
      const ang = rnd() * 2 * Math.PI, d = Math.sqrt(rnd()) * rad, cx = t.x + Math.cos(ang) * d, cy = t.y + Math.sin(ang) * d;
      if (inCounty(f, cx, cy)) { px = cx; py = cy; ok = true; break; }
    }
    if (!ok) { fallback++; if (inCounty(f, t.x, t.y)) inside++; }
    out.writeUInt16LE(qx(px), o); out.writeUInt16LE(qy(py), o + 2); o += 4; placed++;
  }
});
fs.writeFileSync(path.join(PAGE, 'people.bin'), out);
const sha = crypto.createHash('sha256').update(out).digest('hex');
const head = {
  format: 'vt-people-1', bin: 'people.bin', seed: SEED, perSlotVotes: PER, bounds: [x0, y0, x1, y1], q: QMAX, slots: total,
  counties: order, counts, sha256: sha,
  method: 'Each county\'s slots are drawn from its 2020 census tracts, a tract chosen in proportion to its population and the slot placed at random within the tract\'s own land area around its centre of population (Census Bureau 2020 tract centres of population and Gazetteer land area), kept inside the county outline. Where people live, not how they voted: the party of each dot is assigned at random among a county\'s dots, in the county\'s proportions.',
  sources: ['https://www2.census.gov/geo/docs/reference/cenpop2020/tract/CenPop2020_Mean_TR.txt', 'https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2020_Gazetteer/2020_Gaz_tracts_national.zip'],
  built: { tracts: nTract, population: popTotal, populationLeftOut: popDropped, note: 'left out: Puerto Rico and tracts in places the page does not draw (none otherwise); Virginia\'s Falls Church and Bedford cities are in Fairfax and Bedford counties as in the vote files; Kansas City is not moved from Clay, Platte and Cass, so Jackson County\'s Kansas City votes are placed by Jackson County\'s own tracts', countiesWithoutTracts: noTract },
};
fs.writeFileSync(path.join(PAGE, 'people.json'), JSON.stringify(head));
console.log(`people: ${order.length} counties, ${total.toLocaleString()} slots, ${(out.length / 1024).toFixed(0)} KB; ${nTract} tracts, population ${popTotal.toLocaleString()} (left out ${popDropped.toLocaleString()}, ${noProj} tracts did not project); ${fallback} slots fell back to a tract centre; counties without tracts: ${noTract.join(',') || 'none'}; tract counties not on the page: ${JSON.stringify(unmatched)}; sha256 ${sha.slice(0, 12)}`);
