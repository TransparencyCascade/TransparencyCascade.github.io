#!/usr/bin/env node
// Build the data for the vote-volume terrain page.
//
//   VT_MODULES=<dir with node_modules/d3-geo and topojson-client> node build_data.mjs
//   (one-time: npm i d3-geo@3.1.1 topojson-client@3.1.0 in that dir)
//
// Writes into static/maps/vote-terrain/ (the page; this script lives in tools/ so Hugo does not publish it):
//   geometry.json + geometry.bin (packed by geometry_codec.mjs)
//                   counties pre-projected to d3.geoAlbersUsa (equal-area; Alaska and Hawaii insets),
//                   one item per polygon piece: fips, county name, state, rings (y flipped so north is up),
//                   the county's projected area (px^2) and true area (sq mi)
//   elections.json  per election and county: [total votes cast, Republican votes, Democratic votes]
//
// President (2016, 2020, 2024): MIT Election Data and Science Lab, County Presidential Election
// Returns 2000-2024 (file version 20260225). Rows "TOTAL VOTES CAST" are excluded; where a county
// reports a TOTAL mode only TOTAL rows are used, otherwise its modes are summed; a county with any
// non-numeric ("NA") vote count in the year is left out (null), never counted as zero, and a county
// whose candidate sum disagrees with its own TOTAL VOTES CAST row is reported.
// 2026 Senate: the checked AP-via-CNN county file used by the wave piece, counted=yes rows only.
// Height on the page = votes / projected area, so each block's volume is its votes.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { writeGeometry } from './geometry_codec.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, '..', '..', 'static', 'maps', 'vote-terrain');
// Senate 2018-2024 and governor county results, built by build_senate_governor.py.
const EXTRA = process.env.VT_EXTRA || path.join(HERE, 'extra-elections.json');
const HOME = os.homedir();
const MODULES = process.env.VT_MODULES || path.join(HERE, 'node_modules');
const require = createRequire(path.join(MODULES, 'x.js'));
const d3 = require('d3-geo');
const topojson = require('topojson-client');

const TOPO = path.join(HOME, 'TransparencyCascade/static/maps/2026-county-swing/counties-10m.json');
const PRES = process.env.VT_PRES || '/private/tmp/claude-501/-Users-markr-pyrite/5378b403-e0b8-4886-ba89-1a2632a79931/scratchpad/countypres-data/countypres_2000-2024.csv';
const SEN26 = path.join(HOME, 'tcp-kb-internal/cascade-research/notes/data/swing-30-dr-senate-states-2026-unofficial-ap-feed-checked-2026-11-04T1917Z.csv');

const ABBR = { '01': 'AL', '02': 'AK', '04': 'AZ', '05': 'AR', '06': 'CA', '08': 'CO', '09': 'CT', '10': 'DE', '11': 'DC', '12': 'FL', '13': 'GA', '15': 'HI', '16': 'ID', '17': 'IL', '18': 'IN', '19': 'IA', '20': 'KS', '21': 'KY', '22': 'LA', '23': 'ME', '24': 'MD', '25': 'MA', '26': 'MI', '27': 'MN', '28': 'MS', '29': 'MO', '30': 'MT', '31': 'NE', '32': 'NV', '33': 'NH', '34': 'NJ', '35': 'NM', '36': 'NY', '37': 'NC', '38': 'ND', '39': 'OH', '40': 'OK', '41': 'OR', '42': 'PA', '44': 'RI', '45': 'SC', '46': 'SD', '47': 'TN', '48': 'TX', '49': 'UT', '50': 'VT', '51': 'VA', '53': 'WA', '54': 'WV', '55': 'WI', '56': 'WY' };

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = ''; if (row.length > 1) rows.push(row); row = [];
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const head = rows.shift();
  return rows.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}

