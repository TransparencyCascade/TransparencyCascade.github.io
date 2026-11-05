/* Arrows: one arrow per county, leaning toward the party it swung to, its length the swing. */
import { INK, DIM } from './style.js';

export function arrowsView({ ctx, meta, DUR, head, body, foot, place, inSel, shiftOf, longPress, countyPath, centroid, bboxOf, statePath, W0, statesOf, rows }) {
  const { fmt } = ctx;
  let svg, g, zoom, gMap, gArr, zoomedSt = null, byVotes = false, exceptions = false, k0 = 1, fitted = null;
  const PX_PER_POINT = 0.8;            // arrow length per point of swing, in map units at national scale
  function build() {
    fitted = null;                     // a new svg starts unzoomed: fit it on its first draw, whatever the size
    head.innerHTML = '<div class="seg v2d-seg" role="group" aria-label="Arrow options"><button data-a="votes" aria-pressed="false">Width by votes</button><button data-a="exc" aria-pressed="false">Only the exceptions</button></div>' +
      '<span class="v2d-ref" aria-hidden="true"></span>';
    head.querySelector('[data-a="votes"]').addEventListener('click', (e) => { byVotes = !byVotes; e.currentTarget.setAttribute('aria-pressed', byVotes); draw(false); });
    head.querySelector('[data-a="exc"]').addEventListener('click', (e) => { exceptions = !exceptions; e.currentTarget.setAttribute('aria-pressed', exceptions); draw(true); });
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-map');
    g = svg.append('g'); gMap = g.append('g'); gArr = g.append('g');
    gMap.selectAll('path.c').data(Object.keys(countyPath)).join('path').attr('class', 'c').attr('d', (f) => countyPath[f])
      .attr('fill', '#DCE1E2').attr('stroke', '#E8ECEC').attr('stroke-width', 0.25)
      .on('click', (ev, f) => {
        if (shiftOf(ev)) { ctx.select({ kind: 'counties', counties: [f] }, { add: true }); return; }
        const st = meta[f] && meta[f].st;
        if (zoomedSt !== st) zoomTo(st); else ctx.select({ kind: 'counties', counties: [f] });
      })
      .on('mousemove', (ev, f) => ctx.hover(f, ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    gMap.append('path').attr('class', 'states').attr('d', statePath).attr('fill', 'none').attr('stroke', 'rgba(35,48,107,.5)').attr('stroke-width', 0.6).attr('pointer-events', 'none');
    zoom = d3.zoom().scaleExtent([1, 14]).on('zoom', (ev) => { g.attr('transform', ev.transform); const k = ev.transform.k / k0; gArr.selectAll('path').attr('stroke-width', (r) => width(r) / k); });
    svg.call(zoom).on('dblclick.zoom', null);
    svg.on('click', (ev) => { if (ev.target === svg.node() && zoomedSt) { zoomedSt = null; reset(); } });
  }
  let vmax = 1;
  const width = (r) => (byVotes ? 0.4 + 3.2 * Math.sqrt(r.v[0] / vmax) : 0.9);
  const fit = () => { const { w, h } = place(); const sx = (w - 20) / (W0[2] - W0[0]), sy = (h - 20) / (W0[3] - W0[1]); k0 = Math.min(sx, sy);
    return d3.zoomIdentity.translate((w - (W0[2] - W0[0]) * k0) / 2 - W0[0] * k0, (h - (W0[3] - W0[1]) * k0) / 2 - W0[1] * k0).scale(k0); };
  const reset = () => { const t = fit(); svg.transition().duration(DUR).call(zoom.transform, t); zoom.scaleExtent([k0, k0 * 14]); };
  function zoomTo(st) {
    zoomedSt = st; const fs = statesOf[st] || []; if (!fs.length) return;
    let b = [Infinity, Infinity, -Infinity, -Infinity]; for (const f of fs) { const q = bboxOf[f]; b = [Math.min(b[0], q[0]), Math.min(b[1], q[1]), Math.max(b[2], q[2]), Math.max(b[3], q[3])]; }
    const { w, h } = place(), k = Math.min((w - 60) / (b[2] - b[0]), (h - 60) / (b[3] - b[1]), k0 * 14);
    svg.transition().duration(DUR).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * (b[0] + b[2]) / 2, h / 2 - k * (b[1] + b[3]) / 2).scale(k));
  }
  // Leaning left toward Democrats, right toward Republicans, at 45 degrees; length proportional to swing.
  const arrowD = (r, s) => {
    const c = centroid[r.f]; if (!c || s == null) return 'M0,0';
    const L = Math.abs(s) * PX_PER_POINT, dir = s >= 0 ? -1 : 1, dx = dir * L * Math.SQRT1_2, dy = -L * Math.SQRT1_2;
    const x1 = c[0] + dx, y1 = c[1] + dy, hl = Math.min(2.2, 0.25 + L * 0.28), a = Math.atan2(dy, dx);
    const h1 = [x1 - hl * Math.cos(a - 0.5), y1 - hl * Math.sin(a - 0.5)], h2 = [x1 - hl * Math.cos(a + 0.5), y1 - hl * Math.sin(a + 0.5)];
    return `M${c[0].toFixed(1)},${c[1].toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}M${h1[0].toFixed(1)},${h1[1].toFixed(1)}L${x1.toFixed(1)},${y1.toFixed(1)}L${h2[0].toFixed(1)},${h2[1].toFixed(1)}`;
  };
  function draw(animate = true) {
    // The foot's text first: it takes height from the map, so the fit below must see it.
    foot.textContent = `Arrows: swing since ${ctx.baselineLabel()}. Click a state to zoom in; click a county there to select it. Shift-click to add.`;
    const { w, h } = place();
    svg.attr('width', w).attr('height', h);
    if (fitted !== w + 'x' + h) { fitted = w + 'x' + h; svg.call(zoom.transform, fit()); zoom.scaleExtent([k0, k0 * 14]); }
    const R = rows().filter((r) => r.v && r.s != null);
    vmax = d3.max(R, (r) => r.v[0]) || 1;
    const toD = R.filter((r) => r.s > 0).length, toR = R.filter((r) => r.s < 0).length, majority = toD >= toR ? 1 : -1;
    const shown = exceptions ? R.filter((r) => Math.sign(r.s) !== majority) : R;
    const S = inSel(), k = (d3.zoomTransform(svg.node()).k || k0) / k0;
    gMap.selectAll('path.c').attr('fill', (f) => (S && S.has(f) ? '#C9D1E6' : '#DCE1E2'));
    const p = gArr.selectAll('path').data(shown, (r) => r.f);
    p.exit().remove();
    const pe = p.enter().append('path').attr('fill', 'none').attr('stroke-linecap', 'round').attr('stroke-linejoin', 'round').attr('d', (r) => arrowD(r, 0))
      .on('mousemove', (ev, r) => ctx.hover(r.f, ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null))
      .on('click', (ev, r) => ctx.select({ kind: 'counties', counties: [r.f] }, { add: shiftOf(ev) }));
    pe.each(function (r) { longPress(this, () => ctx.select({ kind: 'counties', counties: [r.f] }, { add: true })); });
    const all = pe.merge(p).attr('stroke', (r) => ctx.colour(r.s)).attr('stroke-width', (r) => width(r) / k)
      .attr('opacity', (r) => (S && !S.has(r.f) ? DIM : 0.92));
    (animate && DUR ? all.transition().duration(DUR) : all).attr('d', (r) => arrowD(r, r.s));
    // Reference arrow, drawn at the map's current scale.
    const L = 20 * PX_PER_POINT * (d3.zoomTransform(svg.node()).k || k0);
    head.querySelector('.v2d-ref').innerHTML = `<svg width="${Math.ceil(L * 0.75 + 16)}" height="${Math.ceil(L * 0.75 + 10)}" style="vertical-align:middle"><path d="M${L * 0.71 + 6},${L * 0.71 + 4}L6,4M6,${4 + Math.min(8, L * .3)}L6,4L${6 + Math.min(8, L * .3)},4" stroke="${INK}" stroke-width="1.5" fill="none"/></svg> 20 points toward the Democrat; ` +
      `${fmt(toD)} counties moved toward the Democrat, ${fmt(toR)} toward the Republican${exceptions ? '; only the exceptions shown' : ''}`;
  }
  return { build, draw, reset: () => { zoomedSt = null; reset(); }, zoomTo };
}
