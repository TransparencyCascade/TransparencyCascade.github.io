/* Ticket splitting, 2026 (unofficial): for the states with both a Senate and a governor county result, each county's Senate
   margin minus its governor margin, on the flat map and as a strip per state (counties as ticks, the median marked). Grey: the
   two races agree; colour toward the party whose Senate margin ran ahead of the governor's. Hover shows both margins; clicking
   a county or a strip selects its state and opens both races' county totals in the drawer (drawers.js).
   Arithmetic in ../turnout.js (split). The Senate and governor files were fetched at different times; the foot says when. */
import { INK, GRAPHITE, RULE, DIM } from './style.js';
import { toward } from '../colour.js';

export const SPLIT_MAX = 30;
const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
const NODATA = 'rgb(238,241,241)';

export function splitView({ ctx, head, body, foot, place, inSel, shiftOf, countyPath, statePath, W0, DUR }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let svg, strips;
  function build() {
    head.innerHTML = '<span class="v2d-ref sp-note"></span>';
    body.innerHTML = '<div class="sp-wrap"><div class="sp-map"></div><div class="sp-rows"></div></div>';
    svg = d3.select(body.querySelector('.sp-map')).append('svg').attr('class', 'sp-svg');
    svg.append('g').attr('class', 'cs'); svg.append('path').attr('class', 'sb').attr('d', statePath).attr('fill', 'none').attr('stroke', 'rgba(35,48,107,.3)').attr('stroke-width', 0.5).style('pointer-events', 'none');
    strips = d3.select(body.querySelector('.sp-rows')).append('svg');
  }
  const tipOf = (r) => {
    const win = (m) => (m > 0 ? 'Democratic' : m < 0 ? 'Republican' : 'tied');
    return `<b>${ctx.countyLabel(r.f)}</b> (unofficial)<br>Senate: ${lead(r.ms)} (Democratic ${fmt(r.sen[2])}, Republican ${fmt(r.sen[1])})<br>Governor: ${lead(r.mg)} (Democratic ${fmt(r.gov[2])}, Republican ${fmt(r.gov[1])})` +
      `<br>The Senate result was ${Math.abs(r.d).toFixed(1)} points ${r.d >= 0 ? 'more Democratic' : 'more Republican'} than the governor result${win(r.ms) !== win(r.mg) ? '; different parties led the two races here' : ''}` +
      (exporting ? '' : '<br><span style="color:#5B6168">Click to open the state\'s county totals</span>');
  };
  function draw() {
    const T = ctx.split(), S = inSel(), { w, h } = place(), narrow = w < 700;
    head.querySelector('.sp-note').textContent = `Senate margin minus governor margin, 2026, unofficial: the ${T.states.length} states with both races${exporting ? '' : ` (${T.states.join(', ')})`}. Grey: the races agree; colour toward the party whose candidate ran further ahead in the Senate race than in the governor race. Pale: not both races on the ballot.`;
    foot.textContent = `${ctx.sources()} The two files were fetched at different times, so counts may differ in completeness.`;
    const bb = (W0[2] - W0[0]) / (W0[3] - W0[1]), body0 = body.querySelector('.sp-wrap');
    body0.style.flexDirection = narrow ? 'column' : 'row';
    const mapW = narrow ? w : Math.min(w * 0.6, (h - 4) * bb), mapH = mapW / bb;
    body.querySelector('.sp-map').style.flex = 'none';
    svg.attr('width', mapW).attr('height', mapH).attr('viewBox', `${W0[0]} ${W0[1]} ${W0[2] - W0[0]} ${W0[3] - W0[1]}`);
    const fs = Object.keys(countyPath), c = svg.select('.cs').selectAll('path').data(fs, (f) => f);
    const all = c.enter().append('path').attr('d', (f) => countyPath[f]).attr('stroke', 'rgba(35,48,107,.18)').attr('stroke-width', 0.25).merge(c);
    all.attr('fill', (f) => (T.byF[f] ? toward(T.byF[f].d, SPLIT_MAX) : NODATA)).attr('opacity', (f) => (S && !S.has(f) ? DIM : 1))
      .style('cursor', (f) => (T.byF[f] && !exporting ? 'pointer' : null));
    if (!exporting) all.on('mousemove', (ev, f) => { const r = T.byF[f]; if (r) ctx.hoverHtml(tipOf(r), ev.clientX, ev.clientY); else ctx.hover(null); })
      .on('mouseleave', () => ctx.hover(null)).on('click', (ev, f) => { const r = T.byF[f]; if (r) ctx.select({ kind: 'states', states: [r.st] }, { add: shiftOf(ev) }); });
    // Strips: one row per state, counties as ticks on the difference axis, the median marked, sorted by median.
    let list = T.per.slice().sort((a, b) => b.med - a.med); const RH = 19, padL = 84, wr = narrow ? w : Math.max(260, w - mapW - 12), max = SPLIT_MAX;
    // An export shows whole rows only: the states with the largest median difference that fit, said in the head.
    if (exporting) { const n = Math.max(4, Math.floor((h - 40) / RH)); if (n < list.length) { list = list.slice().sort((a, b) => Math.abs(b.med) - Math.abs(a.med)).slice(0, n).sort((a, b) => b.med - a.med);
      head.querySelector('.sp-note').textContent += ` The ${n} states with the largest median difference are in the strips; every state is on the page.`; } }
    const xr = d3.scaleLinear().domain([-max, max]).range([padL, wr - 14]).clamp(true), hh = 36 + list.length * RH + 6;
    const rowsBox = body.querySelector('.sp-rows'); rowsBox.style.overflowY = 'auto'; rowsBox.style.height = narrow ? Math.max(120, h - mapH - 8) + 'px' : h + 'px'; rowsBox.style.width = wr + 'px';
    strips.attr('width', wr).attr('height', hh).selectAll('*').remove();
    strips.append('text').attr('class', 'axis-title').attr('x', 4).attr('y', 11).text('Senate margin minus governor margin, points');
    for (const t of [-30, -20, -10, 0, 10, 20, 30]) { strips.append('line').attr('x1', xr(t)).attr('x2', xr(t)).attr('y1', 30).attr('y2', hh - 4).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.2 : 0.5);
      strips.append('text').attr('class', 'tick').attr('x', xr(t)).attr('y', 27).attr('text-anchor', 'middle').text(t === 0 ? '0' : (t > 0 ? 'D' : 'R') + Math.abs(t)); }
    const g = strips.selectAll('g.row').data(list, (d) => d.st).enter().append('g').attr('class', 'row').attr('transform', (d, i) => `translate(0,${34 + i * RH})`);
    g.append('rect').attr('class', 'hit').attr('width', wr).attr('height', RH).attr('fill', 'transparent').style('cursor', exporting ? null : 'pointer');
    g.append('text').attr('class', 'st').style('pointer-events', 'none').attr('x', 4).attr('y', RH / 2 + 4).attr('font-weight', (d) => (S && d.rs.some((r) => S.has(r.f)) ? 700 : 400)).text((d) => `${d.st}  ${lead(d.med)}`);
    g.each(function (d) { d3.select(this).selectAll('line.t').data(d.rs).enter().append('line').attr('class', 't').style('pointer-events', 'none').attr('x1', (r) => xr(r.d)).attr('x2', (r) => xr(r.d)).attr('y1', RH * 0.22).attr('y2', RH * 0.78)
      .attr('stroke', (r) => toward(r.d, SPLIT_MAX)).attr('stroke-width', 1.2).attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.92)); });
    g.append('rect').attr('x', (d) => xr(d.med) - 1.5).attr('y', 1).attr('width', 3).attr('height', RH - 2).attr('fill', INK).style('pointer-events', 'none');
    if (!exporting) g.select('.hit').on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b><br>${d.n} counties; median difference ${lead(d.med)}<br>Statewide in these counties: Senate ${d.senWin === 'D' ? 'Democratic' : 'Republican'}, governor ${d.govWin === 'D' ? 'Democratic' : 'Republican'}<br><span style="color:#5B6168">Click to open the state's county totals</span>`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    const base = S ? T.rows.filter((r) => S.has(r.f)) : T.rows, differ = base.filter((r) => Math.sign(r.ms) !== Math.sign(r.mg)).length;
    ctx.viewNote(`${S ? 'In the selection' : `Of the ${fmt(base.length)} counties in these states`}: different parties led the Senate and governor races in ${fmt(differ)} (${fmt(base.length)} counties compared).`);
  }
  return { build, draw };
}