// ---------- geometry ----------
const topo = JSON.parse(fs.readFileSync(TOPO, 'utf8'));
const projection = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);
const pathGen = d3.geoPath(projection);
const R_MI = 3958.8;
const r1 = (v) => Math.round(v * 10) / 10;
const counties = topojson.feature(topo, topo.objects.counties).features;
const pieces = [], meta = {};
for (const f of counties) {
  const fips = String(f.id).padStart(5, '0');
  const st = ABBR[fips.slice(0, 2)];
  if (!st) continue;                                   // territories
  const pg = projection.stream ? pathGen.area(f) : 0;  // projected px^2 (equal-area projection)
  if (!(pg > 0)) continue;
  meta[fips] = { n: f.properties.name, st, a: Math.round(pg * 1000) / 1000, sqmi: Math.round(d3.geoArea(f) * R_MI * R_MI) };
  // Project each polygon ring; flip y so north is up in the page's z-up view.
  const proj = (ring) => ring.map(([lon, lat]) => projection([lon, lat])).filter(Boolean).map(([x, y]) => [r1(x), r1(-y)]);
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const poly of polys) {
    const rings = poly.map(proj).filter((r) => r.length >= 4);
    if (rings.length) pieces.push({ f: fips, p: rings });
  }
}

// Camera presets: projected centres (y flipped).
const at = (lon, lat) => { const [x, y] = projection([lon, lat]); return [r1(x), r1(-y)]; };
const presets = {
  national: { target: at(-96.5, 37.5), zoom: 0.15 },
  texas: { target: at(-96.4, 32.6), zoom: 2.0 },
  maine: { target: at(-69.2, 44.6), zoom: 2.2 },
  ref: { target: at(-90.0, 26.8) },   // where the reference blocks sit, in the Gulf of Mexico
};

const report = { tvcMismatch: [], noGeometry: new Set(), naCounties: [] };

// Results reported under codes the map has no shape for, folded into the county that holds them.
const ALIAS = {
  '2938000': '29095', '36000': '29095', // Kansas City, MO (own election board): assigned whole to Jackson County,
                                        // though the city also reaches into Clay, Platte and Cass counties
  '46113': '46102',                     // Shannon County, SD, renamed Oglala Lakota (new code) in 2015
  '51515': '51019',                     // Bedford city, VA, merged into Bedford County in 2013
  '51610': '51059',                     // Falls Church city, VA: no shape at this map resolution; inside Fairfax County
};
const put = (data, fips, v, tag) => {
  const f = ALIAS[fips] || fips;
  if (!meta[f]) { report.noGeometry.add(tag + ' ' + fips); return; }
  if (data[f]) data[f] = data[f].map((x, i) => x + v[i]); else data[f] = v;
};

// ---------- president, MEDSL ----------
const pres = parseCSV(fs.readFileSync(PRES, 'utf8'));
const byYearCounty = new Map();
for (const r of pres) {
  if (!['2016', '2020', '2024'].includes(r.year) || !r.county_fips || r.county_fips === 'NA') continue;
  if (r.state_po === 'AK') continue;   // Alaska's codes are state House districts; they would collide with borough codes
  const k = r.year + '|' + r.county_fips.padStart(5, '0');
  if (!byYearCounty.has(k)) byYearCounty.set(k, []);
  byYearCounty.get(k).push(r);
}
const elections = {};
for (const year of ['2016', '2020', '2024']) {
  const data = {};
  for (const [k, rs] of byYearCounty) {
    if (!k.startsWith(year + '|')) continue;
    const fips = k.slice(5);
    const cand = rs.filter((r) => r.candidate !== 'TOTAL VOTES CAST');
    const tvc = rs.filter((r) => r.candidate === 'TOTAL VOTES CAST' && r.mode === 'TOTAL');
    const use = cand.some((r) => r.mode === 'TOTAL') ? cand.filter((r) => r.mode === 'TOTAL') : cand;
    const num = (r) => /^\d+$/.test(r.candidatevotes);
    const sum = (pred) => use.filter(pred).reduce((a, r) => a + Number(r.candidatevotes), 0);
    const major = (r) => r.party === 'REPUBLICAN' || r.party === 'DEMOCRAT';
    // A non-numeric Republican or Democratic count leaves the county out. A non-numeric minor-candidate
    // count (New Mexico 2024 suppresses some Libertarian counts as NA) keeps the county, with the total
    // taken from the file's own totalvotes field, which matches the candidate sum wherever both exist.
    if (use.some((r) => major(r) && !num(r))) { report.naCounties.push(year + ' ' + fips + ' (major candidate NA: left out)'); continue; }
    let t = sum(num);
    if (use.some((r) => !num(r))) {
      const tv = use.map((r) => r.totalvotes).find((v) => /^\d+$/.test(v));
      if (!tv) { report.naCounties.push(year + ' ' + fips + ' (minor NA, no totalvotes: left out)'); continue; }
      t = Number(tv); report.naCounties.push(year + ' ' + fips + ' (minor NA: total from totalvotes ' + tv + ')');
    }
    const rep = sum((r) => r.party === 'REPUBLICAN'), dem = sum((r) => r.party === 'DEMOCRAT');
    if (tvc.length && /^\d+$/.test(tvc[0].candidatevotes) && Number(tvc[0].candidatevotes) !== t) {
      report.tvcMismatch.push(`${year} ${fips}: candidates ${t}, TOTAL VOTES CAST ${tvc[0].candidatevotes}`);
    }
    put(data, fips, [t, rep, dem], year);
  }
  elections['pres' + year] = {
    label: 'President ' + year, office: 'President', year: Number(year), data,
    source: 'MIT Election Data and Science Lab, County Presidential Election Returns 2000-2024 (version 20260225), certified results.',
  };
}

