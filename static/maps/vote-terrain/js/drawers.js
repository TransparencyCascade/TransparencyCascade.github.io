/* The pinned County history card (panel), the side drawer (regional close-up, and the state's two races in Ticket splitting)
   and what they draw. Both read the page's county results through places.js and turnout.js; main.js owns the state
   (state.hk the county, state.cu the close-up's region) and calls render() after every change.
   In an export (?export=1) the card or drawer fills the view's region and the flat view behind it is hidden, since the panel is not shown. */
import { toward, MARGIN_MAX, NODATA } from './colour.js';
import { KIND_NAME } from './places.js';
import { fmt, esc, countyLabelOf, $ } from './util.js';

const INK = '#23306B', GRAPHITE = '#5B6168', RULE = 'rgba(35,48,107,0.28)', FAINT = 'rgba(91,97,104,0.38)';
const SHAPE = { pres: d3.symbolCircle, sen: d3.symbolSquare, gov: d3.symbolTriangle };
const lead = (x) => (x == null ? '' : (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1));
const ab = (x) => ({ pres: 'P', sen: 'S', gov: 'G' }[x.kind] + String(x.year).slice(2));

export function createDrawers({ meta, elections, state, places, turnout, regions, selection, select, stateName, tip, exporting, shapes, region, refresh, split, splitSel }) {
  const hist = $('histCard'), drawer = $('drawer');
  if (exporting) document.body.appendChild(hist);
  const preset = (id) => regions.regions.find((r) => r.id === id);
  const areaOf = () => { if (state.cu === 'sel') { const s = selection(); return s ? { name: 'Selection', fs: [...s.counties].filter((f) => meta[f]), preset: null } : null; }
    const r = preset(state.cu); return r ? { name: r.name, fs: r.counties, preset: r } : null; };
  const symbol = (kind, size) => d3.symbol(SHAPE[kind], size)();

  // ---------- one county's chart: margin or votes across the elections, the state's line behind ----------
  function lineChart(host, { W, H, title, yDom, yFmt, series, ref, fill, tipOf, noteRight }) {
    const pad = { l: 34, r: 6, t: 22, b: 18 }, x = d3.scaleLinear().domain([2015.6, 2026.4]).range([pad.l, W - pad.r]), y = d3.scaleLinear().domain(yDom).range([H - pad.b, pad.t]);
    const svg = d3.select(host).append('svg').attr('width', W).attr('height', H).attr('role', 'img').attr('aria-label', title);
    svg.append('text').attr('class', 'hc-title').attr('x', 2).attr('y', 10).text(title);
    for (const t of y.ticks(4)) { svg.append('line').attr('x1', pad.l).attr('x2', W - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === ref ? INK : RULE).attr('stroke-width', t === ref ? 1.2 : 0.5);
      svg.append('text').attr('x', pad.l - 4).attr('y', y(t) + 3).attr('text-anchor', 'end').attr('class', 'hc-tick').text(yFmt(t)); }
    for (const yr of [2016, 2018, 2020, 2022, 2024, 2026]) svg.append('text').attr('x', x(yr)).attr('y', H - 5).attr('text-anchor', 'middle').attr('class', 'hc-tick').text(yr);
    // The timeline's year: a marker that follows it.
    const cur = elections[state.e] && elections[state.e].year;
    if (cur) svg.append('line').attr('class', 'hc-now').attr('x1', x(cur)).attr('x2', x(cur)).attr('y1', pad.t).attr('y2', H - pad.b).attr('stroke', INK).attr('stroke-dasharray', '3 3').attr('stroke-width', 1);
    const line = d3.line().defined((d) => d.y != null).x((d) => x(d.x)).y((d) => y(d.y));
    for (const k of ['pres', 'sen', 'gov']) {
      svg.append('path').attr('d', line(series.state.filter((d) => d.kind === k))).attr('fill', 'none').attr('stroke', FAINT).attr('stroke-width', 3).attr('stroke-linejoin', 'round');
      svg.append('path').attr('d', line(series.county.filter((d) => d.kind === k))).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 1).attr('opacity', 0.7);
    }
    const pts = svg.append('g').selectAll('path').data(series.county.filter((d) => d.y != null)).enter().append('path')
      .attr('transform', (d) => `translate(${x(d.x)},${y(d.y)})`).attr('d', (d) => symbol(d.kind, d.e === state.e ? 78 : 44)).attr('fill', fill).attr('stroke', INK).attr('stroke-width', (d) => (d.e === state.e ? 1.8 : 0.9))
      .attr('stroke-dasharray', (d) => (d.unofficial ? '2 1.5' : null)).style('cursor', 'default');
    pts.on('mousemove', (ev, d) => tip.place(tipOf(d), ev.clientX, ev.clientY)).on('mouseleave', tip.hide);
    return svg;
  }
  function renderHistory(host, f, W, wide) {
    host.innerHTML = '';
    const C = places.countyOf(f), S = places.stateOf(meta[f].st), ix = places.indexOf(f), st = meta[f].st;
    const mAbs = d3.max([...C, ...S], (d) => (d.m == null ? 0 : Math.abs(d.m))) || 10, mMax = Math.max(10, Math.ceil(Math.min(mAbs, 100) / 10) * 10);
    const pick = (rows, g) => rows.map((d) => ({ ...d, x: d.year, y: g(d) }));
    const iMax = d3.max([...C.map((d) => ix(d.v)), ...S.map((d) => d.index)].filter((v) => v != null)) || 100;
    const Hh = wide ? 190 : Math.round(W * 0.66);
    const box = document.createElement('div'); box.className = 'hc-charts' + (wide ? ' wide' : ''); host.appendChild(box);
    const cw = wide ? Math.floor((W - 12) / 2) : W;
    const a = document.createElement('div'); const b = document.createElement('div'); box.append(a, b);
    lineChart(a, { W: cw, H: Hh, title: 'Margin, points (D above zero)', yDom: [-mMax, mMax], yFmt: (t) => (t === 0 ? '0' : (t > 0 ? 'D' : 'R') + Math.abs(t)), ref: 0,
      series: { county: pick(C, (d) => d.m), state: pick(S, (d) => d.m) }, fill: (d) => toward(d.m, MARGIN_MAX),
      tipOf: (d) => { const s = S.find((x) => x.e === d.e); return `<b>${esc(d.label)}</b>${d.unofficial ? ' (unofficial)' : ''}<br>${fmt(d.v[0])} votes in ${esc(countyLabelOf(meta, f))}<br>Margin ${lead(d.m)}<br>${esc(stateName(st))}: ${lead(s.m)}`; } });
    lineChart(b, { W: cw, H: Hh, title: 'Votes, 100 = President 2016', yDom: [0, Math.ceil(iMax / 50) * 50], yFmt: (t) => t, ref: 100,
      series: { county: pick(C, (d) => ix(d.v)), state: pick(S, (d) => d.index) }, fill: () => INK,
      tipOf: (d) => { const s = S.find((x) => x.e === d.e); return `<b>${esc(d.label)}</b>${d.unofficial ? ' (unofficial)' : ''}<br>${fmt(d.v[0])} votes: ${ix(d.v).toFixed(0)} on the county's President 2016 votes<br>${esc(stateName(st))}: ${s.index == null ? '' : s.index.toFixed(0)}`; } });
    const leg = document.createElement('p'); leg.className = 'hc-legend';
    leg.innerHTML = ['pres', 'sen', 'gov'].map((k) => `<span><svg width="12" height="12"><path d="${symbol(k, 50)}" transform="translate(6,6)" fill="none" stroke="${INK}"/></svg>${KIND_NAME[k]}</span>`).join('') +
      `<span><i class="hc-faint"></i>${esc(stateName(st))}</span><span>dashed rule: the year in view</span>`;
    host.appendChild(leg);
    const rows = C.map((d, i) => `<tr><td>${esc(d.label)}${d.unofficial ? ' (unofficial)' : ''}</td><td>${d.v ? fmt(d.v[0]) : ''}</td><td>${lead(d.m)}</td><td>${d.v ? ix(d.v).toFixed(0) : ''}</td><td>${lead(S[i].m)}</td><td>${S[i].index == null ? '' : S[i].index.toFixed(0)}</td></tr>`).join('');
    const det = document.createElement('details'); det.className = 'hc-table';
    det.innerHTML = `<summary>Table</summary><table><thead><tr><th>Election</th><th>Votes</th><th>Margin</th><th>Index</th><th>${esc(st)} margin</th><th>${esc(st)} index</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<p class="note">Index: votes as a share of the same counties' President 2016 votes, times 100. The state's line sums the counties with a result in each election.</p>`;
    host.appendChild(det);
  }
  const renderHistCard = () => {
    const on = !!state.hk;
    hist.hidden = !on;
    if (!on) return;
    const f = state.hk, open = hist.querySelector('details') && hist.querySelector('details').open;
    hist.innerHTML = `<header><b>${esc(countyLabelOf(meta, f))}</b><button class="hc-close" aria-label="Close the history card">×</button></header><div class="hc-body"></div>`;
    const wide = exporting, W = exporting ? Math.max(480, (window.innerWidth - 16 - Math.max(0, window.innerWidth - $('keyBox').getBoundingClientRect().left + 16)) - 32) : 198;
    renderHistory(hist.querySelector('.hc-body'), f, W, wide);
    if (open) hist.querySelector('details').open = true;
    if (exporting) { Object.assign(hist.style, { left: '16px', top: '16px', right: (window.innerWidth - $('keyBox').getBoundingClientRect().left + 16) + 'px' }); hist.querySelector('details').hidden = true; }
  };
  hist.addEventListener('click', (ev) => { if (ev.target.closest('.hc-close')) { state.hk = ''; refresh(); } });

  // ---------- the drawer ----------
  let hl = null, filter = '', which = null, dismissedFor = null;
  const setHl = (f) => { hl = f; drawer.querySelectorAll('[data-f]').forEach((n) => n.classList.toggle('hl', n.dataset.f === f)); };
  function closeupHtml(A) {
    const fs = A.fs, L = places.list, R = places.areaOf(fs), sts = [...new Set(fs.map((f) => meta[f].st))];
    const wide = exporting, W = wide ? Math.max(520, window.innerWidth - 32 - (window.innerWidth - $('keyBox').getBoundingClientRect().left + 16)) : 336;
    const mapW = wide ? Math.floor(W * 0.36) : W, chW = wide ? W - mapW - 14 : W;
    drawer.innerHTML = `<header><b>${esc(A.preset ? A.preset.name : `Selection: ${fmt(fs.length)} ${fs.length === 1 ? 'county' : 'counties'} in ${sts.length} ${sts.length === 1 ? 'state' : 'states'}`)}</b><button class="dr-close" aria-label="Close the close-up">×</button></header>` +
      `<div class="dr-top${wide ? ' wide' : ''}"><div class="dr-map"></div><div class="dr-lines"></div></div><div class="dr-tbl"></div>`;
    // Map: the area's counties, coloured by margin in the election in view where it has a result.
    const sh = shapes(), bb = fs.reduce((b, f) => { const q = sh.bboxOf[f]; return q ? [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])] : b; }, [Infinity, Infinity, -Infinity, -Infinity]);
    const pw = (bb[2] - bb[0]) * 0.04 + 1, ph = (bb[3] - bb[1]) * 0.04 + 1, vb = [bb[0] - pw, bb[1] - ph, bb[2] - bb[0] + 2 * pw, bb[3] - bb[1] + 2 * ph];
    const mh = Math.min(wide ? 215 : 200, Math.max(60, mapW * vb[3] / vb[2]));
    const E = elections[state.e], cur = E && E.data;
    const svg = d3.select(drawer.querySelector('.dr-map')).append('svg').attr('width', mapW).attr('height', mh).attr('viewBox', vb.join(' ')).attr('preserveAspectRatio', 'xMidYMid meet').attr('role', 'img').attr('aria-label', 'Map of the area');
    svg.selectAll('path').data(fs).enter().append('path').attr('data-f', (f) => f).attr('d', (f) => sh.countyPath[f]).attr('fill', (f) => (cur && cur[f] ? toward(places.marginOf(cur[f]), MARGIN_MAX) : `rgb(${NODATA})`))
      .attr('stroke', 'rgba(35,48,107,.5)').attr('stroke-width', 0.6).attr('vector-effect', 'non-scaling-stroke').style('cursor', 'pointer')
      .on('mousemove', (ev, f) => { setHl(f); tip.hoverCounty(f, ev.clientX, ev.clientY); }).on('mouseleave', () => { setHl(null); tip.hoverCounty(null); }).on('click', (ev, f) => { if (!exporting) select({ counties: [f] }, { toggle: true }); });
    drawer.querySelector('.dr-map').insertAdjacentHTML('beforeend', `<p class="note">Colour: margin, ${esc(E ? E.label : '')}.</p>`);
    // Lines: one per county across the elections (or one office's), the area's own margin bold.
    const lines = drawer.querySelector('.dr-lines');
    lines.innerHTML = `<div class="seg dr-seg" role="group" aria-label="Elections shown">${[['', 'All'], ['pres', 'President'], ['sen', 'Senate'], ['gov', 'Governor']].map(([k, t]) => `<button data-k="${k}" aria-pressed="${k === filter}">${t}</button>`).join('')}</div><div class="dr-chart"></div>`;
    const Ls = L.map((x, i) => ({ ...x, i })).filter((x) => (!filter || x.kind === filter) && R[x.i].n > 0), per = fs.map((f) => ({ f, pts: Ls.map((x) => ({ x, m: places.marginOf(elections[x.e].data[f]) })) }));
    const aM = Ls.map((x) => R[x.i]);
    const mMax = Math.max(10, Math.ceil(Math.min(100, d3.max([...per.flatMap((p) => p.pts.map((q) => (q.m == null ? 0 : Math.abs(q.m)))), ...aM.map((a) => (a.m == null ? 0 : Math.abs(a.m)))])) / 10) * 10);
    const H = wide ? 205 : 200, pad = { l: 34, r: 8, t: 8, b: 20 }, xs = d3.scalePoint().domain(Ls.map((x) => x.e)).range([pad.l + 6, chW - pad.r - 6]), ys = d3.scaleLinear().domain([-mMax, mMax]).range([H - pad.b, pad.t]);
    const cs = d3.select(lines.querySelector('.dr-chart')).append('svg').attr('width', chW).attr('height', H).attr('role', 'img').attr('aria-label', 'Margin by county across the elections');
    for (const t of ys.ticks(4)) { cs.append('line').attr('x1', pad.l).attr('x2', chW - pad.r).attr('y1', ys(t)).attr('y2', ys(t)).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.2 : 0.5);
      cs.append('text').attr('x', pad.l - 4).attr('y', ys(t) + 3).attr('text-anchor', 'end').attr('class', 'hc-tick').text(t === 0 ? '0' : (t > 0 ? 'D' : 'R') + Math.abs(t)); }
    Ls.forEach((x) => cs.append('text').attr('x', xs(x.e)).attr('y', H - 6).attr('text-anchor', 'middle').attr('class', 'hc-tick').text(ab(x)));
    const ln = d3.line().defined((d) => d.m != null).x((d) => xs(d.x.e)).y((d) => ys(d.m));
    cs.selectAll('path.cl').data(per).enter().append('path').attr('class', 'cl').attr('data-f', (p) => p.f).attr('d', (p) => ln(p.pts)).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 0.9).attr('opacity', 0.32);
    cs.append('path').attr('d', ln(aM.map((a, i) => ({ x: Ls[i], m: a.m })))).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2.4).style('pointer-events', 'none');
    cs.selectAll('path.am').data(aM.map((a, i) => ({ ...a, x: Ls[i] })).filter((a) => a.m != null)).enter().append('path').attr('class', 'am').attr('transform', (a) => `translate(${xs(a.x.e)},${ys(a.m)})`).attr('d', (a) => symbol(a.kind, 60)).attr('fill', (a) => toward(a.m, MARGIN_MAX)).attr('stroke', INK)
      .on('mousemove', (ev, a) => tip.place(`<b>${esc(a.label)}</b>${a.unofficial ? ' (unofficial)' : ''}<br>${fmt(a.n)} of ${fmt(fs.length)} counties with a result<br>${fmt(a.votes)} votes, margin ${lead(a.m)}`, ev.clientX, ev.clientY)).on('mouseleave', tip.hide);
    // Hover finds the nearest county line; click makes it the selection.
    const flat = per.flatMap((p) => p.pts.filter((q) => q.m != null).map((q) => ({ f: p.f, px: xs(q.x.e), py: ys(q.m) }))), del = d3.Delaunay.from(flat, (d) => d.px, (d) => d.py);
    cs.append('rect').attr('x', pad.l).attr('y', pad.t).attr('width', chW - pad.l - pad.r).attr('height', H - pad.t - pad.b).attr('fill', 'transparent').style('cursor', 'pointer')
      .on('mousemove', (ev) => { const [mx, my] = d3.pointer(ev), d = flat.length ? flat[del.find(mx, my)] : null; if (d && Math.hypot(d.px - mx, d.py - my) < 24) { setHl(d.f); tip.hoverCounty(d.f, ev.clientX, ev.clientY); } else { setHl(null); tip.hoverCounty(null); } })
      .on('mouseleave', () => { setHl(null); tip.hoverCounty(null); }).on('click', () => { if (hl && !exporting) select({ counties: [hl] }, { toggle: true }); });
    lines.insertAdjacentHTML('beforeend', `<p class="note">One thin line per county; the bold line is the area's margin over the counties with a result. Hover a line, click to select that county.</p>`);
    // The area's totals by election, and a table of every county.
    const rows = R.map((a) => `<tr><td>${esc(a.label)}${a.unofficial ? ' (unofficial)' : ''}</td><td>${fmt(a.n)}</td><td>${fmt(a.votes)}</td><td>${lead(a.m)}</td></tr>`).join('');
    const cH = L.map((x) => `<th>${ab(x)}</th>`).join(''), cRows = fs.slice().sort((a, b) => countyLabelOf(meta, a).localeCompare(countyLabelOf(meta, b))).map((f) =>
      `<tr data-f="${f}"><td>${esc(countyLabelOf(meta, f).replace(/, \w\w$/, ''))}${sts.length > 1 ? ', ' + meta[f].st : ''}</td>${L.map((x) => `<td>${lead(places.marginOf(elections[x.e].data[f]))}</td>`).join('')}</tr>`).join('');
    drawer.querySelector('.dr-tbl').innerHTML = `<table class="dr-t"><thead><tr><th>Election</th><th>Counties</th><th>Votes</th><th>Margin</th></tr></thead><tbody>${rows}</tbody></table>` +
      `<details class="hc-table"><summary>Table: every county's margin</summary><table class="dr-c"><thead><tr><th>County</th>${cH}</tr></thead><tbody>${cRows}</tbody></table><p class="note">P president, S Senate, G governor, with the year. Margin in points, D above zero.</p></details>` +
      `<p class="note">${esc(A.preset ? A.preset.definition : 'The counties in the current selection.')}${A.preset ? ' ' + esc(A.preset.source) : ''}</p>`;
    if (exporting) drawer.querySelector('details').hidden = true;
    lines.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { filter = b.dataset.k; draw(); }));
    drawer.querySelector('.dr-tbl').addEventListener('mouseover', (ev) => { const r = ev.target.closest('tr[data-f]'); setHl(r ? r.dataset.f : null); });
  }
  // Ticket splitting: the selected state's two races, county by county.
  function splitHtml(st) {
    const S = split(), P = S.per.find((p) => p.st === st), rows = P.rs.slice().sort((a, b) => b.v - a.v);
    const tot = (k) => rows.reduce((a, r) => ({ d: a.d + r[k][2], r: a.r + r[k][1], t: a.t + r[k][0] }), { d: 0, r: 0, t: 0 });
    const ts = tot('sen'), tg = tot('gov'), m = (o) => (o.t ? (o.d - o.r) / o.t * 100 : null);
    const cell = (v) => `<td>${fmt(v[2])}</td><td>${fmt(v[1])}</td>`;
    drawer.innerHTML = `<header><b>${esc(stateName(st))}: Senate and governor, 2026</b><button class="dr-close" aria-label="Close">×</button></header>` +
      `<p class="note">Unofficial county results. Votes for the Democratic and Republican candidates in each race; difference: Senate margin minus governor margin, points, D above zero. ${fmt(rows.length)} counties.</p>` +
      `<table class="dr-t sp"><thead><tr><th rowspan="2">County</th><th colspan="2">Senate</th><th colspan="2">Governor</th><th rowspan="2">Difference</th></tr><tr><th>Dem.</th><th>Rep.</th><th>Dem.</th><th>Rep.</th></tr></thead><tbody>` +
      rows.map((r) => `<tr data-f="${r.f}"><td>${esc(countyLabelOf(meta, r.f).replace(/, \w\w$/, ''))}</td>${cell(r.sen)}${cell(r.gov)}<td>${lead(r.d)}</td></tr>`).join('') +
      `</tbody><tfoot><tr><th>Total in these counties</th><th>${fmt(ts.d)}</th><th>${fmt(ts.r)}</th><th>${fmt(tg.d)}</th><th>${fmt(tg.r)}</th><th>${lead(m(ts) - m(tg))}</th></tr></tfoot></table>` +
      `<p class="note">${esc(elections.sen2026.source)} ${esc(elections.gov2026.source)}</p>`;
  }
  function draw() {
    let mode = null;
    const A = state.cu ? areaOf() : null;
    if (A && A.fs.length) mode = 'closeup';
    const ss = splitSel();
    if (!ss) dismissedFor = null;
    if (!mode && ss && ss !== dismissedFor) mode = 'split';
    drawer.hidden = !mode;
    document.body.dataset.drawer = mode || '';
    if (!mode) { which = null; return; }
    if (mode === 'closeup') closeupHtml(A); else splitHtml(splitSel());
    which = mode;
    if (exporting) Object.assign(drawer.style, { left: '16px', top: '16px', right: (window.innerWidth - $('keyBox').getBoundingClientRect().left + 16) + 'px', width: 'auto', maxHeight: 'none' });
  }
  drawer.addEventListener('click', (ev) => {
    if (!ev.target.closest('.dr-close')) return;
    if (which === 'closeup') state.cu = ''; else dismissedFor = splitSel();
    refresh();
  });
  const render = () => {
    renderHistCard(); draw();
    if (exporting) { const c = !hist.hidden ? 'hist' : !drawer.hidden ? 'drawer' : ''; if (c) document.body.dataset.card = c; else delete document.body.dataset.card; }
  };
  // The bottom of the card or drawer in export, so the image is cropped to it.
  const bottom = () => [hist, drawer].filter((n) => !n.hidden && n.getClientRects().length).reduce((b, n) => Math.max(b, Math.ceil(n.getBoundingClientRect().bottom)), 0);
  const width = () => (!exporting && !drawer.hidden && window.innerWidth > 640 ? drawer.getBoundingClientRect().left : null);
  return { render, bottom, width, isOpen: () => !drawer.hidden, areaOf, preset };
}
