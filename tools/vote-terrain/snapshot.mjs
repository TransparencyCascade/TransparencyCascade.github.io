#!/usr/bin/env node
// Freeze the vote-terrain page's data for a published piece, so the piece keeps showing the numbers it
// was written from after the live data is refreshed (certified results, a corrected source).
//
//   node tools/vote-terrain/snapshot.mjs <slug> [--note "what the piece is"]   write a snapshot
//   node tools/vote-terrain/snapshot.mjs --verify <slug>                       re-hash it against its manifest
//   node tools/vote-terrain/snapshot.mjs --list                                list snapshots
//
// Copies every data file the page reads into static/maps/vote-terrain/snapshots/<slug>/ and writes
// manifest.json there: when, from which commit, each file's size and SHA-256, and the sources each data
// file names (with the unofficial flags as they stood). The page reads a snapshot with ?snapshot=<slug>.
// A snapshot is never overwritten: a new one gets a new slug. Git stores a file identical to one already
// committed only once, so unchanged files cost nothing in the repository (the published site does copy them).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.resolve(HERE, '../../static/maps/vote-terrain');
const SNAPS = path.join(PAGE, 'snapshots');
const argv = process.argv.slice(2);
const opt = (k) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : null);
const sha = (f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
const readJSON = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;   // the same rule as js/data.js

// Every file the page fetches: the shared data, each election's terrain grids and every Circles layout.
function dataFiles() {
  const geo = readJSON(path.join(PAGE, 'geometry.json')), terrain = readJSON(path.join(PAGE, 'terrain.json'));
  const files = ['geometry.json', geo.bin, 'elections.json', 'balance.json', 'effective.json', 'house.json', 'history.json', 'money.json', 'people.json', 'people.bin', 'simulator.json', 'overlays.json', 'terrain.json', 'terrain-counties.bin', 'terrain-cells.bin'];
  for (const e of Object.values(terrain.elections)) files.push(...Object.values(e.file));
  files.push(...fs.readdirSync(PAGE).filter((f) => /^circles-[a-z0-9]+\.json$/.test(f)).sort());
  return [...new Set(files)];
}

// The sources each file names, as they stood when the snapshot was taken.
function sources() {
  const el = readJSON(path.join(PAGE, 'elections.json')), bal = readJSON(path.join(PAGE, 'balance.json')), eff = readJSON(path.join(PAGE, 'effective.json'));
  return {
    elections: Object.fromEntries(Object.entries(el.elections).map(([k, e]) => [k, { label: e.label, source: e.source, unofficial: !!e.unofficial, counties: Object.keys(e.data).length }])),
    balance: { sources: bal.sources, unofficial_asof: Object.fromEntries(Object.entries(bal.elections).filter(([, b]) => b.unofficial_asof).map(([k, b]) => [k, b.unofficial_asof])) },
    effective: eff.sources,
    house: (() => { const h = readJSON(path.join(PAGE, 'house.json')); return { sources: h.sources, csv: h.csv, unofficial_asof: h.asof2026, plausible: h.plausible }; })(),
    overlays: Object.fromEntries(Object.entries(readJSON(path.join(PAGE, 'overlays.json')).layers).map(([k, L]) => [k, { name: L.name, source: L.source, asof: L.asof, counties: Object.keys(L.counties).length }])),
  };
}

function git(...a) { try { return execFileSync('git', a, { cwd: PAGE, encoding: 'utf8' }).trim(); } catch (e) { return null; } }

if (argv.includes('--list')) {
  if (!fs.existsSync(SNAPS)) { console.log('No snapshots.'); process.exit(0); }
  for (const s of fs.readdirSync(SNAPS).sort()) {
    const m = path.join(SNAPS, s, 'manifest.json');
    if (fs.existsSync(m)) { const x = readJSON(m); console.log(`${s}  ${x.created}  ${x.files.length} files  ${x.note || ''}`); }
  }
  process.exit(0);
}

const verify = opt('--verify');
if (verify) {
  const dir = path.join(SNAPS, verify), m = readJSON(path.join(dir, 'manifest.json'));
  let bad = 0;
  for (const f of m.files) {
    const p = path.join(dir, f.file);
    if (!fs.existsSync(p)) { console.log(`missing: ${f.file}`); bad++; }
    else if (sha(p) !== f.sha256) { console.log(`changed: ${f.file}`); bad++; }
  }
  console.log(bad ? `${bad} of ${m.files.length} files differ from the manifest.` : `All ${m.files.length} files match the manifest.`);
  process.exit(bad ? 1 : 0);
}

const slug = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--note');
if (!slug || !SLUG.test(slug)) { console.error('usage: snapshot.mjs <slug: lowercase letters, digits and hyphens> [--note "..."]'); process.exit(2); }
const dir = path.join(SNAPS, slug);
if (fs.existsSync(dir)) { console.error(`snapshots/${slug} exists; snapshots are never overwritten. Choose a new slug.`); process.exit(1); }
fs.mkdirSync(dir, { recursive: true });
const files = dataFiles().map((f) => {
  fs.copyFileSync(path.join(PAGE, f), path.join(dir, f));
  return { file: f, bytes: fs.statSync(path.join(dir, f)).size, sha256: sha(path.join(dir, f)) };
});
const dirty = git('status', '--porcelain', '--', ...files.map((f) => f.file));
const manifest = {
  slug, created: new Date().toISOString(), note: opt('--note') || '',
  commit: git('rev-parse', 'HEAD'), uncommittedDataChanges: dirty === null ? null : dirty.length > 0,
  page: `?snapshot=${slug}`, files, sources: sources(),
};
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 1));
const total = files.reduce((a, f) => a + f.bytes, 0);
console.log(`snapshots/${slug}: ${files.length} files, ${(total / 1e6).toFixed(1)} MB, manifest written. Open the page with ?snapshot=${slug}.`);
if (manifest.uncommittedDataChanges) console.log('Note: some data files have uncommitted changes; the hashes record them, the commit does not.');
