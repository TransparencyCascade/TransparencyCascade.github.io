// Packs the county geometry for the vote-terrain page: geometry.json (names, areas, presets) and
// geometry.bin (every ring as varint zigzag deltas in tenths of a unit). The format and the decoder are in
// static/maps/vote-terrain/js/geometry.js; build_data.mjs writes the pair with encodeGeometry, and the other
// builders read it back with readGeometry. Lossless: the decoded geometry is checked against the input.
//   node tools/vote-terrain/geometry_codec.mjs <geometry.json in the old shape> <out dir>   (one-off conversion)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodeGeometry } from '../../static/maps/vote-terrain/js/geometry.js';

const SCALE = 10;

export function encodeGeometry({ meta, pieces, presets }) {
  const fips = Object.keys(meta), at = new Map(fips.map((f, i) => [f, i]));
  const out = [];
  const put = (v) => { if (!Number.isSafeInteger(v) || v < 0) throw new Error('varint out of range: ' + v); while (v >= 128) { out.push((v % 128) | 128); v = Math.floor(v / 128); } out.push(v); };
  const zig = (v) => (v < 0 ? -2 * v - 1 : 2 * v);
  const q = (v) => { const n = Math.round(v * SCALE); if (n / SCALE !== v) throw new Error(`coordinate ${v} is not on the 1/${SCALE} grid`); return n; };
  let x = 0, y = 0;
  put(pieces.length);
  for (const pc of pieces) {
    if (!at.has(pc.f)) throw new Error('piece for a county with no meta: ' + pc.f);
    put(at.get(pc.f)); put(pc.p.length);
    for (const ring of pc.p) {
      put(ring.length);
      for (const [px, py] of ring) { const nx = q(px), ny = q(py); put(zig(nx - x)); put(zig(ny - y)); x = nx; y = ny; }
    }
  }
  const head = { format: 'vt-geometry-1', scale: SCALE, bin: 'geometry.bin',
    meta: fips.map((f) => { const m = meta[f]; return [f, m.n, m.st, m.a, m.sqmi]; }), presets };
  const bytes = Uint8Array.from(out);
  // Round trip: the page must see exactly what the build wrote.
  if (JSON.stringify(decodeGeometry(head, bytes)) !== JSON.stringify({ meta, pieces, presets })) throw new Error('geometry round trip differs');
  return { head, bytes };
}

export function writeGeometry(dir, geo) {
  const { head, bytes } = encodeGeometry(geo);
  fs.writeFileSync(path.join(dir, 'geometry.json'), JSON.stringify(head));
  fs.writeFileSync(path.join(dir, 'geometry.bin'), bytes);
}

export function readGeometry(dir) {
  const head = JSON.parse(fs.readFileSync(path.join(dir, 'geometry.json'), 'utf8'));
  return decodeGeometry(head, new Uint8Array(fs.readFileSync(path.join(dir, head.bin))));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [src, dir] = process.argv.slice(2);
  if (!src || !dir) { console.error('usage: node geometry_codec.mjs <old geometry.json> <out dir>'); process.exit(2); }
  const geo = JSON.parse(fs.readFileSync(src, 'utf8'));
  writeGeometry(dir, geo);
  const back = readGeometry(dir);
  const same = JSON.stringify(back) === JSON.stringify(geo);
  console.log(`geometry.json ${fs.statSync(path.join(dir, 'geometry.json')).size} bytes, geometry.bin ${fs.statSync(path.join(dir, 'geometry.bin')).size} bytes (was ${fs.statSync(src).size}); identical after decoding: ${same}`);
  if (!same) process.exit(1);
}
