/* Turnout drop-off, flat: each county a circle (area = the midterm race's votes), its midterm votes as a share of the
   presidential year's votes two years before (vertical) against its margin in the midterm race (horizontal). In 2026 a band
   behind the points shows the 2022 pattern: the middle 80 percent and the median share of counties of similar margin, in bins
   of 10 points, for 2022's counties against 2020 (arithmetic in ../turnout.js). The race used is the Senate where the state
   has Senate county results that year, else the governor; states with neither are left out and named in the head.
   Two buttons colour the Terrain and the Circles by the same measure (state.c = drop). */
import { INK, GRAPHITE, RULE, DIM } from './style.js';

const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
const pct = (x) => (x * 100).toFixed(0) + '%';

export function dropoffView({ ctx, DUR, head, body, place, inSel, shiftOf, dragGuard, nearest, hitLayer }) {
  const { fmt } = ctx;
  let svg, gG, gP, brushG, nearFn = () => null, tipOf = () => '';
  const guard = dragGuard();
  function build() {
    head.innerHTML = '<span class="v2d-ref do-note"></span><div class="seg v2d-seg" role="group" aria-label="Colour the maps by drop-off"><button data-do="terrain">Colour the Terrain</button><button data-do="circles">Colour the Circles</button></div>';
    head.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => ctx.colourDrop(b.dataset.do)));
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-scatter');
    gG = svg.append('g').style('pointer-events', 'none'); gP = svg.append('g').style('pointer-events', 'none'); brushG = svg.append('g').attr('class', 'brush');
    hitLayer(svg, () => nearFn, (r, add) => ctx.select({ kind: 'counties', counties: [r.f] }, { add }), (r) => tipOf(r));
  }
  function draw(animate = true) {
    if (guard.on) { guard.held = animate; return; }
    const P = ctx.dropoff(), D = P.D, R = D.rows, S = inSel();
    const names = (xs) => xs.map((s) => s).join(', ');
    const govSts = D.per.filter((p) => p.race === 'gov').map((p) => p.st);
    head.querySelector('.do-note').textContent = `${D.year} against ${P.baseYear}: ${fmt(R.length)} counties in ${D.per.length} states. Race used: the Senate in ${D.nSen} states${D.nGov ? `, the governor's in ${D.nGov} (${names(govSts)})` : ''}. ` +
      `Left out, no statewide Senate or governor race with county results in ${D.year}: ${names(D.noRace)}.${D.year === 2026 ? ' 2026 counts are unofficial and may be incomplete.' : ''}`;
    const { w, h } = place(), narrow = w < 520, pad = { l: narrow ? 44 : 60, r: narrow ? 8 : 18, t: 14, b: 44 };
    svg.attr('width', w).attr('height', h);
    const q = (arr, p) => d3.quantile(arr.slice().sort(d3.ascending), p);
    const mx = R.map((r) => r.m), ry = R.map((r) => r.r);
    const xlo = Math.floor(Math.min(q(mx, 0.005), -10) / 10) * 10, xhi = Math.ceil(Math.max(q(mx, 0.995), 10) / 10) * 10;
    const ylo = Math.floor(Math.min(q(ry, 0.005), 0.5) * 10) / 10, yhi = Math.ceil(Math.max(q(ry, 0.995), 1) * 10) / 10;
    const xs = d3.scaleLinear().domain([xlo, xhi]).range([pad.l, w - pad.r]).clamp(true), ys = d3.scaleLinear().domain([ylo, yhi]).range([h - pad.b, pad.t]).clamp(true);
    gG.selectAll('*').remove();
    for (const t of xs.ticks(8)) { gG.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.2 : 0.5);
      gG.append('text').attr('class', 'tick').attr('x', xs(t)).attr('y', h - pad.b + 14).attr('text-anchor', 'middle').text(t === 0 ? 'even' : (t > 0 ? 'D' : 'R') + Math.abs(t)); }
    for (const t of ys.ticks(7)) { gG.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', ys(t)).attr('y2', ys(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      gG.append('text').attr('class', 'tick').attr('x', pad.l - 6).attr('y', ys(t) + 4).attr('text-anchor', 'end').text(Math.round(t * 100) + '%'); }
    gG.append('text').attr('class', 'axis-title').attr('x', (pad.l + w - pad.r) / 2).attr('y', h - 8).attr('text-anchor', 'middle').text(narrow ? `Margin, ${D.year} race` : `Margin in the ${D.year} race used, points (Democratic minus Republican)`);
    gG.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(pad.t + h - pad.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text(narrow || h < 330 ? `Share of ${P.baseYear} votes` : `${D.year} votes as a share of the ${P.baseYear} presidential votes`);
    // The reference band: the 2022 pattern.
    if (P.band && P.band.length) {
      const area = d3.area().x((b) => xs(b.x)).y0((b) => ys(b.lo)).y1((b) => ys(b.hi)).curve(d3.curveMonotoneX);
      gG.append('path').attr('d', area(P.band)).attr('fill', 'rgba(35,48,107,.13)').attr('stroke', 'none');
      gG.append('path').attr('d', d3.line().x((b) => xs(b.x)).y((b) => ys(b.med)).curve(d3.curveMonotoneX)(P.band)).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 1.4).attr('stroke-dasharray', '5 3');
      gG.append('text').attr('class', 'quad halo').attr('x', pad.l + 6).attr('y', pad.t + 14).text(narrow ? '2022 band' : 'Band: 2022, middle 80% (line: median)');
    }
    gG.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', ys(D.all)).attr('y2', ys(D.all)).attr('stroke', GRAPHITE).attr('stroke-width', 0.9).attr('stroke-dasharray', '1 3');
    gG.append('text').attr('class', 'tick halo').attr('x', w - pad.r - 2).attr('y', ys(D.all) - 4).attr('text-anchor', 'end').text(`all counties shown, together: ${pct(D.all)}`);
    const beyond = R.filter((r) => r.m < xlo || r.m > xhi || r.r < ylo || r.r > yhi).length;
    if (beyond) gG.append('text').attr('class', 'tick halo').attr('x', w - pad.r).attr('y', pad.t + 12).attr('text-anchor', 'end').text(narrow ? `${fmt(beyond)} at the edge` : `${fmt(beyond)} counties past the axes, drawn at the edge`);
    const vmax = d3.max(R, (r) => r.v[0]) || 1, rad = (r) => Math.max(1, 10 * Math.sqrt(r.v[0] / vmax));
    const pos = new Map(R.map((r) => [r.f, [xs(r.m), ys(r.r)]]));
    const raceName = (r) => (r.race === 'sen' ? 'Senate' : 'Governor');
    tipOf = (r) => `<b>${ctx.countyLabel(r.f)}</b><br>${raceName(r)} ${D.year}${D.year === 2026 ? ' (unofficial)' : ''}: ${fmt(r.v[0])} votes, margin ${lead(r.m)}<br>President ${P.baseYear}: ${fmt(r.b[0])} votes<br>${D.year} votes were ${pct(r.r)} of ${P.baseYear}'s (all counties shown: ${pct(D.all)})`;
    nearFn = nearest(svg.node(), R, (r) => pos.get(r.f), rad);
    const c = gP.selectAll('circle').data(R, (r) => r.f);
    c.exit().remove();
    const all = c.enter().append('circle').merge(c).attr('r', rad).attr('fill', (r) => ctx.colour(r.m, true)).attr('fill-opacity', 0.78).attr('stroke', 'rgba(35,48,107,.4)').attr('stroke-width', 0.3)
      .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 1)).attr('cx', (r) => pos.get(r.f)[0]).attr('cy', (r) => pos.get(r.f)[1]);
    all.sort((a, b) => b.v[0] - a.v[0]);
    const brush = d3.brush().extent([[pad.l, pad.t], [w - pad.r, h - pad.b]]).on('start', guard.start).on('end', (ev) => {
      if (!ev.sourceEvent) return; guard.end(draw);
      if (!ev.selection) { const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
      const [[x0, y0], [x1, y1]] = ev.selection, fs = R.filter((r) => { const p = pos.get(r.f); return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; }).map((r) => r.f);
      brushG.call(brush.move, null);
      if (fs.length) ctx.select({ kind: 'counties', counties: fs }, { add: shiftOf(ev.sourceEvent) });
    });
    brushG.call(brush); gG.raise();
    const base = S ? R.filter((r) => S.has(r.f)) : R;
    ctx.viewNote(S ? `In the selection (${fmt(base.length)} counties with a ${D.year} result): the middle county's ${D.year} votes were ${pct(d3.median(base, (r) => r.r) || 0)} of ${P.baseYear}'s; all counties shown together: ${pct(D.all)}.`
      : P.cmp ? `${fmt(P.cmp.below)} of the ${fmt(P.cmp.n)} counties lie below the 2022 band for counties of their margin and ${fmt(P.cmp.above)} above it.` : '');
  }
  return { build, draw };
}
