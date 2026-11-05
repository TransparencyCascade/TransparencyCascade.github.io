/* Scatter: each county's change in Republican votes against its change in Democratic votes since the
   last race for the same office; or (state.sx = ms, the switch in the head) its margin in that earlier race against
   its swing since, with a running median line (arithmetic in ../swingview.js). One canvas: the circles move
   between the two charts. */
import { INK, GRAPHITE, RULE, DIM } from './style.js';

const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);

export function scatterView({ ctx, DUR, head, body, foot, place, inSel, shiftOf, dragGuard, nearest, hitLayer, statesOf, rows }) {
  const { fmt } = ctx;
  let svg, gTrail, gPts, gGuides, brushG, raw = false, byState = false, prev = new Map(), nearFn = () => null, tipOf = () => '';
  const guard = dragGuard();
  function build() {
    head.innerHTML = '<div class="seg v2d-seg sc-chart" role="group" aria-label="Chart"><button data-sx="" aria-pressed="true">Change in votes</button><button data-sx="ms" aria-pressed="false">Margin and swing</button></div>' +
      '<div class="seg v2d-seg sc-axes" role="group" aria-label="Axes"><button data-x="pct" aria-pressed="true">Percent change</button><button data-x="raw" aria-pressed="false">Votes</button></div>' +
      '<div class="seg v2d-seg" role="group" aria-label="Colour"><button data-k="margin" aria-pressed="true">Colour by margin</button><button data-k="state" aria-pressed="false">By state</button></div>';
    head.querySelectorAll('[data-sx]').forEach((b) => b.addEventListener('click', () => ctx.setSx(b.dataset.sx)));
    head.querySelectorAll('[data-x]').forEach((b) => b.addEventListener('click', () => { raw = b.dataset.x === 'raw'; head.querySelectorAll('[data-x]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(true); }));
    head.querySelectorAll('[data-k]').forEach((b) => b.addEventListener('click', () => { byState = b.dataset.k === 'state'; head.querySelectorAll('[data-k]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(false); }));
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-scatter');
    gGuides = svg.append('g').style('pointer-events', 'none'); gTrail = svg.append('g'); gPts = svg.append('g').style('pointer-events', 'none'); brushG = svg.append('g').attr('class', 'brush');
    hitLayer(svg, () => nearFn, (r, add) => ctx.select({ kind: 'counties', counties: [r.f] }, { add }), (r) => tipOf(r));
    foot.textContent = 'County totals cannot show individual voters switching: each point is the change in a county\'s Republican and Democratic vote counts.';
  }
  const stColour = (() => { const sts = Object.keys(statesOf).sort(); const m = {}; sts.forEach((s, i) => (m[s] = d3.interpolateRainbow(i / sts.length))); return (s) => m[s]; })();
  function draw(animate = true) {
    if (guard.on) { guard.held = animate; return; }
    const { w, h } = place();
    svg.attr('width', w).attr('height', h);
    const ms = ctx.sx() === 'ms';
    head.querySelectorAll('[data-sx]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.sx === (ms ? 'ms' : '')));
    head.querySelector('.sc-axes').hidden = ms;
    foot.textContent = ms ? 'Each point is a county: its margin in the earlier race against its swing since. The line is the median swing of the counties nearest in margin; it describes the counties, not voters.'
      : 'County totals cannot show individual voters switching: each point is the change in a county\'s Republican and Democratic vote counts.';
    if (ms) return drawMS(animate, w, h);
    const R = rows().filter((r) => r.v && r.b && r.b[1] > 0 && r.b[2] > 0);
    const dx = (r) => (raw ? r.v[1] - r.b[1] : (r.v[1] - r.b[1]) / r.b[1] * 100);
    const dy = (r) => (raw ? r.v[2] - r.b[2] : (r.v[2] - r.b[2]) / r.b[2] * 100);
    const narrow = w < 520, pad = { l: narrow ? 44 : 64, r: narrow ? 8 : 18, t: 18, b: 44 };
    const q = (arr, p) => d3.quantile(arr.slice().sort(d3.ascending), p);
    const xsV = R.map(dx), ysV = R.map(dy);
    // Each axis spans its own 0.5th to 99.5th percentile and zero, so the cloud fills the frame.
    const dom = (vs) => { let a = Math.min(q(vs, 0.005), 0), b = Math.max(q(vs, 0.995), 0); if (!isFinite(a) || !isFinite(b) || a === b) { a = -1; b = 1; } const p = (b - a) * 0.06; return [a - p, b + p]; };
    const [xlo, xhi] = dom(xsV), [ylo, yhi] = dom(ysV);
    const mk = (d, range) => (raw ? d3.scaleSymlog().constant(500) : d3.scaleLinear()).domain(d).range(range).clamp(true);
    const xs = mk([xlo, xhi], [pad.l, w - pad.r]), ys = mk([ylo, yhi], [h - pad.b, pad.t]);
    const vmax = d3.max(R, (r) => r.v[0]) || 1, rad = (r) => Math.max(1, 10 * Math.sqrt(r.v[0] / vmax));
    const beyond = R.filter((r) => dx(r) < xlo || dx(r) > xhi || dy(r) < ylo || dy(r) > yhi).length;
    // Guides: axes through zero, the diagonal (both parties changed by the same amount), plain quadrant labels.
    gGuides.selectAll('*').remove();
    const fmtT = (t) => (raw ? d3.format('~s')(t) : t + '%');
    for (const t of xs.ticks(7)) { gGuides.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', RULE).attr('stroke-width', 0.5);
      gGuides.append('text').attr('class', 'tick').attr('x', xs(t)).attr('y', h - pad.b + 14).attr('text-anchor', 'middle').text(fmtT(t)); }
    for (const t of ys.ticks(7)) { gGuides.append('line').attr('y1', ys(t)).attr('y2', ys(t)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', RULE).attr('stroke-width', 0.5);
      gGuides.append('text').attr('class', 'tick').attr('x', pad.l - 6).attr('y', ys(t) + 4).attr('text-anchor', 'end').text(fmtT(t)); }
    gGuides.append('line').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', INK).attr('stroke-width', 1.2);
    gGuides.append('line').attr('y1', ys(0)).attr('y2', ys(0)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', INK).attr('stroke-width', 1.2);
    const d0 = Math.max(xlo, ylo), d1 = Math.min(xhi, yhi);
    if (d1 > d0) gGuides.append('line').attr('x1', xs(d0)).attr('y1', ys(d0)).attr('x2', xs(d1)).attr('y2', ys(d1)).attr('stroke', INK).attr('stroke-dasharray', '4 4').attr('stroke-width', 0.8);
    gGuides.append('text').attr('class', 'axis-title').attr('x', (pad.l + w - pad.r) / 2).attr('y', h - 8).attr('text-anchor', 'middle')
      .text(narrow ? `Republican votes${raw ? '' : ', % change'}` : `Change in Republican votes since ${ctx.baselineLabel()}${raw ? '' : ', percent'}`);
    gGuides.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(pad.t + h - pad.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle')
      .text(narrow ? `Democratic votes${raw ? '' : ', % change'}` : `Change in Democratic votes${raw ? '' : ', percent'}`);
    const quads = [
      { k: 'ne', x: xhi, y: yhi, a: 'end', t: 'Both grew', f: (r) => dx(r) > 0 && dy(r) > 0 },
      { k: 'sw', x: xlo, y: ylo, a: 'start', t: 'Both fell', f: (r) => dx(r) < 0 && dy(r) < 0 },
      { k: 'nw', x: xlo, y: yhi, a: 'start', t: narrow ? 'D up, R down' : 'Democrats up, Republicans down', f: (r) => dx(r) <= 0 && dy(r) > 0 },
      { k: 'se', x: xhi, y: ylo, a: 'end', t: narrow ? 'R up, D down' : 'Republicans up, Democrats down', f: (r) => dx(r) > 0 && dy(r) <= 0 },
    ];
    for (const qd of quads) {
      gGuides.append('text').attr('class', 'quad').attr('x', xs(qd.x) + (qd.a === 'start' ? 8 : -8)).attr('y', ys(qd.y) + (qd.y === yhi ? 16 : -10))
        .attr('text-anchor', qd.a).text(qd.t).style('cursor', 'pointer').style('pointer-events', 'auto')
        .on('click', (ev) => ctx.select({ kind: 'counties', counties: R.filter(qd.f).map((r) => r.f), rule: 'q:' + qd.k }, { add: shiftOf(ev) }));
    }
    if (!narrow) gGuides.append('text').attr('class', 'tick').attr('x', xs(xhi) - 6).attr('y', ys(yhi) + 32).attr('text-anchor', 'end').text('dashed: both changed by the same share');
    if (beyond) gGuides.append('text').attr('class', 'tick').attr('x', w - pad.r).attr('y', pad.t - 4).attr('text-anchor', 'end').text(`${fmt(beyond)} counties beyond the axes are drawn at the edge`);
    // Points, with a short trail from where each sat in the previous view.
    const S = inSel(), pos = new Map(R.map((r) => [r.f, [xs(dx(r)), ys(dy(r))]]));
    gTrail.selectAll('*').interrupt().remove();
    if (animate && DUR && prev.size) {
      for (const r of R) { const a = prev.get(r.f), b = pos.get(r.f); if (a && (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) > 3) && r.v[0] > vmax * 0.004)
        gTrail.append('line').attr('x1', a[0]).attr('y1', a[1]).attr('x2', b[0]).attr('y2', b[1]).attr('stroke', GRAPHITE).attr('stroke-width', 0.7).attr('opacity', 0.5)
          .transition().delay(DUR).duration(1000).attr('opacity', 0).remove(); }
    }
    const c = gPts.selectAll('circle').data(R, (r) => r.f);
    c.exit().remove();
    const ce = c.enter().append('circle').attr('cx', (r) => (prev.get(r.f) || pos.get(r.f))[0]).attr('cy', (r) => (prev.get(r.f) || pos.get(r.f))[1]);
    tipOf = (r) => ctx.tipHtml(r.f) + `<br>Republican votes ${signedPct(r.v[1], r.b[1])}, Democratic ${signedPct(r.v[2], r.b[2])} since ${ctx.baselineLabel(r.st)}`;
    nearFn = nearest(svg.node(), R, (r) => pos.get(r.f), rad);
    const all = ce.merge(c).attr('r', rad).attr('fill', (r) => (byState ? stColour(r.st) : ctx.colour(r.m, true))).attr('fill-opacity', 0.8)
      .attr('stroke', 'rgba(35,48,107,.4)').attr('stroke-width', 0.3).attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 1));
    (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (r) => pos.get(r.f)[0]).attr('cy', (r) => pos.get(r.f)[1]);
    all.sort((a, b) => b.v[0] - a.v[0]);
    prev = pos;
    // Box select.
    const brush = d3.brush().extent([[pad.l, pad.t], [w - pad.r, h - pad.b]]).on('start', guard.start).on('end', (ev) => {
      if (!ev.sourceEvent) return; guard.end(draw);
      if (!ev.selection) { const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
      const [[x0, y0], [x1, y1]] = ev.selection;
      const sel = R.filter((r) => { const p = pos.get(r.f); return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; }).map((r) => r.f);
      brushG.call(brush.move, null);
      // The box goes into the link as a rule in percent units; a box drawn in vote units is kept as its counties.
      if (sel.length) ctx.select({ kind: 'counties', counties: sel, rule: raw ? undefined : 'b:' + [xs.invert(x0), xs.invert(x1), ys.invert(y1), ys.invert(y0)].map((v) => v.toFixed(1)).join(',') }, { add: shiftOf(ev.sourceEvent) });
    });
    brushG.call(brush);
    gGuides.raise();   // above the brush, but only the quadrant labels take the pointer
    // Quadrant counts, as plain sentences, for the selection or for every county shown.
    const base = S ? R.filter((r) => S.has(r.f)) : R;
    const n = (f) => base.filter(f).length;
    const cn = (k) => `${fmt(k)} ${k === 1 ? 'county' : 'counties'}`;
    ctx.viewNote(`Since ${ctx.baselineLabel()}, ${S ? 'in the selection' : 'of the ' + fmt(R.length) + ' counties shown'}: Democrats gained votes while Republicans lost them in ${cn(n(quads[2].f))}; ` +
      `the reverse in ${cn(n(quads[3].f))}; both parties gained in ${cn(n(quads[0].f))}; both lost in ${cn(n(quads[1].f))}.`);
  }
  // ---------- margin against swing ----------
  function drawMS(animate, w, h) {
    const R = ctx.ms.rows(), narrow = w < 520, pad = { l: narrow ? 44 : 64, r: narrow ? 8 : 18, t: 18, b: 44 };
    const q = (arr, p) => d3.quantile(arr.slice().sort(d3.ascending), p);
    const xsV = R.map((r) => r.x), ysV = R.map((r) => r.y);
    const dom = (vs) => { let a = Math.min(q(vs, 0.005), 0), b = Math.max(q(vs, 0.995), 0); if (!isFinite(a) || !isFinite(b) || a === b) { a = -1; b = 1; } const p = (b - a) * 0.06; return [a - p, b + p]; };
    const [xlo, xhi] = dom(xsV), [ylo, yhi] = dom(ysV);
    const xs = d3.scaleLinear().domain([xlo, xhi]).range([pad.l, w - pad.r]).clamp(true), ys = d3.scaleLinear().domain([ylo, yhi]).range([h - pad.b, pad.t]).clamp(true);
    const vmax = d3.max(R, (r) => r.v[0]) || 1, rad = (r) => Math.max(1, 10 * Math.sqrt(r.v[0] / vmax));
    const beyond = R.filter((r) => r.x < xlo || r.x > xhi || r.y < ylo || r.y > yhi).length;
    const bl = ctx.baselineLabel();
    gGuides.selectAll('*').remove();
    for (const t of xs.ticks(8)) { gGuides.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', RULE).attr('stroke-width', 0.5);
      gGuides.append('text').attr('class', 'tick').attr('x', xs(t)).attr('y', h - pad.b + 14).attr('text-anchor', 'middle').text(t); }
    for (const t of ys.ticks(7)) { gGuides.append('line').attr('y1', ys(t)).attr('y2', ys(t)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', RULE).attr('stroke-width', 0.5);
      gGuides.append('text').attr('class', 'tick').attr('x', pad.l - 6).attr('y', ys(t) + 4).attr('text-anchor', 'end').text(t); }
    gGuides.append('line').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', pad.t).attr('y2', h - pad.b).attr('stroke', INK).attr('stroke-width', 1.2);
    gGuides.append('line').attr('y1', ys(0)).attr('y2', ys(0)).attr('x1', pad.l).attr('x2', w - pad.r).attr('stroke', INK).attr('stroke-width', 1.2);
    gGuides.append('text').attr('class', 'axis-title').attr('x', (pad.l + w - pad.r) / 2).attr('y', h - 8).attr('text-anchor', 'middle')
      .text(narrow ? 'Margin in the earlier race, points' : `Democratic margin in ${bl}, points (right: Democratic)`);
    // The vertical title takes the longest wording that fits the plot's height.
    const yt = gGuides.append('text').attr('class', 'axis-title').attr('transform', `translate(14,${(pad.t + h - pad.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle');
    for (const t of [`Swing since ${bl}, points (up: toward Democrats)`, `Swing since ${bl}, points`, 'Swing, points']) { yt.text(t); if (yt.node().getComputedTextLength() <= h - pad.t - pad.b) break; }
    const quads = [
      { k: 'ne', x: xhi, y: yhi, a: 'end', t: narrow ? 'D, toward D' : 'Democratic then, moved toward Democrats' },
      { k: 'se', x: xhi, y: ylo, a: 'end', t: narrow ? 'D, toward R' : 'Democratic then, moved toward Republicans' },
      { k: 'nw', x: xlo, y: yhi, a: 'start', t: narrow ? 'R, toward D' : 'Republican then, moved toward Democrats' },
      { k: 'sw', x: xlo, y: ylo, a: 'start', t: narrow ? 'R, toward R' : 'Republican then, moved toward Republicans' },
    ];
    for (const qd of quads) {
      gGuides.append('text').attr('class', 'quad').attr('x', xs(qd.x) + (qd.a === 'start' ? 8 : -8)).attr('y', ys(qd.y) + (qd.y === yhi ? 16 : -10))
        .attr('text-anchor', qd.a).text(qd.t).style('cursor', 'pointer').style('pointer-events', 'auto')
        .on('click', (ev) => ctx.select({ kind: 'counties', counties: R.filter((r) => ctx.ms.QUADS[qd.k](r.x, r.y)).map((r) => r.f), rule: 'n:' + qd.k }, { add: shiftOf(ev) }));
    }
    if (beyond) gGuides.append('text').attr('class', 'tick').attr('x', w - pad.r).attr('y', pad.t - 4).attr('text-anchor', 'end').text(`${fmt(beyond)} counties beyond the axes are drawn at the edge`);
    // The running median, over the counties nearest in margin.
    const run = ctx.ms.running(R), step = Math.max(1, Math.floor(run.line.length / Math.max(1, w - pad.l - pad.r)));
    gGuides.append('path').datum(run.line.filter((_, i) => i % step === 0 || i === run.line.length - 1)).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2.6).attr('stroke-linejoin', 'round')
      .attr('d', d3.line().x((p) => xs(p.x)).y((p) => ys(p.y))).style('pointer-events', 'none');
    if (!narrow) gGuides.append('text').attr('class', 'tick').attr('x', pad.l).attr('y', pad.t - 4).text(`Line: median swing of the ${fmt(run.window)} counties nearest in margin`);
    // Points.
    const S = inSel(), pos = new Map(R.map((r) => [r.f, [xs(r.x), ys(r.y)]]));
    gTrail.selectAll('*').interrupt().remove();
    const c = gPts.selectAll('circle').data(R, (r) => r.f);
    c.exit().remove();
    const ce = c.enter().append('circle').attr('cx', (r) => (prev.get(r.f) || pos.get(r.f))[0]).attr('cy', (r) => (prev.get(r.f) || pos.get(r.f))[1]);
    tipOf = (r) => ctx.tipHtml(r.f) + `<br>Margin in ${ctx.baselineLabel(r.st)} ${lead(r.x)}; swing ${Math.abs(r.y).toFixed(1)} points toward ${r.y >= 0 ? 'Democrats' : 'Republicans'}`;
    nearFn = nearest(svg.node(), R, (r) => pos.get(r.f), rad);
    const all = ce.merge(c).attr('r', rad).attr('fill', (r) => (byState ? stColour(r.st) : ctx.colour(r.m, true))).attr('fill-opacity', 0.8)
      .attr('stroke', 'rgba(35,48,107,.4)').attr('stroke-width', 0.3).attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 1));
    (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (r) => pos.get(r.f)[0]).attr('cy', (r) => pos.get(r.f)[1]);
    all.sort((a, b) => b.v[0] - a.v[0]);
    prev = pos;
    const brush = d3.brush().extent([[pad.l, pad.t], [w - pad.r, h - pad.b]]).on('start', guard.start).on('end', (ev) => {
      if (!ev.sourceEvent) return; guard.end(draw);
      if (!ev.selection) { const r = nearFn(ev.sourceEvent.clientX, ev.sourceEvent.clientY); if (r) ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev.sourceEvent) }); return; }
      const [[x0, y0], [x1, y1]] = ev.selection;
      const sel = R.filter((r) => { const p = pos.get(r.f); return p[0] >= x0 && p[0] <= x1 && p[1] >= y0 && p[1] <= y1; }).map((r) => r.f);
      brushG.call(brush.move, null);
      if (sel.length) ctx.select({ kind: 'counties', counties: sel, rule: 'g:' + [xs.invert(x0), xs.invert(x1), ys.invert(y1), ys.invert(y0)].map((v) => v.toFixed(1)).join(',') }, { add: shiftOf(ev.sourceEvent) });
    });
    brushG.call(brush);
    gGuides.raise();
    const base = S ? R.filter((r) => S.has(r.f)) : R, n = (k) => base.filter((r) => ctx.ms.QUADS[k](r.x, r.y)).length, cn = (k) => `${fmt(k)} ${k === 1 ? 'county' : 'counties'}`;
    const sm = ctx.ms.summarize(base);
    ctx.viewNote(`Since ${bl}, ${S ? 'in the selection' : 'of the ' + fmt(R.length) + ' counties shown'}: Democratic in the earlier race and moved toward Democrats in ${cn(n('ne'))}, toward Republicans in ${cn(n('se'))}; ` +
      `Republican and moved toward Democrats in ${cn(n('nw'))}, toward Republicans in ${cn(n('sw'))}.` +
      (sm.medAll != null ? ` Median swing ${Math.abs(sm.medAll).toFixed(1)} points toward ${sm.medAll >= 0 ? 'Democrats' : 'Republicans'}.` : ''));
  }
  const signedPct = (a, b) => { const p = (a - b) / b * 100; return (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%'; };
  return { build, draw };
}
