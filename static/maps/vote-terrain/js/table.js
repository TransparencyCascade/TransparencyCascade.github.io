/* Table: the numbers behind the view in use, as in the tooltip. On the House track: one row per district
   (Districts) or per state (Seats and votes). History: one row per census, then one per presidential election.
   Simulator: one row per place on the election day (each state for president, each Senate race, each House district),
   with the swing at which it changes hands and its winner at the swing in force. Power: the chart in view (weight per
   vote by state; votes, electoral votes and Senate seats by state; or each party's concentration at fixed shares). */
import { fmt, esc, countyLabelOf, $ } from './util.js';
import * as Mn from './money.js';

export function createTable({ geo, el, state, model, house, history, funnelCols, funnelYear, money, peopleDots, selection, effW, pctCh, OFFICE_NAME, stName, simCtx, power, roadCtx, closestCtx, overlays, ovSet, ovSummary, turnout }) {
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
    $('tableTitle').textContent = 'History: residents per House seat, the smallest change, the tipping state against the nation, and the weight of a vote';
    $('tableNote').textContent = H.sources.starts;
    table.innerHTML = '<tbody>' + sec('Residents per House seat (apportionment population), at each census', 5) +
      '<tr><th>Census</th><th>Seats</th><th>Per seat, national</th><th>Fewest per seat</th><th>Most per seat</th></tr>' +
      H.perSeat.map((e) => `<tr><td>${e.year}</td><td>${e.seats}</td><td>${fmt(e.perSeat)}</td><td>${esc(stName(e.lo))} ${fmt(e.states[e.lo].perSeat)}</td><td>${esc(stName(e.hi))} ${fmt(e.states[e.hi].perSeat)}</td></tr>`).join('') +
      sec('The smallest change: fewest votes that would have changed each presidential election', 5) +
      '<tr><th>Election</th><th>Winner</th><th>Votes</th><th>States</th><th>By state</th></tr>' +
      H.smallest.map((s) => `<tr><td>${s.year}</td><td>${esc(s.winner)}</td><td>${fmt(s.votes)}</td><td>${s.states.length}</td><td>${esc(Object.entries(s.perState).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${st} ${fmt(n)}`).join(', '))}</td></tr>`).join('') +
      sec('The tipping state against the nation: its two-party margin minus the national two-party margin (Democratic positive)', 6) +
      '<tr><th>Election</th><th>National margin</th><th>Tipping state</th><th>Tipping state margin</th><th>Gap (points)</th><th>National margin over the state\'s</th></tr>' +
      H.bias.map((b) => `<tr><td>${b.year}</td><td>${b.nat.votes > 0 ? 'D' : 'R'}+${fmt(Math.abs(b.nat.votes))} (${Math.abs(b.nat.points).toFixed(1)} points)</td><td>${esc(b.tip.name)}, ${b.tip.ev}</td><td>${b.tip.votes > 0 ? 'D' : 'R'}+${fmt(Math.abs(b.tip.votes))} (${Math.abs(b.tip.points).toFixed(1)} points)</td><td>${b.gap > 0 ? 'D' : 'R'}+${Math.abs(b.gap).toFixed(1)}</td><td>${b.ratio >= 100 ? fmt(b.ratio) : b.ratio.toFixed(1)}×</td></tr>`).join('') +
      sec('The weight of a vote: residents per senator, and electoral votes per vote cast (census in force)', 4) +
      '<tr><th>Election</th><th>Census</th><th>Residents per senator</th><th>Electoral votes per vote cast</th></tr>' +
      H.weight.map((w) => `<tr><td>${w.year}</td><td>${w.census}</td><td>${w.senate.ratio.toFixed(1)}×: ${esc(stName(w.senate.big))} ${fmt(w.senate.bigPop)} against ${esc(stName(w.senate.small))} ${fmt(w.senate.smallPop)}</td><td>${w.ev.ratio.toFixed(2)}×: ${esc(stName(w.ev.hi))} (${w.ev.hiEv} for ${fmt(w.ev.hiVotes)}) against ${esc(stName(w.ev.lo))} (${w.ev.loEv} for ${fmt(w.ev.loVotes)})</td></tr>`).join('') + '</tbody>';
  };
  // Simulator: every place, the swing that flips it and its winner now.
  const renderSim = () => {
    const S = simCtx();
    if (!S) { $('tableTitle').textContent = 'Simulator'; $('tableNote').textContent = 'Loading…'; table.innerHTML = ''; return; }
    const { sim, P, s, rule, locked } = S, sel = selection();
    const sts = sel ? new Set(sel.states || [...sel.counties].map((f) => meta[f].st)) : null;
    const BODY = { pres: 'President', sen: 'Senate', house: 'House' };
    let rs = [...(P.pres || []), ...P.sen, ...(P.house || [])];
    if (sts) rs = rs.filter((p) => sts.has(p.st));
    const cols = [
      ['Race', (p) => BODY[p.body], String],
      ['Place', (p) => (p.body === 'pres' ? `${stName(p.st)} (${p.ev} EV)` : p.body === 'sen' ? `${stName(p.st)}${p.race.endsWith('special') ? ' (special)' : ''}` : `${p.st}-${p.n}`), String],
      ['Actual', (p) => p.actual || 'undecided', String],
      ['Two-party margin', (p) => (p.D > 0 && p.R > 0 ? sim.marginOf(p) : null), lead],
      ['Flips at', (p) => { const f = sim.flipAt(p, rule); return f == null ? null : f; }, (f) => (f == null ? 'held' : `${Math.abs(f).toFixed(2)} to ${f > 0 ? 'D' : 'R'}`)],
      ['At this swing', (p) => sim.winnerAt(p, s, rule, locked) || 'undecided', String],
      ['Note', (p) => (p.fixed ? `held: ${p.fixed}` : locked.has(p.st) ? 'locked' : p.body === 'house' ? p.band : ''), String],
    ];
    if (sort.k >= cols.length) sort = { k: 4, dir: 1 };
    const get = cols[sort.k][1];
    rs.sort((x, y) => { let a = get(x), c = get(y); if (sort.k === 4) { a = a == null ? null : Math.abs(a); c = c == null ? null : Math.abs(c); } if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c, 'en', { numeric: true }) : a - c) * sort.dir; });
    $('tableTitle').textContent = `Simulator, ${S.label}: ${s === 0 ? 'the actual result' : `${Math.abs(s).toFixed(1)} points toward ${s > 0 ? 'Democrats' : 'Republicans'}`} (${rule === 'p' ? 'proportional' : 'uniform'} swing)`;
    $('tableNote').textContent = `${fmt(rs.length)} races. Flips at: the swing in points of two-party margin at which the race changes hands. ${S.unofficial} Click a heading to sort.`;
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  };
  // Power: the chart in view, as rows.
  const renderPower = () => {
    const e = state.e, L = elections[e].label, sel = selection();
    const sts = sel ? new Set(sel.states || [...sel.counties].map((f) => meta[f].st)) : null;
    const x2 = (v) => (v == null ? '' : v.toFixed(2) + '×'), p2 = (v) => (v * 100).toFixed(2) + '%';
    let cols, rs;
    if (state.pc === 'conc') {
      const qs = [10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90, +state.pq].filter((q, i, a) => a.indexOf(q) === i).sort((a, b) => a - b);
      rs = qs.map((q) => ({ q, d: power.reach(e, 'd', q), r: power.reach(e, 'r', q) }));
      cols = [['Share of the party\'s votes', (r) => r.q, (q) => q + '%'], ['Democratic: counties', (r) => r.d && r.d.n, fmt], ['Democratic: share of land', (r) => r.d && r.d.land, p2],
        ['Republican: counties', (r) => r.r && r.r.n, fmt], ['Republican: share of land', (r) => r.r && r.r.land, p2]];
      $('tableTitle').textContent = `Concentration, ${L}: the counties holding each share of a party's votes, biggest first`;
      $('tableNote').textContent = `Counties with results only. The marker stands at ${state.pq}%.`;
    } else if (state.pc === 'tiles') {
      rs = power.states(e).rows.slice(); if (sts) rs = rs.filter((r) => sts.has(r.st));
      cols = [['State', (r) => stName(r.st), String], ['Votes cast', (r) => r.votes, fmt], ['Share of votes', (r) => r.share.votes, p2], ['Electoral votes', (r) => r.ev, fmt],
        ['Share of electoral votes', (r) => r.share.ev, p2], ['Senate seats', (r) => r.sen, fmt], ['Electoral weight per vote', (r) => r.evPerVote, x2], ['Senate weight per vote', (r) => (r.sen ? r.senPerVote : null), x2]];
      $('tableTitle').textContent = `Votes cast, electoral votes and Senate seats by state, ${L}`;
      $('tableNote').textContent = `${fmt(rs.length)} rows with results${rs.some((r) => r.stateOnly) ? ' (Alaska from its statewide total; it reports by House district)' : ' (Alaska left out: no statewide total for this race in the page)'}. Weight per vote: the state's share of electoral votes (or Senate seats) over its share of votes cast. Click a heading to sort.`;
    } else {
      rs = (power.rank(e) || []).slice(); if (sts) rs = rs.filter((r) => sts.has(r.st));
      cols = [['State', (r) => stName(r.st), String], ['Weight per vote', (r) => r.r, x2], ['State electoral votes per resident', (r) => r.B, x2], ['Residents per eligible citizen', (r) => r.N, x2], ['Eligible citizens per vote cast', (r) => r.T, x2]];
      $('tableTitle').textContent = `Weight per vote by state, ${L}`;
      $('tableNote').textContent = rs.length ? 'National average = 1. The three parts multiply back to the weight. Click a heading to sort.' : 'No census and citizen counts for this election in the page.';
    }
    if (sort.k >= cols.length) sort = { k: state.pc === 'conc' ? 0 : 1, dir: state.pc === 'conc' ? 1 : -1 };
    const get = cols[sort.k][1];
    rs.sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      rs.map((r) => '<tr>' + cols.map((c) => { const v = c[1](r); return `<td>${esc(v == null ? '' : c[2](v))}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
  };
  // Road to 270: the bar as rows, from the most Democratic result to the most Republican.
  const party = (x) => ({ D: 'Democratic', R: 'Republican' }[x] || '');
  const sRoad = { k: 0, dir: 1 }, sClosest = { k: 5, dir: 1 };
  const sortRows = (rs, cols, s) => rs.sort((x, y) => { const a = cols[s.k][1](x), c = cols[s.k][1](y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c, 'en', { numeric: true }) : a - c) * s.dir; });
  const head = (cols, s) => '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === s.k ? ` aria-sort="${s.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead>';
  const renderRoad = () => {
    const R = roadCtx(), sel = selection();
    if (!R || !R.road) { $('tableTitle').textContent = 'Road to 270'; $('tableNote').textContent = R ? `No ${R.body === 'pres' ? 'presidential' : 'Senate'} result for ${R.label} in the page.` : 'Loading…'; table.innerHTML = ''; return; }
    const r = R.road, evw = r.body === 'pres', sts = sel ? new Set(sel.states || [...sel.counties].map((f) => meta[f].st)) : null;
    let rs = r.segs.map((x, i) => ({ ...x, order: i + 1 }));
    if (sts) rs = rs.filter((x) => x.st && sts.has(x.st));
    const cols = [['Order', (x) => x.order, fmt], ['Place', (x) => x.name, String], [evw ? 'Electoral votes' : 'Seats', (x) => x.size, fmt], ['Winner', (x) => x.win, party],
      ['Margin, votes', (x) => x.votes, fmt], ['Margin, points', (x) => (x.points == null || x.kind === 'held' ? null : Math.abs(x.points)), (v) => v.toFixed(1)], ['Votes to flip', (x) => x.flip, fmt],
      ['Running total from the Democratic end', (x) => x.x1, fmt], ['Note', (x) => (x === r.tip ? 'tipping point' : x.kind === 'held' ? 'held' : x.fixed ? 'held at its result' : x.called === false ? 'leading, not called' : null), String]];
    sortRows(rs, cols, sRoad);
    $('tableTitle').textContent = `${evw ? 'Road to 270' : 'Road to 51'}, ${R.label}`;
    $('tableNote').textContent = `${fmt(rs.length)} rows, from the most Democratic result to the most Republican by two-party margin. ${evw ? `${r.need} electoral votes win.` : `${r.need} seats are a majority.`} Votes to flip: half the margin plus one. ${R.unofficial} Click a heading to sort.`;
    table.innerHTML = head(cols, sRoad) + '<tbody>' + rs.map((x) => '<tr>' + cols.map((c) => { const v = c[1](x); return `<td>${esc(v == null ? '' : c[2](v))}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
  };
  // Closest races: the view's rows, with the same columns.
  const renderClosest = () => {
    const C = closestCtx(), sel = selection();
    if (!C || !C.rows) { $('tableTitle').textContent = 'Closest races'; $('tableNote').textContent = C ? `No races for ${C.label} in the page.` : 'Loading…'; table.innerHTML = ''; return; }
    const sts = sel ? new Set(sel.states || [...sel.counties].map((f) => meta[f].st)) : null;
    let rs = C.rows.slice(); if (sts) rs = rs.filter((x) => sts.has(x.st));
    const OFF = { pres: 'President', sen: 'Senate', house: 'House', gov: 'Governor' };
    const cols = [['Office', (x) => OFF[x.office], String], ['Place', (x) => x.place, String], ['Winner', (x) => x.win, party], ['Margin, votes', (x) => x.votes, fmt],
      ['Margin, points', (x) => (x.points == null ? null : Math.abs(x.points)), (v) => v.toFixed(1)], ['Votes to flip', (x) => x.flip, fmt],
      ['Changed hands', (x) => C.races.label(x) || null, String], ['Note', (x) => x.note || null, String]];
    sortRows(rs, cols, sClosest);
    $('tableTitle').textContent = `Closest races, ${C.label}${C.office ? `: ${OFF[C.office]}` : ''}`;
    $('tableNote').textContent = `${fmt(rs.length)} races. Votes to flip: half the margin plus one. Changed hands: the winner against the previous race for the same office and seat in the data. ${C.unofficial} Click a heading to sort.`;
    table.innerHTML = head(cols, sClosest) + '<tbody>' + rs.map((x) => '<tr>' + cols.map((c) => { const v = c[1](x); return `<td>${esc(v == null ? '' : c[2](v))}</td>`; }).join('') + '</tr>').join('') + '</tbody>';
  };
  // Turnout drop-off: every county with both results, the race used and the share.
  const renderDropoff = () => {
    const y = turnout.yearOf(state.e), D = turnout.drop(y), sel = selection(), by = elections[D.base].year;
    let rs = D.rows.slice(); if (sel) rs = rs.filter((r) => sel.counties.has(r.f));
    const cols = [['County', (r) => countyLabelOf(meta, r.f).replace(/, \w\w$/, ''), String], ['State', (r) => r.st, String], ['Race used', (r) => (r.race === 'sen' ? 'Senate' : 'Governor'), String],
      [`${y} votes`, (r) => r.v[0], fmt], [`President ${by} votes`, (r) => r.b[0], fmt], ['Share', (r) => r.r * 100, (x) => x.toFixed(1) + '%'], ['Margin', (r) => r.m, lead]];
    if (sort.k >= cols.length) sort = { k: 5, dir: 1 };
    const get = cols[sort.k][1];
    rs.sort((x, z) => { const a = get(x), c = get(z); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    $('tableTitle').textContent = `Turnout drop-off, ${y} against ${by}${sel ? ': selected counties' : ''}`;
    $('tableNote').textContent = `${fmt(rs.length)} counties. Share: the county's votes in the top race on its state's ballot (Senate, else governor) over its President ${by} votes. All counties shown together: ${(D.all * 100).toFixed(1)}%. Race used: Senate in ${D.nSen} states, governor in ${D.nGov}; left out (no race with county results): ${D.noRace.join(', ')}. ${y === 2026 ? 'Unofficial. ' : ''}Click a heading to sort.`;
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(c[0])}</th>`).join('') + '</tr></thead><tbody>' +
      rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  };
  // Ticket splitting: both races' county results and their difference.
  const renderSplit = () => {
    const T = turnout.split(), sel = selection();
    let rs = T.rows.slice(); if (sel) rs = rs.filter((r) => sel.counties.has(r.f));
    const cols = [['County', (r) => countyLabelOf(meta, r.f).replace(/, \w\w$/, ''), String], ['State', (r) => r.st, String],
      ['Senate Dem.', (r) => r.sen[2], fmt], ['Senate Rep.', (r) => r.sen[1], fmt], ['Governor Dem.', (r) => r.gov[2], fmt], ['Governor Rep.', (r) => r.gov[1], fmt],
      ['Senate margin', (r) => r.ms, lead], ['Governor margin', (r) => r.mg, lead], ['Difference', (r) => r.d, (x) => `${Math.abs(x).toFixed(1)} to ${x >= 0 ? 'D' : 'R'}`]];
    if (sort.k >= cols.length) sort = { k: 8, dir: -1 };
    const get = cols[sort.k][1];
    rs.sort((x, z) => { let a = get(x), c = get(z); if (sort.k === 8) { a = a == null ? null : Math.abs(a); c = c == null ? null : Math.abs(c); } if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    $('tableTitle').textContent = `Ticket splitting, 2026 (unofficial)${sel ? ': selected counties' : ''}`;
    $('tableNote').textContent = `${fmt(rs.length)} counties in the ${T.states.length} states with both races. Difference: Senate margin minus governor margin, in points, toward the party whose Senate margin was higher; margins are Democratic minus Republican over the race's votes. Click a heading to sort.`;
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${esc(c[0])}</th>`).join('') + '</tr></thead><tbody>' +
      rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('') + '</tbody>';
  };
  // Money: the figures behind each chart, every one with its type: medians per cycle, the outside money by committee group (named for a race and not),
  // every Senate race, outspent and lost, and the donors.
  const renderMoney = () => {
    const D = money();
    if (!D) { $('tableTitle').textContent = 'Money'; $('tableNote').textContent = 'Loading the money data…'; table.innerHTML = ''; return; }
    const sec = (t, n) => `<tr><th colspan="${n}">${esc(t)}</th></tr>`, cyc = Mn.CYCLES, row = (cells) => '<tr>' + cells.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>', hd = (cells) => '<tr>' + cells.map((c) => `<th>${esc(c)}</th>`).join('') + '</tr>';
    $('tableTitle').textContent = 'Money: dollars per decisive vote, outside money by committee, outspent and lost, and individual donors to super PACs';
    $('tableNote').textContent = `Each figure's type is in its heading: spent (candidates' disbursements), outside (reported to the FEC as spent by others, for or against the candidates, or by party committees), received. 2026 is partial: committee summaries through ${D.coverage['2026'].committeeSummariesThrough}, itemized lines through ${D.coverage['2026'].itemizedLinesThrough}, and unofficial votes. Unreported money (501(c)(4) groups and other organizations that do not disclose) is not in these figures and is not estimated.`;
    const my = state.my || (state.mc === 'donors' ? '2026' : 'all'), dc = my === 'all' ? 2026 : +my;
    let h = '<tbody>' + sec('Median dollars per decisive vote, Senate races with dollars assigned (spent; spent plus party coordinated; spent plus party and independent expenditures naming the candidates)', 8) +
      hd(['Cycle', 'Races', 'Spent per vote to flip', '+ parties', '+ outside', 'Spent per vote moved', '+ parties', '+ outside']) +
      cyc.map((c) => row([c === 2026 ? '2026 (partial, unofficial)' : c, Mn.races(D, c, 'cand', 'flip').length, ...['flip', 'moved'].flatMap((d) => ['cand', 'party', 'out'].map((m) => Mn.usd(Mn.medianOf(D, c, m, d))))])).join('') +
      sec('Outside money as committee totals: disbursements (spent) and what a race can be named for (Schedule E, outside), by cycle, super PACs and hybrid PACs', 8) +
      hd(['Cycle', 'Super PAC receipts', 'Super PAC disbursements', 'Super PAC Schedule E', 'Super PAC, no race named', 'Hybrid disbursements', 'Hybrid Schedule E', 'Hybrid, no race named']) +
      cyc.map((c) => { const v = Mn.committees(D, c); return row([c === 2026 ? '2026 (partial)' : c, Mn.usd(v.superPac.receiptsUsd), Mn.usd(v.superPac.disbursementsUsd), Mn.usd(v.superPac.scheduleESummaryUsd), Mn.usd(v.superPac.notAllocatedToARaceUsd), Mn.usd(v.hybrid.disbursementsUsd), Mn.usd(v.hybrid.scheduleESummaryUsd), Mn.usd(v.hybrid.notAllocatedToARaceUsd)]); }).join('') +
      sec('Super PACs and hybrid PACs together, net of transfers and gross, through the pre-general report in each cycle (the same point: reports filed by election day, covering through the cycle\'s pre-general date) and for the whole cycle', 8) +
      hd(['Cycle and point', 'Disbursed, net of transfers', 'Disbursed, gross', 'Received, net', 'Received, gross', 'Schedule E (outside)', 'No race named, net', 'No race named, gross']) +
      [...Mn.PRE_CYCLES.map((c) => [c, true]), ...cyc.map((c) => [c, false])].map(([c, pre]) => { const n = Mn.outside(D, c, true, pre), g = Mn.outside(D, c, false, pre); return n && row([`${c} ${pre ? 'through ' + n.through : c === 2026 ? 'whole cycle so far (partial)' : 'whole cycle'}`, Mn.usd(n.disbursed), Mn.usd(g.disbursed), Mn.usd(n.received), Mn.usd(g.received), Mn.usd(n.allocated), Mn.usd(n.notAllocated), Mn.usd(g.notAllocated)]); }).join('') +
      sec('Party committees (types Y and Z): disbursements, Schedule E and coordinated expenditures (outside), the rest', 6) + hd(['Cycle', 'Receipts', 'Disbursements', 'Schedule E', 'Coordinated', 'No race named']) +
      cyc.map((c) => { const p = Mn.committees(D, c).party; return row([c, Mn.usd(p.receiptsUsd), Mn.usd(p.disbursementsUsd), Mn.usd(p.scheduleESummaryUsd), Mn.usd(p.partyCoordinatedUsd), Mn.usd(p.notAllocatedToARaceUsd)]); }).join('') +
      sec(`Outspent and lost, ${my === 'all' ? 'every cycle' : my}, money counted: ${Mn.COUNTS[state.mm]} (the Democratic side and the Republican side are the two candidates named in the vote record)`, 8) +
      hd(['Cycle', 'State', 'Democratic share of vote', 'Democratic side, $', 'Republican side, $', 'Democratic share of spending', 'Winner', 'Bigger spender lost']) +
      Mn.lostRows(D, my === 'all' ? null : +my, state.mm).map((x) => row([x.cycle, x.st, x.vd == null ? '' : (x.vd * 100).toFixed(1) + '%', Mn.usd(x.dUsd), Mn.usd(x.rUsd), (x.sd * 100).toFixed(1) + '%', x.winner === 'D' ? 'Democratic' : 'Republican', x.lost ? 'yes' : 'no'])).join('') +
      sec('Every Senate race: dollars (spent, outside) and decisive votes', 11) +
      hd(['Cycle', 'State', 'Winner', 'Votes to flip', 'Votes moved', 'Spent', 'Party coordinated (outside)', 'Independent expenditures (outside)', 'Spent per flip', 'With outside per flip', 'Votes']) +
      D.senate.filter((r) => r.money && r.decisive).map((r) => { const f = Mn.figures(r); return row([r.cycle + (r.special ? ' special' : ''), r.st, r.votes.D > r.votes.R ? 'Democratic' : 'Republican', fmt(r.decisive.flip), r.decisive.moved != null ? fmt(r.decisive.moved) : '', Mn.usd(f.spent), Mn.usd(f.coord), Mn.usd(f.ie), Mn.usd(Mn.perVote(r, 'cand', 'flip')), Mn.usd(Mn.perVote(r, 'out', 'flip')), M2votes(r)]); }).join('') +
      sec('Individual donors to super PACs (itemized cash), by cycle: concentration (2026 shares are lower bounds: the FEC has not itemized all its gifts yet)', 8) + hd(['Cycle', 'Super PAC receipts', 'Top 10 gave', 'Top 10 share', 'Top 100 gave', 'Top 100 share', 'Donors of $1 million or more', 'Itemized, share of individual gifts']) +
      Mn.donorCycles(D).map((c) => { const d = D.donors.cycles[c]; return row([c === 2026 ? '2026 (partial)' : c, Mn.usd(d.superPacReceiptsUsd), Mn.usd(d.top10Usd), Mn.pct(d.top10ShareOfReceipts), Mn.usd(d.top100Usd), Mn.pct(d.top100ShareOfReceipts), d.donorsAtLeast1M, Mn.pct(d.itemizedIndividualShareOfIndividualContributions, 0)]); }).join('');
    for (const c of Mn.donorCycles(D).filter((c) => c === dc)) {
      h += sec(`Donors of $1 million or more, ${c}: itemized cash; memo lines are attributions and are not added (largest line with its filing)`, 7) + hd(['Donor', 'State', 'Cash', 'Memo-attributed', 'First gift', 'Last gift', 'Largest line: amount, date, filing, committee']);
      h += D.donors.cycles[c].named.map((n) => { const L = n.largestLines[0] || n.largestMemoLines[0]; return row([n.name, n.state, Mn.usd(n.cashUsd), n.memoAttributedUsd ? Mn.usd(n.memoAttributedUsd) : '', n.firstDate, n.lastDate, L ? `${Mn.usd(L.usd)}${n.largestLines[0] ? '' : ' (memo)'}, ${L.date}, filing ${L.filing}, ${L.committeeName}` : '']); }).join('');
    }
    const A = D.americaPac;
    h += sec(`America PAC (${A.committee}), 2026 cycle, as filed`, 2) + [['Receipts, through ' + A.summary.coverageEnd, Mn.usd(A.summary.receiptsUsd)], ['Disbursements (spent)', Mn.usd(A.summary.disbursementsUsd)], ['Schedule E, committee summary (outside)', Mn.usd(A.summary.scheduleESummaryUsd)],
      ['Schedule E, FEC file through ' + D.coverage['2026'].scheduleEFileThrough + ' (outside)', Mn.usd(A.scheduleEFileUsd)], ['Disbursements no race is named for (summary basis)', Mn.usd(A.notAllocatedToARaceUsd)],
      [`Musk cash, ${A.musk.cashFirst} to ${A.musk.cashLast}`, Mn.usd(A.musk.cashUsd)], ['In-kind lines booked to United States of America Inc', Mn.usd(A.musk.inKindFromUnitedStatesOfAmericaIncUsd)], ['Memo attribution to Musk (not added)', Mn.usd(A.musk.memoAttributionToMuskUsd)],
      ['Filings', A.musk.filings.join(', ')]].map((r) => row(r)).join('') + '</tbody>';
    table.innerHTML = h;
  };
  // Funnel: every stage, leak and reason for each place in view, with its EAVS item, share of residents, rate and the jurisdictions that did not report it.
  const renderFunnel = () => {
    const cols = funnelCols();
    $('tableTitle').textContent = `Voter funnel, EAVS ${funnelYear()}: ${cols ? cols.map((c) => c.label).join(' against ') : ''}`;
    $('tableNote').textContent = 'Each figure with its EAVS item code. A figure that jurisdictions did not report (EAVS codes -88, -99 or blank) is missing, never zero: the count is of those that did, and the last column says how many did not. Ballots cast is derived (counted plus rejected: a floor). A removal or a rejection is not a count of eligible voters turned away.';
    if (!cols) { table.innerHTML = '<tbody><tr><td>Loading the voter funnel…</td></tr></tbody>'; return; }
    const pc = (x) => (x == null ? '' : (x * 100).toFixed(1) + '%'), num = (x) => (x.v == null ? 'missing' : fmt(Math.round(x.v)));
    const rowsOf = (D) => [...D.stages, ...D.leaks, ...D.reasons.rows.map((r) => ({ ...r, label: '   of removals: ' + r.label, share: null, rate: null }))];
    const base = rowsOf(cols[0]);
    const head = '<thead><tr><th>Figure</th><th>EAVS item</th>' + cols.map((c) => `<th>${esc(c.label)}: count</th><th>% of residents</th><th>Rate</th><th>Jur. missing</th>`).join('') + '</tr></thead>';
    const body = base.map((r, i) => '<tr>' + `<td>${esc(r.label)}</td><td>${esc(r.code || '')}</td>` + cols.map((c) => { const x = rowsOf(c)[i] || {};
      return `<td>${esc(num(x))}</td><td>${esc(pc(x.share))}</td><td>${esc(x.rate ? pc(x.rate.rate) + ' ' + x.rateId : '')}</td><td>${esc(x.miss ? fmt(x.miss) : '')}</td>`; }).join('') + '</tr>').join('');
    table.innerHTML = head + '<tbody>' + body + '</tbody>';
  };
  const M2votes = (r) => fmt(r.votes.D + r.votes.R);
  const render = () => {
    if (effW() === 'funnel') return renderFunnel();
    if (effW() === 'money') return renderMoney();
    if (effW() === 'dropoff') return renderDropoff();
    if (effW() === 'split') return renderSplit();
    if (effW() === 'road') return renderRoad();
    if (effW() === 'closest') return renderClosest();
    if (effW() === 'power') return renderPower();
    if (effW() === 'sim') return renderSim();
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
      ...(w === 'people' && peopleDots ? [['Dots', (r) => (r.v ? peopleDots(r.f) : null), (x) => (x == null ? '' : fmt(x))]] : []),
      ...(b ? [['Swing', (r) => r.s, (s) => (s == null ? '' : `${Math.abs(s).toFixed(1)} to ${s >= 0 ? 'D' : 'R'}`)]] : []),
      ...(b && w === 'scatter' && state.sx === 'ms' ? [['Margin in the earlier race', (r) => (r.b && r.b[0] > 0 ? model.margin(r.b) : null), lead]] : []),
      ...(b && w === 'scatter' && state.sx !== 'ms' ? [['Rep. votes', (r) => (r.b && r.b[1] > 0 ? pctCh(r.v[1], r.b[1]) : null), signedPct],
        ['Dem. votes', (r) => (r.b && r.b[2] > 0 ? pctCh(r.v[2], r.b[2]) : null), signedPct]] : []),
      ...(model.effShown() ? [['Residents per vote', (r) => (effOf(r.f) || {}).ppv, (x) => (x == null ? '' : x.toFixed(2))],
        ...[['Weight per vote', 'r'], ['State EV per resident', 'B'], ['Residents per eligible', 'N'], ['Eligible per vote', 'T']]
          .map(([name, key]) => [name, (r) => (effOf(r.f) || {})[key], (x) => (x == null ? '' : x.toFixed(2) + '×')])] : []),
      // An overlay in force: whether the county is marked (and what by), and the lean and size bands its match uses.
      ...(ovSet && ovSet() ? [[overlays.layer(state.ov).short, (r) => (ovSet().has(r.f) ? overlays.detail(state.ov, r.f) : null), (x) => x || ''],
        ...(b ? [['Lean band', (r) => (r.b && r.b[0] ? overlays.lean(r.b) : null), (x) => x || ''], ['Size band', (r) => (r.b && r.b[0] ? overlays.size(r.b) : null), (x) => x || '']] : [])] : []),
    ];
    if (sort.k >= cols.length) sort = { k: 2, dir: -1 };
    const get = cols[sort.k][1];
    rs = rs.slice().sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    $('tableTitle').textContent = `${sel ? 'Selected counties' : 'Every county'}, ${elections[state.e].label}`;
    $('tableNote').textContent = `${fmt(rs.length)} ${rs.length === 1 ? 'county' : 'counties'}` + (w === 'people' ? `. Dots: one per ${fmt(+state.pn)} votes, the county's votes over that, rounded at random with a fixed seed (the dot map's own counts)` : '') + (b ? `. Swing in points since ${model.baselineLabel()}` : '') +
      (b && w === 'scatter' && state.sx !== 'ms' ? '; vote changes in percent since the same race' : '') + (b && w === 'scatter' && state.sx === 'ms' ? '; margin in the earlier race, then swing since it' : '') + '. Click a heading to sort.' +
      (ovSet && ovSet() ? ' ' + ovSummary() : '');
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      (rs.length ? rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('')
        : `<tr><td colspan="${cols.length}">No ${OFFICE_NAME[model.officeOf(state.e)].toLowerCase()} race with county results here in ${elections[state.e].year}.</td></tr>`) + '</tbody>';
  };
  table.addEventListener('click', (ev) => {
    const th = ev.target.closest('th'); if (!th) return;
    const k = +th.dataset.k;
    if (effW() === 'road' || effW() === 'closest') { const o = effW() === 'road' ? sRoad : sClosest; Object.assign(o, { k, dir: o.k === k ? -o.dir : 1 }); return render(); }
    sort = { k, dir: sort.k === k ? -sort.dir : k < 2 ? 1 : -1 }; render();
  });
  const open = () => { wrap.hidden = false; render(); $('tableClose').focus(); };
  const close = () => { wrap.hidden = true; };
  const toggle = () => (wrap.hidden ? open() : close());
  $('tableBtn').addEventListener('click', toggle);
  $('tableClose').addEventListener('click', close);
  return { render, open, close, toggle, isOpen: () => !wrap.hidden, refresh: () => { if (!wrap.hidden) render(); } };
}
