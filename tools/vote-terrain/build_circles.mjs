#!/usr/bin/env node
// Circles view layouts: each county a circle whose area is its votes, nudged apart so none overlap and
// each stays as near its own centroid as the crowding allows (a Dorling cartogram).
//
//   VT_MODULES=<dir with node_modules/d3-force and d3-polygon> node build_circles.mjs
//
// Reads geometry.json, elections.json and effective.json from static/maps/vote-terrain/. Writes, there:
//   circles-<election>.json   { r: radius scale, p: { fips: [x, y] } } for the counties with votes
//   circles-rep2010.json, circles-rep2020.json   the same with each county sized by its share of the
//                             apportioned electoral votes (2010 and 2020 Census), on the same scale
// The radius scale is fixed across every layout (area = R2 * votes), so circles grow and shrink with
// turnout between elections; the page reads r from the file and scales votes the same way.
// Lives in tools/ so Hugo does not publish it.

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '..', 'static', 'maps', 'vote-terrain');
const MODULES = process.env.VT_MODULES || path.join(HERE, 'node_modules');
const require = createRequire(path.join(MODULES, 'x.js'));
const { forceSimulation, forceX, forceY, forceCollide } = require('d3-force');
const { polygonCentroid } = require('d3-polygon');

const geo = JSON.parse(fs.readFileSync(path.join(OUT, 'geometry.json')));
const el = JSON.parse(fs.readFileSync(path.join(OUT, 'elections.json')));
const eff = JSON.parse(fs.readFileSync(path.join(OUT, 'effective.json')));

// Centroid of each county's largest piece, in screen orientation (y = -projected y), as views2d.js does.
const ringsOf = (pc) => (Array.isArray(pc.p[0][0]) ? pc.p : [pc.p]);
const shoelace = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
const centroid = {}, best = {};
for (const pc of geo.pieces) {
  const outer = ringsOf(pc)[0], a = Math.abs(shoelace(outer));
  if (!(best[pc.f] > a)) { best[pc.f] = a; centroid[pc.f] = polygonCentroid(outer.map((q) => [q[0], -q[1]])); }
}

// One radius scale for every layout: President 2024's circles cover 45% of the land area.
const LAND = Object.values(geo.meta).reduce((s, m) => s + m.a, 0);
const V24 = Object.values(el.elections.pres2024.data).reduce((s, v) => s + v[0], 0);
const R2 = (0.45 * LAND) / (Math.PI * V24);            // area = pi * R2 * value
const radius = (v) => Math.sqrt(R2 * v);

function layout(values) {
  const nodes = Object.entries(values).filter(([f, v]) => v > 0 && centroid[f])
    .map(([f, v]) => ({ f, r: radius(v), cx: centroid[f][0], cy: centroid[f][1], x: centroid[f][0], y: centroid[f][1] }));
  // Big circles first so they settle before the small ones fill in around them.
  nodes.sort((a, b) => b.r - a.r);
  const sim = forceSimulation(nodes).randomSource(() => 0.5)
    .force('x', forceX((n) => n.cx).strength(0.12))
    .force('y', forceY((n) => n.cy).strength(0.12))
    .force('c', forceCollide((n) => n.r + 0.25).iterations(4).strength(0.9))
    .stop();
  for (let i = 0; i < 360; i++) sim.tick();
  const p = {};
  let moved = 0;
  for (const n of nodes) { p[n.f] = [Math.round(n.x * 10) / 10, Math.round(n.y * 10) / 10]; moved += Math.hypot(n.x - n.cx, n.y - n.cy); }
  return { p, mean: moved / nodes.length, n: nodes.length };
}

const write = (name, values) => {
  const { p, mean, n } = layout(values);
  fs.writeFileSync(path.join(OUT, `circles-${name}.json`), JSON.stringify({ r: R2, p }));
  console.log(name, n, 'counties, mean shift', mean.toFixed(1), 'units');
};
for (const [key, e] of Object.entries(el.elections)) {
  if (e.baselineOnly) continue;
  write(key, Object.fromEntries(Object.entries(e.data).map(([f, v]) => [f, v[0]])));
}
// Represented layouts: county volume = its share of the electoral votes apportioned to the counties on
// the map, times President 2024's total votes (so the two kinds of layout share one scale).
const stOf = {};
for (const f in geo.meta) stOf[f] = geo.meta[f].st;
for (const [b, col] of [['2010', 0], ['2020', 1]]) {
  const vals = {};
  for (const [f, c] of Object.entries(eff.county)) {
    const st = stOf[f]; if (!st) continue;
    vals[f] = (V24 * eff.ev[b][st] * c[col]) / eff.stPop[b][st] / eff.rep[b].E;
  }
  write('rep' + b, vals);
}
