/* Overlays from our own research (overlays.json, tools/vote-terrain/build_overlays.py): a set of counties per layer
   (DOJ election monitors, ICE detention facilities), marked on every county view, and a comparison of their swing
   with matched counties that are not in the layer. One layer at a time (state.ov). Owns no DOM.

   The comparison, for an election with a baseline (its last race for the same office): each county's swing is its
   Democratic margin minus its margin in the baseline. Counties are grouped by state, by lean band (baseline margin:
   Democrat ahead; Republican ahead by 0-20, 20-40, 40 or more points) and by size band (baseline votes: under 10,000;
   10,000-50,000; 50,000-200,000; 200,000 or more). In each group holding both kinds, the layer's counties are
   compared with the group's other counties, each of those weighted so the group counts as much as its layer counties
   do; layer counties with no such neighbour are left out and counted. The figures are medians of county swings
   (counties unweighted by size). They describe the two groups; they say nothing about why they differ. */
export const OV_LAYERS = ['monitors', 'detention'];

export function createOverlays({ data, meta, elections, sameOffice }) {
  const sets = Object.fromEntries(OV_LAYERS.map((k) => [k, new Set(Object.keys(data.layers[k].counties))]));
  const margin = (v) => (v && v[0] ? (v[2] - v[1]) / v[0] * 100 : null);
  const lean = (v) => { const m = (v[1] - v[2]) / v[0] * 100; return m < 0 ? 'D ahead' : m < 20 ? 'R+0 to 20' : m < 40 ? 'R+20 to 40' : 'R+40 or more'; };
  const size = (v) => (v[0] < 1e4 ? 'under 10k' : v[0] < 5e4 ? '10k to 50k' : v[0] < 2e5 ? '50k to 200k' : '200k or more');
  const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
  const wmedian = (xs) => {   // [[value, weight]]: the value at which half the weight lies on each side
    const s = xs.slice().sort((a, b) => a[0] - b[0]), T = s.reduce((a, x) => a + x[1], 0); let c = 0;
    for (let i = 0; i < s.length; i++) { c += s[i][1]; if (c >= T / 2 - 1e-9) return c > T / 2 + 1e-9 || i === s.length - 1 ? s[i][0] : (s[i][0] + s[i + 1][0]) / 2; }
    return null;
  };
  const cache = {};
  // { inN, outN, inMed, outMed, diff, cells, unmatched, rawIn, rawOut, rawInN, rawOutN } or null (no baseline / no counties).
  const compare = (k, e) => {
    const key = k + '|' + e; if (key in cache) return cache[key];
    const b = sameOffice[e], E = elections[e];
    if (!b || !E || E.house) return (cache[key] = null);
    const d = E.data, bd = elections[b].data, S = sets[k], cells = {};
    const rawIn = [], rawOut = [];
    for (const f of Object.keys(d)) {
      const v = d[f], v0 = bd[f]; if (!meta[f] || !v || !v[0] || !v0 || !v0[0]) continue;
      const s = margin(v) - margin(v0), c = meta[f].st + '|' + lean(v0) + '|' + size(v0);
      const cell = (cells[c] ||= { inn: [], out: [] });
      (S.has(f) ? cell.inn : cell.out).push({ f, s });
      (S.has(f) ? rawIn : rawOut).push(s);
    }
    const inS = [], outW = [], outF = new Set(); let unmatched = 0, nc = 0;
    for (const cell of Object.values(cells)) {
      if (!cell.inn.length) continue;
      if (!cell.out.length) { unmatched += cell.inn.length; continue; }
      nc++;
      for (const x of cell.inn) inS.push(x.s);
      const w = cell.inn.length / cell.out.length;
      for (const x of cell.out) { outW.push([x.s, w]); outF.add(x.f); }
    }
    if (!inS.length) return (cache[key] = rawIn.length ? { inN: 0, outN: 0, unmatched, cells: 0, rawIn: median(rawIn), rawOut: median(rawOut), rawInN: rawIn.length, rawOutN: rawOut.length } : null);
    const inMed = median(inS), outMed = wmedian(outW);
    return (cache[key] = { inN: inS.length, outN: outF.size, inMed, outMed, diff: inMed - outMed, cells: nc, unmatched,
      rawIn: median(rawIn), rawOut: median(rawOut), rawInN: rawIn.length, rawOutN: rawOut.length, base: b });
  };
  const layer = (k) => (OV_LAYERS.includes(k) ? data.layers[k] : null);
  const detail = (k, f) => { const L = layer(k), x = L && L.counties[f]; if (!x) return '';
    return k === 'detention' ? x.map(([n, adp]) => `${n} (${adp} a day)`).join('; ') : x.join('; '); };
  return { sets, layer, compare, detail, lean, size, bands: data.bands };
}
