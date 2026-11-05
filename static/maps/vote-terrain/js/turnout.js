/* Turnout drop-off and ticket splitting (pure): the arithmetic behind the Drop-off and Split tabs, the drop-off colour
   mode, their tables and the saved views' captions. Reads only the page's county results.

   Drop-off: for a midterm year (2022 or 2026), each county's votes in the top race on that state's ballot as a share of its
   votes for President two years before (2020 or 2024). The top race is the Senate race where the state has Senate county
   results in the page that year, otherwise the governor's race; a state with neither is left out and listed in noRace.
   A county needs both results. Margin is the Democratic minus Republican votes over the race's votes, in points.
   The reference band (band) is one year's pattern: in bins of margin, the median share and the middle 80 percent.

   Ticket splitting: for a year with both races (2026), the counties of states with Senate and governor county results:
   the Senate margin minus the governor margin, positive where the Senate result was more Democratic. */
export const DROP = {
  2026: { base: 'pres2024', sen: 'sen2026', gov: 'gov2026' },
  2022: { base: 'pres2020', sen: 'sen2022', gov: 'gov2022' },
};
export const DROP_MAX = 0.5;   // colour scale: log2 of a county's share over the all-county share; the ends are x0.71 and x1.41
const BIN = 10, MIN_BIN = 15;
const marginOf = (v) => (v && v[0] > 0 ? (v[2] - v[1]) / v[0] * 100 : null);

export function createTurnout({ elections, meta }) {
  const states = [...new Set(Object.values(meta).map((m) => m.st))].sort();
  const cache = {};
  const stOf = (e) => { const s = new Set(); for (const f of Object.keys(elections[e].data)) if (meta[f]) s.add(meta[f].st); return s; };
  const drop = (year) => {
    const D = DROP[year]; if (!D) return null;
    if (cache[year]) return cache[year];
    const sen = stOf(D.sen), gov = stOf(D.gov), race = {};
    for (const st of states) race[st] = sen.has(st) ? 'sen' : gov.has(st) ? 'gov' : null;
    const rows = [], byF = {};
    for (const f of Object.keys(meta)) {
      const st = meta[f].st, r = race[st]; if (!r) continue;
      const v = elections[D[r]].data[f], b = elections[D.base].data[f];
      if (!v || !b || !(v[0] > 0) || !(b[0] > 0)) continue;
      const row = { f, st, race: r, v, b, r: v[0] / b[0], m: marginOf(v) };
      rows.push(row); byF[f] = row;
    }
    const sv = rows.reduce((a, x) => a + x.v[0], 0), sb = rows.reduce((a, x) => a + x.b[0], 0);
    const per = {};
    for (const x of rows) { const p = (per[x.st] ||= { st: x.st, race: x.race, n: 0, v: 0, b: 0 }); p.n++; p.v += x.v[0]; p.b += x.b[0]; }
    return (cache[year] = { year, ...D, rows, byF, all: sv / sb, votes: sv, baseVotes: sb, race, noRace: states.filter((s) => !race[s]), per: Object.values(per).sort((a, b) => a.st.localeCompare(b.st)),
      nSen: Object.values(per).filter((p) => p.race === 'sen').length, nGov: Object.values(per).filter((p) => p.race === 'gov').length });
  };
  // The year a county view colours by: the election in view when it is a midterm year, else 2026.
  const yearOf = (e) => { const y = elections[e] && elections[e].year; return DROP[y] ? y : 2026; };
  const value = (f, year) => { const d = drop(year), x = d && d.byF[f]; return x ? Math.log2(x.r / d.all) : null; };
  // Bins of margin: median share and the 10th to 90th percentile, for bins of at least MIN_BIN counties.
  const q = (xs, p) => { const s = xs.slice().sort((a, b) => a - b), i = (s.length - 1) * p, lo = Math.floor(i); return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (i - lo); };
  const band = (year) => {
    const d = drop(year), bins = new Map();
    for (const x of d.rows) { const k = Math.floor(x.m / BIN); (bins.get(k) || bins.set(k, []).get(k)).push(x.r); }
    return [...bins].filter(([, rs]) => rs.length >= MIN_BIN).sort((a, b) => a[0] - b[0])
      .map(([k, rs]) => ({ x0: k * BIN, x1: k * BIN + BIN, x: k * BIN + BIN / 2, n: rs.length, lo: q(rs, 0.1), med: q(rs, 0.5), hi: q(rs, 0.9) }));
  };
  // A year's counties against another year's band: how many sit below, inside and above it (counties in bins the band covers).
  const compare = (year, ref) => {
    const B = band(ref), by = new Map(B.map((b) => [b.x0, b])), out = { n: 0, below: 0, above: 0, within: 0 };
    for (const x of drop(year).rows) { const b = by.get(Math.floor(x.m / BIN) * BIN); if (!b) continue; out.n++; if (x.r < b.lo) out.below++; else if (x.r > b.hi) out.above++; else out.within++; }
    return out;
  };
  // Ticket splitting, 2026: Senate and governor in the same state.
  let splitCache = null;
  const split = () => {
    if (splitCache) return splitCache;
    const S = elections.sen2026.data, G = elections.gov2026.data, both = [...stOf('sen2026')].filter((s) => stOf('gov2026').has(s)).sort();
    const rows = [];
    for (const f of Object.keys(meta)) {
      if (!both.includes(meta[f].st)) continue;
      const a = S[f], g = G[f], ms = marginOf(a), mg = marginOf(g); if (ms == null || mg == null) continue;
      rows.push({ f, st: meta[f].st, sen: a, gov: g, ms, mg, d: ms - mg, v: Math.min(a[0], g[0]) });
    }
    const per = both.map((st) => { const rs = rows.filter((r) => r.st === st), ds = rs.map((r) => r.d).sort((a, b) => a - b);
      return { st, n: rs.length, med: q(ds, 0.5), rs, senWin: statewide(rs, 'sen'), govWin: statewide(rs, 'gov') }; }).filter((p) => p.n);
    return (splitCache = { rows, states: per.map((p) => p.st), per, byF: Object.fromEntries(rows.map((r) => [r.f, r])), absMax: 30 });
  };
  const statewide = (rs, k) => { let r = 0, d = 0; for (const x of rs) { r += x[k][1]; d += x[k][2]; } return d > r ? 'D' : 'R'; };
  return { drop, yearOf, value, band, compare, split, marginOf, DROP, DROP_MAX };
}