// ---------- 2026 Senate ----------
const sen = parseCSV(fs.readFileSync(SEN26, 'utf8')).filter((r) => r.counted === 'yes');
const sdata = {};
for (const r of sen) {
  const fips = r.county_fips.padStart(5, '0');
  put(sdata, fips, [Number(r.total), Number(r.votes_rep), Number(r.votes_dem)], 'sen2026');
}
elections.sen2026 = {
  label: 'Senate 2026', office: 'U.S. Senate', year: 2026, data: sdata, unofficial: true,
  source: 'AP county results via CNN, unofficial as of 2:17 p.m. ET, Nov. 4, 2026 (30 states with a Democrat-vs-Republican race).',
};

// ---------- previous Senate race for each 2026 seat (baseline only, not on the timeline) ----------
// From the county prior-race file: 2020 for most seats, 2022 for OH, OK and FL, 2024 for NE. Races
// without both a Democrat and a Republican in the prior year (Arkansas 2020) are left out.
const SENPRIOR = path.join(HOME, 'tcp-kb-internal/cascade-research/notes/data/senate-2026-vs-prior-senate-by-county-unofficial-2026-11-05T0239Z.csv');
const pdata = {}, priorYears = {};
for (const r of parseCSV(fs.readFileSync(SENPRIOR, 'utf8'))) {
  if (r.flag_prior_not_dem_vs_rep !== 'no' || !(Number(r.prior_total) > 0)) continue;
  put(pdata, r.county_fips.padStart(5, '0'), [Number(r.prior_total), Number(r.prior_votes_rep), Number(r.prior_votes_dem)], 'senprior');
  priorYears[r.state] = r.prior_year;
}
elections.senprior = {
  label: 'the previous Senate race', office: 'U.S. Senate', data: pdata, baselineOnly: true, priorYears,
  source: 'Previous Senate race by county: Verified Voting 2020 official county results, and MIT Election Data and Science Lab files for 2022 and 2024 (see senate-and-governor-2026-vs-prior-race-by-county-2026-11-04.md).',
};
// ---------- Senate 2018-2024 and governor (build_senate_governor.py) ----------
const extra = JSON.parse(fs.readFileSync(EXTRA, 'utf8'));
for (const [key, e] of Object.entries(extra)) {
  const data = {};
  for (const [f, v] of Object.entries(e.data)) put(data, f, v, key);
  elections[key] = { ...e, data };
}
elections.sen2026.notes = ['Democrat-vs-Republican races only; 30 states.'];

// Plausibility guard for the precinct-built years: a Senate or governor race cannot draw more votes than
// the same county's presidential race in the comparable cycle by much. A county over 1.25 times is left
// out; a state where more than a tenth of the counties fail is left out whole (New York's 2018 and 2022
// MEDSL files sum some votes twice). Each exclusion is listed in the election's notes.
const PRES_FOR = { sen2018: 'pres2016', gov2018: 'pres2016', sen2020: 'pres2020', sen2022: 'pres2020', gov2022: 'pres2020', sen2024: 'pres2024', gov2026: 'pres2024' };
const ST = (f) => meta[f] ? meta[f].st : '?';
for (const [key, pk] of Object.entries(PRES_FOR)) {
  const e = elections[key], pd = elections[pk].data, bad = {}, n = {};
  for (const [f, v] of Object.entries(e.data)) {
    n[ST(f)] = (n[ST(f)] || 0) + 1;
    if (pd[f] && pd[f][0] > 0 && v[0] > 1.25 * pd[f][0]) (bad[ST(f)] ||= []).push(f);
  }
  e.notes = e.notes || [];
  for (const [st, fs] of Object.entries(bad)) {
    if (fs.length > 0.1 * n[st]) {
      for (const f of Object.keys(e.data)) if (ST(f) === st) delete e.data[f];
      e.notes.push(`${st}: ${fs.length} of ${n[st]} counties report more votes than the ${elections[pk].label} race; the state is left out`);
    } else {
      for (const f of fs) delete e.data[f];
      e.notes.push(`${st}: left out ${fs.map((f) => meta[f].n).join(', ')} (more votes than the ${elections[pk].label} race)`);
    }
  }
}
for (const key of ['gov2026', 'gov2022', 'govprior']) {
  (elections[key].notes ||= []).push('Connecticut reports by planning region, which these county shapes predate; left out.');
}

