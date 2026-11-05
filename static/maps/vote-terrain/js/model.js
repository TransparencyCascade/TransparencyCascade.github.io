/* The numbers behind every view: margins, swing against the last race for the same office, power
   weights, effective vote, heights and the per-county rows the flat views and the table read. Reads the
   shared state; owns no DOM. */
import { toward, towardW, rgb, NODATA, PAGE, SWING_MAX, MARGIN_MAX, WEIGHT_MAX } from './colour.js';

export function createModel({ geo, el, bal, eff, state, selection }) {
  const { meta } = geo;
  const { order, tracks, sameOffice, k, elections } = el;
  // Office tracks: the timeline shows the elections of the office in view.
  const officeOf = (e) => Object.keys(tracks).find((o) => tracks[o].includes(e)) || 'president';
  const margin = (v) => (v && v[0] ? (v[2] - v[1]) / v[0] * 100 : null);   // Democratic minus Republican, points
  // Swing is always against the last race for the same office: president against president, each 2026
  // Senate seat against its own previous race.
  const baselineOf = () => sameOffice[state.e] || null;
  const isWeight = () => state.c === 'weight';
  const isMargin = () => state.c === 'margin' || (state.c === 'swing' && !baselineOf());
  const swingOf = (f) => {
    const b = baselineOf(); if (!b) return null;
    const m1 = margin(elections[state.e].data[f]), m0 = margin(elections[b].data[f]);
    return m1 == null || m0 == null ? null : m1 - m0;
  };
  const colourRaw = (f) => {
    const v = elections[state.e].data[f];
    if (!v) return NODATA;
    if (isWeight()) { const x = effOf(f); return x ? rgb(towardW(Math.log2(x.r), WEIGHT_MAX)) : NODATA; }
    if (isMargin()) return rgb(toward(margin(v), MARGIN_MAX));
    const s = swingOf(f); return s == null ? NODATA : rgb(toward(s, SWING_MAX));
  };
  // Exact counties: outside a selection, colours fade toward the page (35% of the colour).
  const colourOf = (f) => {
    const c = colourRaw(f), sel = selection();
    if (!sel || sel.counties.has(f)) return c;
    return c.map((x, i) => Math.round(x + (PAGE[i] - x) * 0.65));
  };

  // ---------- power weights: a state's electoral votes (or two Senate seats) per vote cast, against the average ----------
  // Average over the states with results in the election in view. Alaska has no county data; where its certified
  // statewide total is in effective.json (stateOnly) it counts in the average, though it has no county to raise.
  const weightCache = {};
  const weightsFor = (e, kind) => {
    const key = e + kind; if (weightCache[key]) return weightCache[key];
    const V = {};
    for (const [f, v] of Object.entries(elections[e].data)) { const st = meta[f] && meta[f].st; if (st) V[st] = (V[st] || 0) + v[0]; }
    const so = (eff.elections[e] && eff.elections[e].stateOnly) || {};
    for (const [st, x] of Object.entries(so)) V[st] = x.votes;
    // Electoral votes in force: the 2010 apportionment through the 2020 elections, the 2020 one from 2022.
    const ev = bal.ev[e] || (elections[e].year >= 2022 ? bal.ev.pres2024 : bal.ev.pres2016);
    const S = Object.keys(V).filter((st) => V[st] > 0 && (kind === 'ev' ? ev[st] > 0 : st !== 'DC'));
    const sumV = S.reduce((a, st) => a + V[st], 0), sumP = kind === 'ev' ? S.reduce((a, st) => a + ev[st], 0) : 2 * S.length;
    const factor = {};
    for (const st of S) factor[st] = ((kind === 'ev' ? ev[st] : 2) / V[st]) / (sumP / sumV);
    const ranked = S.slice().sort((a, b) => factor[b] - factor[a]);
    return (weightCache[key] = { factor, hi: ranked[0], lo: ranked[ranked.length - 1], n: S.length });
  };
  const weighted = () => (!elections[state.e].house && (state.h === 'ev' || state.h === 'sen') ? weightsFor(state.e, state.h) : null);

  // ---------- effective vote (effective.json, build_effective.py) ----------
  // For county f in state s: electoral votes behind it evc = EV_s * pop_f / pop_s; weight per vote = evc / votes,
  // as a ratio to the national average E / V; that ratio is exactly B_s * N_f * T_f (see the About drawer).
  const V24 = Object.values(elections.pres2024.data).reduce((a, v) => a + v[0], 0);
  const effCol = (b) => (b === '2010' ? 0 : 1);
  const evcOf = (f, b) => { const c = eff.county[f], st = meta[f] && meta[f].st; return c && st && eff.ev[b][st] ? eff.ev[b][st] * c[effCol(b)] / eff.stPop[b][st] : 0; };
  // Represented population as a volume: the county's share of the apportioned electoral votes, in units of
  // President 2024's total votes, so the scale stays put from one election to the next.
  const repVotesOf = (f, e = state.e) => { const E = eff.elections[e]; return E ? V24 * evcOf(f, E.basis) / eff.rep[E.basis].E : 0; };
  const effCache = {};
  const effOf = (f, e = state.e) => {
    const E = eff.elections[e]; if (!E) return null;
    const m = (effCache[e] ||= {});
    if (f in m) return m[f];
    const v = elections[e].data[f], c = eff.county[f]; if (!v || !v[0] || !c) return (m[f] = null);
    const b = E.basis, st = meta[f].st, pop = c[effCol(b)], cvap = c[2 + effCol(b)], evc = evcOf(f, b);
    return (m[f] = { r: evc / v[0] / E.A, B: (eff.ev[b][st] / eff.stPop[b][st]) / (E.E / E.P), N: (pop / cvap) / E.Nnat, T: (cvap / v[0]) / E.Tnat,
      pop, cvap, votes: v[0], ppv: pop / v[0], u18: b === '2020' && c[4] ? 1 - c[4] / pop : null, basis: b, cvapLabel: E.cvap });
  };
  const multFor = (e) => { if (!eff.elections[e]) return null; const o = {}; for (const [f, v] of Object.entries(elections[e].data)) if (v[0]) o[f] = repVotesOf(f, e) / v[0]; return o; };
  const effShown = () => isWeight() || state.h === 'pop' || state.l === 'worth';

  // ---------- heights ----------
  const votesOf = (f) => {
    const v = elections[state.e].data[f]; if (!v) return 0;
    if (state.h === 'pop') return repVotesOf(f);
    const w = weighted(); if (w) return v[0] * (w.factor[meta[f].st] || 0);
    // Net margin: Democratic minus Republican votes, signed so the chosen party's wins stand up.
    if (state.h === 'net') return (v[2] - v[1]) * (state.u === 'r' ? -1 : 1);
    return state.h === 'dem' ? v[2] : state.h === 'rep' ? v[1] : v[0];
  };
  // Per-county scale: height proportional to the county's own total, the largest county in any election
  // standing as tall as the densest county does per square mile.
  const KC = (() => { let mx = 0; for (const o of order) for (const v of Object.values(elections[o].data)) mx = Math.max(mx, v[0]); return el.maxHeight / mx; })();
  // Net margin per county is scaled to the largest county margin of either party, so both sides fill the height.
  const KCN = (() => { let mx = 0; for (const o of order) for (const v of Object.values(elections[o].data)) mx = Math.max(mx, Math.abs(v[2] - v[1])); return el.maxHeight / mx; })();
  const kcOf = () => (state.h === 'net' ? KCN : KC);
  const heightOf = (f) => (state.d === '2d' ? 0 : state.n === 'county' ? kcOf() * votesOf(f) : k * votesOf(f) / meta[f].a);

  // One row per county for the flat views and the table: votes [T, R, D], margin, swing and the baseline's votes.
  let rowsCache = null;
  const rowsNow = () => {
    const key = state.e + '|' + baselineOf();
    if (rowsCache && rowsCache.key === key) return rowsCache.rows;
    const d = elections[state.e].data, b = baselineOf(), bd = b ? elections[b].data : null;
    const rows = Object.keys(meta).map((f) => { const v = d[f] || null; return { f, st: meta[f].st, v, m: margin(v), s: swingOf(f), b: bd ? bd[f] || null : null }; });
    rowsCache = { key, rows };
    return rows;
  };

  // "the 2020 Senate race" for a state, or "President 2020".
  const baselineLabel = (st) => {
    const b = baselineOf(); if (!b) return '';
    if (b === 'senprior') return st && elections.senprior.priorYears[st] ? `the ${elections.senprior.priorYears[st]} Senate race` : 'the previous Senate race';
    if (b === 'govprior') return st && elections.govprior.priorYears[st] ? `the ${elections.govprior.priorYears[st]} governor's race` : 'the previous governor\'s race';
    return elections[b].label;
  };

  return { officeOf, margin, baselineOf, baselineLabel, isWeight, isMargin, swingOf, colourRaw, colourOf, weightsFor, weighted,
    V24, repVotesOf, effOf, multFor, effShown, votesOf, kcOf, heightOf, rowsNow };
}
