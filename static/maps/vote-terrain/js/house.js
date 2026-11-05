/* The House track (house.json, build_house.py): results by district for 2022, 2024 and 2026, and the bands
   the district views draw, recomputed whenever the plausible swing changes.
   One setting, the plausible swing (state.ps: points, or 'state' for each state's own median observed swing;
   empty for the default, the national median observed swing):
     at risk: a held seat whose margin is below the plausible swing;
     captured: a margin above the state's largest observed swing, or above the plausible swing when higher;
     contestable: between. Seats without a Democrat and a Republican are kept apart.
   Captured votes: in a captured seat, the winner's votes beyond what a margin at the captured line needs,
   plus all the runner-up's. */
export const PS_MIN = 1, PS_MAX = 30;
export const parsePs = (v) => (v === 'state' ? 'state' : v !== '' && isFinite(+v) && +v >= PS_MIN && +v <= PS_MAX ? String(+v) : '');

export function createHouse({ data, state, elections }) {
  const etTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' });
  const asof = etTime(data.asof2026) + ' ET';
  const ids = data.years.map((y) => 'house' + y);
  // The page's election entries for the House track: no county data, so the county views stand down.
  const elections_ = Object.fromEntries(data.years.map((y) => ['house' + y, { label: `House ${y}`, office: 'U.S. House', year: +y, data: {}, house: true,
    unofficial: y === '2026', source: `${data.sources[y]}. District file: ${data.csv}.`,
    notes: ['House results are by district, so the views that need county results (Terrain, Circles, People, Arrows, Swing strips, Scatter) stand down',
      'Bands use swings only between elections on the same lines; several states redrew between 2022 and 2026',
      ...(y === '2026' ? ['Louisiana\'s Nov. 3 races were an open primary; its runoffs are on Dec. 12'] : [])] }]));
  const isHouse = () => !!(elections[state.e] && elections[state.e].house);
  // The plausible swing in force: { value (null for 'state'), mode, label }.
  const plausible = () => {
    if (state.ps === 'state') return { value: null, mode: 'state', label: 'each state\'s own median observed swing' };
    if (state.ps) return { value: +state.ps, mode: 'set', label: `${+state.ps} points (default: national median observed swing, ${data.plausible.value} points)` };
    return { value: data.plausible.value, mode: 'default', label: `default: national median observed swing, ${data.plausible.value} points` };
  };
  const cache = {};
  const now = () => {
    const y = String(elections[state.e].year), P = plausible(), key = y + '|' + P.mode + '|' + P.value;
    if (cache[key]) return cache[key];
    const states = {};
    for (const [st, s] of Object.entries(data.states[y])) states[st] = { ...s, captured: 0, capv: 0, apart: 0, atRisk: 0, contestable: 0 };
    const lines = {};
    const districts = data.districts.map((d) => {
      const [R, D, T, m, w] = d.y[y], t = data.threshold[d.st], s = states[d.st];
      const ps = P.mode === 'state' ? t.median : P.value, cap = Math.max(t.largest, ps);
      lines[d.st] = { atRisk: ps, captured: cap };
      const reason = (d.reason || {})[y] || '';
      let band = 'apart', capv = 0;
      if (!reason && m != null) {
        const a = Math.abs(m);
        band = a > cap ? 'captured' : a < ps ? 'at risk' : 'contestable';
        if (band === 'captured') capv = Math.round((a - cap) / 100 * T / 2 + Math.min(R, D));
      }
      s[band === 'at risk' ? 'atRisk' : band] += 1;
      s.capv += capv;
      return { st: d.st, n: d.n, R, D, T, m, w, band, capv, reason, sw: d.sw, status: y === '2026' ? d.status2026 : 'final' };
    });
    return (cache[key] = { year: y, label: `House ${y}`, unofficial: y === '2026', asof, districts, states, thr: data.threshold, lines,
      national: data.national, plausible: P, data });
  };
  const howPs = () => `How it was set: ${data.plausible.how}.`;
  return { data, ids, elections: elections_, isHouse, plausible, now, howPs };
}
