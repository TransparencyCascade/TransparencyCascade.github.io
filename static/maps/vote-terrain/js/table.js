/* Table: the numbers behind the view in use, as in the tooltip. On the House track: one row per district
   (Districts) or per state (Seats and votes). History: one row per census, then one per presidential election. */
import { fmt, esc, countyLabelOf, $ } from './util.js';

export function createTable({ geo, el, state, model, house, history, selection, effW, pctCh, OFFICE_NAME, stName }) {
  const { meta } = geo, { elections } = el;
  const wrap = $('tableWrap'), table = $('table');
  let sort = { k: 2, dir: -1 };
  const lead = (x) => (x == null ? '' : (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1));
  const signedPct = (p) => (p == null ? '' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%');
  // House columns: [heading, value, format].
  const houseCols = (h) => (effW() === 'seats' ? [
    ['State', (r) => stName(r.st), String], ['Districts', (r) => r.s.districts, fmt],
    ['Dem. share of two-party vote', (r) => r.s.dshare, (x) => (x == null ? '' : x.toFixed(1) + '%')],
    ['Dem. seats', (r) => r.s.seatsD, fmt], ['Rep. seats', (r) => r.s.seatsR, fmt],
    ['Dem. share of seats', (r) => (r.s.seatsD + r.s.seatsR ? r.s.seatsD / (r.s.seatsD + r.s.seatsR) * 100 : null), (x) => (x == null ? '' : x.toFixed(1) + '%')],
    ['Captured seats', (r) => r.s.captured, fmt], ['Captured votes', (r) => r.s.capv, fmt],
    ['Captured, % of votes', (r) => (r.s.T ? r.s.capv / r.s.T * 100 : null), (x) => (x == null ? '' : x.toFixed(1) + '%')],
    ['Efficiency gap', (r) => r.s.eg, (x) => (x == null ? 'not computed' : `${Math.abs(x).toFixed(1)}, tilts to ${x >= 0 ? 'Rep.' : 'Dem.'}`)],
  ] : [
    ['District', (r) => `${r.st}-${r.n}`, String], ['Votes', (r) => r.T, fmt], ['Republican', (r) => r.R, fmt], ['Democratic', (r) => r.D, fmt],
    ['Margin', (r) => r.m, lead], ['Winner', (r) => (r.w ? r.w + (h.year === '2026' && r.status !== 'called' ? ' (leading)' : '') : 'undecided'), String],
    ['Band', (r) => (r.band === 'apart' ? `apart: ${r.reason}` : r.band), String],
    ['At risk below', (r) => h.lines[r.st].atRisk, (x) => x.toFixed(1)], ['Captured above', (r) => h.lines[r.st].captured, (x) => x.toFixed(1)],
    ['Captured votes', (r) => r.capv || null, (x) => (x == null ? '' : fmt(x))],
  ]);
  const renderHouse = () => {
    const h = house.now(), sel = selection(), seats = effW() === 'seats';
    const sts = sel ? new Set(sel.states || [...sel.counties].map((f) => meta[f].st)) : null;
    let rs = seats ? Object.entries(h.states).map(([st, s]) => ({ st, s })) : h.districts.slice();
    if (sts) rs = rs.filter((r) => sts.has(r.st));
    const cols = houseCols(h);
    if (sort.k >= cols.length) sort = { k: 1, dir: -1 };
    const get = cols[sort.k][1];
    rs.sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c, 'en', { numeric: true }) : a - c) * sort.dir; });
    $('tableTitle').textContent = `${sts ? 'Selected states' : seats ? 'Every state' : 'Every district'}, ${h.label}${h.unofficial ? ' (unofficial)' : ''}`;
    $('tableNote').textContent = `${fmt(rs.length)} ${seats ? (rs.length === 1 ? 'state' : 'states') : rs.length === 1 ? 'district' : 'districts'}. Plausible swing: ${h.plausible.label}. Click a heading to sort.`;
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  };
  // History: the three series, each with its own heading row.
  const renderHistory = () => {
    const H = history, sec = (t, n) => `<tr><th colspan="${n}">${esc(t)}</th></tr>`;
    $('tableTitle').textContent = 'History: residents per House seat, the smallest change, and the weight of a vote';
    $('tableNote').textContent = H.sources.starts;
    table.innerHTML = '<tbody>' + sec('Residents per House seat (apportionment population), at each census', 5) +
      '<tr><th>Census</th><th>Seats</th><th>Per seat, national</th><th>Fewest per seat</th><th>Most per seat</th></tr>' +
      H.perSeat.map((e) => `<tr><td>${e.year}</td><td>${e.seats}</td><td>${fmt(e.perSeat)}</td><td>${esc(stName(e.lo))} ${fmt(e.states[e.lo].perSeat)}</td><td>${esc(stName(e.hi))} ${fmt(e.states[e.hi].perSeat)}</td></tr>`).join('') +
      sec('The smallest change: fewest votes that would have changed each presidential election', 5) +
      '<tr><th>Election</th><th>Winner</th><th>Votes</th><th>States</th><th>By state</th></tr>' +
      H.smallest.map((s) => `<tr><td>${s.year}</td><td>${esc(s.winner)}</td><td>${fmt(s.votes)}</td><td>${s.states.length}</td><td>${esc(Object.entries(s.perState).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${st} ${fmt(n)}`).join(', '))}</td></tr>`).join('') +
      sec('The weight of a vote: residents per senator, and electoral votes per vote cast (census in force)', 4) +
      '<tr><th>Election</th><th>Census</th><th>Residents per senator</th><th>Electoral votes per vote cast</th></tr>' +
      H.weight.map((w) => `<tr><td>${w.year}</td><td>${w.census}</td><td>${w.senate.ratio.toFixed(1)}×: ${esc(stName(w.senate.big))} ${fmt(w.senate.bigPop)} against ${esc(stName(w.senate.small))} ${fmt(w.senate.smallPop)}</td><td>${w.ev.ratio.toFixed(2)}×: ${esc(stName(w.ev.hi))} (${w.ev.hiEv} for ${fmt(w.ev.hiVotes)}) against ${esc(stName(w.ev.lo))} (${w.ev.loEv} for ${fmt(w.ev.loVotes)})</td></tr>`).join('') + '</tbody>';
  };
  const render = () => {
    if (effW() === 'history') return renderHistory();
    if (house.isHouse()) return renderHouse();
    const b = model.baselineOf(), w = effW(), sel = selection();
    let rs = model.rowsNow().filter((r) => r.v);
    if (sel) rs = rs.filter((r) => sel.counties.has(r.f));
    const effOf = model.effOf;
    const cols = [
      ['County', (r) => countyLabelOf(meta, r.f).replace(/, \w\w$/, ''), String], ['State', (r) => r.st, String],
      ['Votes', (r) => r.v[0], fmt], ['Republican', (r) => r.v[1], fmt], ['Democratic', (r) => r.v[2], fmt],
      ['Margin', (r) => r.m, lead],
      ...(b ? [['Swing', (r) => r.s, (s) => (s == null ? '' : `${Math.abs(s).toFixed(1)} to ${s >= 0 ? 'D' : 'R'}`)]] : []),
      ...(b && w === 'scatter' ? [['Rep. votes', (r) => (r.b && r.b[1] > 0 ? pctCh(r.v[1], r.b[1]) : null), signedPct],
        ['Dem. votes', (r) => (r.b && r.b[2] > 0 ? pctCh(r.v[2], r.b[2]) : null), signedPct]] : []),
      ...(model.effShown() ? [['Residents per vote', (r) => (effOf(r.f) || {}).ppv, (x) => (x == null ? '' : x.toFixed(2))],
        ...[['Weight per vote', 'r'], ['State EV per resident', 'B'], ['Residents per eligible', 'N'], ['Eligible per vote', 'T']]
          .map(([name, key]) => [name, (r) => (effOf(r.f) || {})[key], (x) => (x == null ? '' : x.toFixed(2) + '×')])] : []),
    ];
    if (sort.k >= cols.length) sort = { k: 2, dir: -1 };
    const get = cols[sort.k][1];
    rs = rs.slice().sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    $('tableTitle').textContent = `${sel ? 'Selected counties' : 'Every county'}, ${elections[state.e].label}`;
    $('tableNote').textContent = `${fmt(rs.length)} ${rs.length === 1 ? 'county' : 'counties'}` + (b ? `. Swing in points since ${model.baselineLabel()}` : '') +
      (b && w === 'scatter' ? '; vote changes in percent since the same race' : '') + '. Click a heading to sort.';
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      (rs.length ? rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('')
        : `<tr><td colspan="${cols.length}">No ${OFFICE_NAME[model.officeOf(state.e)].toLowerCase()} race with county results here in ${elections[state.e].year}.</td></tr>`) + '</tbody>';
  };
  table.addEventListener('click', (ev) => {
    const th = ev.target.closest('th'); if (!th) return;
    const k = +th.dataset.k; sort = { k, dir: sort.k === k ? -sort.dir : k < 2 ? 1 : -1 }; render();
  });
  const open = () => { wrap.hidden = false; render(); $('tableClose').focus(); };
  const close = () => { wrap.hidden = true; };
  const toggle = () => (wrap.hidden ? open() : close());
  $('tableBtn').addEventListener('click', toggle);
  $('tableClose').addEventListener('click', close);
  return { render, open, close, toggle, isOpen: () => !wrap.hidden, refresh: () => { if (!wrap.hidden) render(); } };
}