// Timeline tracks, and the baseline for "swing since the last race for the same seat".
const tracks = {
  president: ['pres2016', 'pres2020', 'pres2024'],
  senate: ['sen2018', 'sen2020', 'sen2022', 'sen2024', 'sen2026'],
  governor: ['gov2018', 'gov2022', 'gov2026'],
};
const sameOffice = { pres2016: null, pres2020: 'pres2016', pres2024: 'pres2020',
  sen2018: null, sen2020: null, sen2022: null, sen2024: 'sen2018', sen2026: 'senprior',
  gov2018: null, gov2022: 'gov2018', gov2026: 'govprior' };

// Exaggeration: one constant across every election, set from the densest county in any of them.
let maxD = 0, maxF = '', minD = Infinity, minF = '';
for (const e of Object.values(elections)) for (const [f, [t]] of Object.entries(e.data)) {
  const d = t / meta[f].a;
  if (d > maxD) { maxD = d; maxF = f; }
  if (t > 0 && d < minD) { minD = d; minF = f; }
}
const MAX_HEIGHT = 260;                 // projected px units for the densest county
const k = MAX_HEIGHT / maxD;            // height = k * votes / area_px

writeGeometry(OUT, { meta, pieces, presets });   // geometry.json + geometry.bin, packed losslessly (geometry_codec.mjs)
fs.writeFileSync(path.join(OUT, 'elections.json'), JSON.stringify({
  order: [...tracks.president, ...tracks.senate, ...tracks.governor], tracks, sameOffice, k, maxHeight: MAX_HEIGHT, elections,
  notes: {
    AK: 'Alaska reports presidential results by state House district, not by borough, so it has no county data here.',
    CT: 'Connecticut is drawn on its eight historic counties, the codes the certified presidential file uses.',
    KC: 'Kansas City, Missouri reports separately; its votes are added to Jackson County, though the city also reaches into Clay, Platte and Cass counties.',
    VA: 'Falls Church city is added to Fairfax County and Bedford city (2016) to Bedford County.',
    CERT: 'County figures are the certified county file\'s; summed by state they differ slightly from certified state totals in some states (the county counts predate the recounts in Georgia 2020 and Wisconsin 2016 and 2020; the largest gap is 0.5%, Iowa 2020). The balance of power uses certified state totals from the FEC.',
  },
}));

const sqmiDensity = (f, t) => Math.round(t / meta[f].sqmi);
const tot = (e) => Object.values(elections[e].data).reduce((a, [t]) => a + t, 0);
console.log('pieces', pieces.length, 'counties with geometry', Object.keys(meta).length);
for (const e of Object.keys(elections)) console.log(e, 'counties', Object.keys(elections[e].data).length, 'votes', tot(e).toLocaleString('en-US'));
console.log(`densest: ${meta[maxF].n}, ${meta[maxF].st} (${sqmiDensity(maxF, maxD * meta[maxF].a).toLocaleString('en-US')} votes/sq mi); sparsest: ${meta[minF].n}, ${meta[minF].st} (${(minD * meta[minF].a / meta[minF].sqmi).toFixed(2)} votes/sq mi); k=${k}`);
console.log('NA counties skipped:', report.naCounties.length, report.naCounties.slice(0, 10));
console.log('TOTAL VOTES CAST mismatches:', report.tvcMismatch.length, report.tvcMismatch.slice(0, 5));
const ng = [...report.noGeometry];  // Alaska is skipped before this point
console.log('no geometry:', ng.length, '(Alaska districts:', ng.filter((x) => x.includes(' 02')).length + ')', ng.filter((x) => !x.includes(' 02')));
