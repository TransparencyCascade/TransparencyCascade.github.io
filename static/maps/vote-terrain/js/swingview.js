/* Margin against swing (pure): each county's margin in the baseline election against its swing since then, and
   the running median of the swing across the political spectrum. The Scatter view's second chart (state.sx = ms),
   its selection rules g:<x0>,<x1>,<y0>,<y1> (a box, in points) and n:<quadrant>, its table and the saved views'
   captions use these.
   x: the Democratic margin (points of the county's votes) in the baseline election, positive Democratic.
   y: the swing: the margin now minus x, positive toward Democrats.
   Running median: counties sorted by x; at each, the median swing of the `win` counties nearest in x. */
export const QUADS = {
  ne: (x, y) => x > 0 && y > 0, se: (x, y) => x > 0 && y <= 0, nw: (x, y) => x <= 0 && y > 0, sw: (x, y) => x <= 0 && y <= 0,
};
const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
// rows: the model's per-county rows ({ f, v, m, s, b }); a county needs a result now and in the baseline.
export const msRows = (rows, margin) => rows.filter((r) => r.v && r.b && r.b[0] > 0 && r.s != null).map((r) => ({ ...r, x: margin(r.b), y: r.s }));
export const windowOf = (n) => Math.max(25, Math.round(n * 0.05));
export const running = (R) => {
  const P = R.slice().sort((a, b) => a.x - b.x), n = P.length, w = windowOf(n), h = Math.floor(w / 2), out = [];
  for (let i = 0; i < n; i++) { const lo = Math.max(0, Math.min(i - h, n - w)), hi = Math.min(n, lo + w); out.push({ x: P[i].x, y: median(P.slice(lo, hi).map((p) => p.y)) }); }
  return { line: out, window: Math.min(w, n) };
};
export const summarize = (R) => {
  const rep = R.filter((r) => r.x <= 0), dem = R.filter((r) => r.x > 0), med = (a) => median(a.map((r) => r.y));
  return { n: R.length, medAll: med(R), medR: med(rep), medD: med(dem), nR: rep.length, nD: dem.length,
    toR: R.filter((r) => r.y <= 0).length, toD: R.filter((r) => r.y > 0).length, window: windowOf(R.length) };
};
