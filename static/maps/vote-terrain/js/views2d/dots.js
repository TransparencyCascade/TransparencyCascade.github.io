/* Dots: every county on a margin or swing axis (a beeswarm, dot area = votes), with a strip per state below. */
import { INK, GRAPHITE, RULE, DIM, OV_INK } from './style.js';

export function dotsView({ ctx, DUR, head, body, place, inSel, shiftOf, dragGuard, nearest, hitLayer, rows }) {
  const { fmt } = ctx;
  let svg, gBand, gRows, brushG, rowsBox, sortKey = 'median', nodes = new Map(), lastKey = '', nearFn = () => null;
  const guard = dragGuard();
  const RADIUS = 9;
  function build() {
    head.innerHTML = '<span class="v2d-label v2d-sort">Sort states by</span><div class="seg v2d-seg" role="group" aria-label="Sort states by">' +
      ['median', 'spread', 'counties', 'biggest'].map((k) => `<button data-sort="${k}" aria-pressed="${k === sortKey}">${{ median: 'Median', spread: 'Spread', counties: 'Counties', biggest: 'Biggest county' }[k]}</button>`).join('') + '</div>';
    head.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sortKey = b.dataset.sort; head.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(true); }));
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-band');
    gBand = svg.append('g'); brushG = svg.append('g').attr('class', 'brush');
    svg.append('g').attr('class', 'brush-note').append('text');
    hitLayer(svg, () => nearFn, (r, add) => ctx.select({ kind: 'counties', counties: [r.f] }, { add }));
    rowsBox = d3.select(body).append('div').attr('class', 'v2d-rows');
    gRows = rowsBox.append('svg');
  }
  function draw(animate = true) {
    if (guard.on) { guard.held = animate; return; }
    const { w, h } = place(), narrow = w < 520;
    const R = rows().filter((r) => r.v);
    const swingMode = ctx.mode() === 'swing';
    const val = (r) => (swingMode ? r.s : r.m);
    const data = R.filter((r) => val(r) != null);
    const ext = d3.quantile(data.map((r) => Math.abs(val(r))).sort(d3.ascending), 0.995) || 10;
    const max = swingMode ? Math.max(10, Math.ceil(ext / 5) * 5) : Math.max(20, Math.ceil(ext / 10) * 10);
    const bandH = narrow ? Math.min(h * 0.62, 420) : Math.min(260, Math.max(170, h * 0.36));
    const pad = { l: narrow ? 46 : 120, r: 22, t: 34, b: 26 };
    const vmax = d3.max(data, (r) => r.v[0]) || 1, rad = (r) => Math.max(0.9, RADIUS * Math.sqrt(r.v[0] / vmax));
    // Horizontal axis on wide screens; vertical on phones (the state list scrolls below).
    const span = narrow ? [pad.t, bandH - pad.b] : [pad.l, w - pad.r];
    const xs = d3.scaleLinear().domain(narrow ? [max, -max] : [-max, max]).range(span).clamp(true);
    svg.attr('width', w).attr('height', bandH);
    // Beeswarm: the value fixes one axis, a collision pass spreads the other.
    const key = ctx.key() + '|' + w + '|' + bandH;
    const mid = narrow ? (pad.l + w - pad.r) / 2 : (pad.t + bandH - pad.b) / 2;
    const sim = data.map((r) => ({ r, rr: rad(r), a: xs(val(r)) }));
    if (key !== lastKey) {
      const fs = d3.forceSimulation(sim.map((n) => Object.assign(n, narrow ? { x: mid, y: n.a } : { x: n.a, y: mid })))
        .force(narrow ? 'y' : 'x', (narrow ? d3.forceY((n) => n.a) : d3.forceX((n) => n.a)).strength(1))
        .force(narrow ? 'x' : 'y', (narrow ? d3.forceX(mid) : d3.forceY(mid)).strength(0.05))
        .force('c', d3.forceCollide((n) => n.rr + 0.35).iterations(2)).stop();
      for (let i = 0; i < 160; i++) fs.tick();
      const lo = narrow ? pad.l : pad.t, hi = narrow ? w - pad.r : bandH - pad.b;
      for (const n of sim) { if (narrow) n.x = Math.max(lo, Math.min(hi, n.x)); else n.y = Math.max(lo, Math.min(hi, n.y)); nodes.set(n.r.f, { x: n.x, y: n.y }); }
      lastKey = key;
    }
    // Axis, zero line and labels.
    gBand.selectAll('.axis').remove();
    const ax = gBand.append('g').attr('class', 'axis');
    const ticks = xs.ticks(narrow ? 6 : 10);
    for (const t of ticks) {
      const p = xs(t);
      if (narrow) { ax.append('line').attr('x1', pad.l - 4).attr('x2', w - pad.r).attr('y1', p).attr('y2', p).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.5 : 0.6);
        ax.append('text').attr('x', pad.l - 7).attr('y', p + 4).attr('text-anchor', 'end').text(lab(t, swingMode)); }
      else { ax.append('line').attr('x1', p).attr('x2', p).attr('y1', pad.t - 6).attr('y2', bandH - pad.b + 4).attr('stroke', t === 0 ? INK : RULE).attr('stroke-width', t === 0 ? 1.5 : 0.6);
        ax.append('text').attr('x', p).attr('y', bandH - 6).attr('text-anchor', 'middle').text(lab(t, swingMode)); }
    }
    ax.append('text').attr('class', 'axis-title').attr('x', narrow ? 4 : pad.l).attr('y', 14)
      .text(swingMode ? `Swing since ${ctx.baselineLabel()}, points; dot area is votes` : `Margin, ${ctx.label()} (no earlier race for the same seat, so margin, not swing); dot area is votes`);
    const S = inSel();
    const circ = gBand.selectAll('circle.d').data(data, (r) => r.f);
    circ.exit().remove();
    const enter = circ.enter().append('circle').attr('class', 'd')
      .attr('cx', (r) => (nodes.get(r.f) || {}).x).attr('cy', (r) => (nodes.get(r.f) || {}).y).style('pointer-events', 'none');
    nearFn = nearest(svg.node(), data, (r) => { const n = nodes.get(r.f); return [n.x, n.y]; }, rad);
    const all = enter.merge(circ);
    all.attr('r', (r) => rad(r)).attr('fill', (r) => ctx.colour(val(r))).attr('stroke', 'rgba(35,48,107,.35)').attr('stroke-width', 0.3)
      .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.95));
    (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (r) => nodes.get(r.f).x).attr('cy', (r) => nodes.get(r.f).y);
    // Overlay: a dark ring around each marked county's dot.
    const O = ctx.overlay(), od = O ? data.filter((r) => O.has(r.f)) : [];
    const ov = gBand.selectAll('circle.ov').data(od, (r) => r.f);
    ov.exit().remove();
    const ovAll = ov.enter().append('circle').attr('class', 'ov').style('pointer-events', 'none').attr('fill', 'none').merge(ov)
      .attr('r', (r) => rad(r) + 1.6).attr('stroke', OV_INK).attr('stroke-width', 1.3)
      .attr('cx', (r) => nodes.get(r.f).x).attr('cy', (r) => nodes.get(r.f).y);
    ovAll.raise();
    // Brush along the value axis: live count and votes; the selection on release.
    const note = svg.select('.brush-note text').attr('class', 'brush-label').text('');
    const brush = (narrow ? d3.brushY().extent([[pad.l, pad.t], [w - pad.r, bandH - pad.b]]) : d3.brushX().extent([[pad.l, pad.t], [w - pad.r, bandH - pad.b]]))
      .on('brush', (ev) => { if (!ev.selection) return; const [lo, hi] = rangeOf(ev.selection); const c = data.filter((r) => val(r) >= lo && val(r) <= hi);
        const v = d3.sum(c, (r) => r.v[0]); note.attr('x', narrow ? w - pad.r : (ev.selection[0] + ev.selection[1]) / 2).attr('y', narrow ? ev.selection[0] - 4 : pad.t + 14)
          .attr('text-anchor', narrow ? 'end' : 'middle').text(`${fmt(c.length)} counties, ${fmt(v)} votes (${lab(lo, swingMode)} to ${lab(hi, swingMode)})`); })
      .on('start', guard.start)
      .on('end', (ev) => { if (!ev.sourceEvent) return; guard.end(draw);
        if (!ev.selection) { note.text(''); const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
        const [lo, hi] = rangeOf(ev.selection); const c = data.filter((r) => val(r) >= lo && val(r) <= hi).map((r) => r.f);
        brushG.call(brush.move, null); note.text('');
        if (c.length) ctx.select({ kind: 'counties', counties: c, rule: `r:${swingMode ? 's' : 'm'}:${lo.toFixed(1)}:${hi.toFixed(1)}` }, { add: shiftOf(ev.sourceEvent) }); });
    const rangeOf = (selPx) => { const a = xs.invert(selPx[0]), b = xs.invert(selPx[1]); return [Math.min(a, b), Math.max(a, b)]; };
    brushG.call(brush); brushG.raise(); svg.select('.brush-note').raise();
    // State strips.
    drawRows(data, val, xs, narrow, w, h - bandH - 8, swingMode, S);
  }
  const lab = (t0, swingMode) => { const t = Math.round(t0 * 10) / 10; return t === 0 ? (swingMode ? '0' : 'even') : swingMode ? `${Math.abs(t)} ${t > 0 ? 'D' : 'R'}` : `${t > 0 ? 'D' : 'R'}+${Math.abs(t)}`; };
  function drawRows(data, val, xs, narrow, w, hAvail, swingMode, S) {
    rowsBox.style('height', Math.max(80, hAvail) + 'px');
    const by = d3.group(data, (r) => r.st);
    const list = [...by].map(([st, rs]) => { const vs = rs.map(val).sort(d3.ascending), big = rs.reduce((a, b) => (b.v[0] > a.v[0] ? b : a));
      return { st, rs, med: d3.median(vs), q1: d3.quantile(vs, 0.25), q3: d3.quantile(vs, 0.75), n: rs.length, big: val(big) }; });
    const sorter = { median: (a, b) => b.med - a.med, spread: (a, b) => (b.q3 - b.q1) - (a.q3 - a.q1), counties: (a, b) => b.n - a.n, biggest: (a, b) => b.big - a.big }[sortKey];
    list.sort(sorter);
    const RH = narrow ? 22 : 18, padL = 120;
    const xr = narrow ? d3.scaleLinear().domain(xs.domain().slice().reverse()).range([padL, w - 22]).clamp(true) : xs;
    gRows.attr('width', w).attr('height', list.length * RH + 8);
    const g = gRows.selectAll('g.row').data(list, (d) => d.st);
    g.exit().remove();
    const ge = g.enter().append('g').attr('class', 'row');
    ge.append('rect').attr('class', 'hit').attr('x', 0).attr('height', RH).attr('fill', 'transparent');
    ge.append('text').attr('class', 'st').attr('x', 6);
    ge.append('line').attr('class', 'zero');
    ge.append('g').attr('class', 'ticks');
    ge.append('rect').attr('class', 'med');
    const gm = ge.merge(g);
    (DUR ? gm.transition().duration(DUR) : gm).attr('transform', (d, i) => `translate(0,${4 + i * RH})`);
    gm.select('.hit').attr('width', w).on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b><br>${d.n} counties${d.n >= 5 ? `<br>Median ${lab(Math.round(d.med * 10) / 10, swingMode)}; middle half ${lab(Math.round(d.q1 * 10) / 10, swingMode)} to ${lab(Math.round(d.q3 * 10) / 10, swingMode)}` : ''}<br><span style="color:${GRAPHITE}">Click to select its counties</span>`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null)).style('cursor', 'pointer');
    gm.select('.st').attr('y', RH / 2 + 4).text((d) => `${d.st}  ${d.n >= 5 ? lab(Math.round(d.med * 10) / 10, swingMode) : ''}`)
      .attr('font-weight', (d) => (S && d.rs.some((r) => S.has(r.f)) ? 700 : 400));
    gm.select('.zero').attr('x1', xr(0)).attr('x2', xr(0)).attr('y1', 2).attr('y2', RH - 2).attr('stroke', RULE);
    gm.each(function (d) {
      const t = d3.select(this).select('.ticks').selectAll('line').data(d.rs, (r) => r.f);
      t.exit().remove();
      t.enter().append('line').attr('y1', RH * 0.25).attr('y2', RH * 0.75).merge(t)
        .attr('x1', (r) => xr(val(r))).attr('x2', (r) => xr(val(r))).attr('stroke', (r) => ctx.colour(val(r))).attr('stroke-width', 1.2)
        .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.9));
    });
    gm.select('.med').attr('display', (d) => (d.n >= 5 ? null : 'none')).attr('x', (d) => xr(d.med) - 1.5).attr('y', 1).attr('width', 3).attr('height', RH - 2).attr('fill', INK);
  }
  return { build, draw };
}
