/* Circles: each county a circle, its area the votes (or the population it is apportioned for), nudged
   apart so none overlap (positions precomputed by build_circles.mjs; ctx.circles() hands over the layout for
   the election in view, or null while it loads). Drag draws a box; scroll or pinch zooms; Alt-drag or one
   finger pans. */
import { INK, DIM } from './style.js';

export function circlesView({ ctx, DUR, head, body, foot, place, inSel, shiftOf, longPress, statePath, W0 }) {
  let svg, g, gSt, gC, box, zoom, k0 = 1, cur = new Map(), lay = null, fitted = null;
  function build() {
    // How to use it sits behind an "i": read once, it should not take a line of the view.
    head.innerHTML = '<span class="v2d-ref" aria-hidden="true"></span><button class="lens-i" aria-label="How to use Circles">i</button>';
    ctx.infoButton(head.querySelector('.lens-i'), () => (window.matchMedia('(pointer: coarse)').matches
      ? 'Tap a circle to select it; long-press adds. Pinch to zoom; drag to pan.'
      : 'Drag a box to select; shift adds. Scroll or pinch to zoom; Alt-drag to pan.'));
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-map v2d-circles');
    g = svg.append('g'); gSt = g.append('g'); gC = g.append('g');
    gSt.append('path').attr('class', 'states').attr('d', statePath).attr('fill', 'none').attr('stroke', 'rgba(35,48,107,.22)').attr('stroke-width', 0.5).attr('pointer-events', 'none');
    box = svg.append('rect').attr('class', 'v2d-box').attr('fill', 'rgba(35,48,107,.08)').attr('stroke', INK).attr('stroke-dasharray', '3 3').attr('display', 'none');
    // Zoom takes the wheel, pinch and touch drags; a mouse drag is the box, unless Alt is held.
    zoom = d3.zoom().filter((ev) => ev.type === 'wheel' || ev.type.startsWith('touch') || (ev.type === 'mousedown' && ev.altKey && !ev.button))
      .on('zoom', (ev) => { g.attr('transform', ev.transform); gC.selectAll('circle').attr('stroke-width', 0.35 / (ev.transform.k / k0)); });
    svg.call(zoom).on('dblclick.zoom', null);
    const at = (ev) => { const b = svg.node().getBoundingClientRect(); return [ev.clientX - b.left, ev.clientY - b.top]; };
    // Circle under the pointer, in map units.
    const hit = (ev) => { if (!lay) return null; const t = d3.zoomTransform(svg.node()), [x, y] = t.invert(at(ev)); let best = null, bd = Infinity;
      for (const [f, c] of cur) { const d = Math.hypot(c.x - x, c.y - y) - c.r; if (d < bd) { bd = d; best = f; } }
      return bd <= 2 / (t.k / k0) ? best : null; };
    let down = null;
    svg.on('pointerdown.box', (ev) => { if (ev.pointerType !== 'mouse' || ev.button || ev.altKey) return; down = at(ev); svg.node().setPointerCapture(ev.pointerId); })
      .on('pointermove.box', (ev) => {
        if (!down) { if (ev.pointerType === 'mouse') { const f = hit(ev); if (f) ctx.hover(f, ev.clientX, ev.clientY); else ctx.hover(null); } return; }
        const p = at(ev); if (Math.hypot(p[0] - down[0], p[1] - down[1]) < 5) return;
        ctx.hover(null);
        box.attr('display', null).attr('x', Math.min(p[0], down[0])).attr('y', Math.min(p[1], down[1])).attr('width', Math.abs(p[0] - down[0])).attr('height', Math.abs(p[1] - down[1]));
      })
      .on('pointerup.box', (ev) => {
        if (!down) return; const p = at(ev), d0 = down; down = null; box.attr('display', 'none');
        if (Math.hypot(p[0] - d0[0], p[1] - d0[1]) < 5) { const f = hit(ev); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: shiftOf(ev) }); else if (!shiftOf(ev) && ctx.selection()) ctx.select(null); return; }
        const t = d3.zoomTransform(svg.node()), [x0, y0] = t.invert([Math.min(p[0], d0[0]), Math.min(p[1], d0[1])]), [x1, y1] = t.invert([Math.max(p[0], d0[0]), Math.max(p[1], d0[1])]);
        const fs = [...cur].filter(([, c]) => c.x >= x0 && c.x <= x1 && c.y >= y0 && c.y <= y1).map(([f]) => f);
        if (fs.length) ctx.select({ kind: 'counties', counties: fs }, { add: shiftOf(ev) });
      })
      .on('mouseleave.box', () => ctx.hover(null));
    // Touch: a tap selects, a long press adds.
    svg.on('click.tap', (ev) => { if (ev.pointerType && ev.pointerType !== 'mouse') { const f = hit(ev); if (f) ctx.select({ kind: 'counties', counties: [f] }); } });
    longPress(svg.node(), (ev) => { const tch = ev.touches && ev.touches[0]; const f = tch && hit(tch); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: true }); });
  }
  const fit = () => { const { w, h } = place(); const sx = (w - 16) / (W0[2] - W0[0]), sy = (h - 16) / (W0[3] - W0[1]); k0 = Math.min(sx, sy);
    return d3.zoomIdentity.translate((w - (W0[2] - W0[0]) * k0) / 2 - W0[0] * k0, (h - (W0[3] - W0[1]) * k0) / 2 - W0[1] * k0).scale(k0); };
  const reset = () => { const t = fit(); zoom.scaleExtent([k0 * 0.8, k0 * 24]); svg.transition().duration(DUR).call(zoom.transform, t); };
  function zoomTo(fs) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const f of fs) { const c = cur.get(f); if (c) b = [Math.min(b[0], c.x - c.r), Math.min(b[1], c.y - c.r), Math.max(b[2], c.x + c.r), Math.max(b[3], c.y + c.r)]; }
    if (!isFinite(b[0])) return;
    const { w, h } = place(), k = Math.min((w - 80) / Math.max(8, b[2] - b[0]), (h - 80) / Math.max(8, b[3] - b[1]), k0 * 24);
    svg.transition().duration(DUR).call(zoom.transform, d3.zoomIdentity.translate(w / 2 - k * (b[0] + b[2]) / 2, h / 2 - k * (b[1] + b[3]) / 2).scale(k));
  }
  function draw(animate = true) {
    const { w, h } = place();
    svg.attr('width', w).attr('height', h);
    if (fitted !== w + 'x' + h) { fitted = w + 'x' + h; svg.call(zoom.transform, fit()); zoom.scaleExtent([k0 * 0.8, k0 * 24]); }
    lay = ctx.circles();
    if (!lay) { foot.textContent = 'Loading the circles…'; return; }
    const S = inSel(), list = Object.keys(lay.p).filter((f) => ctx.size(f) > 0);
    cur = new Map(list.map((f) => [f, { x: lay.p[f][0], y: lay.p[f][1], r: Math.sqrt(lay.r * ctx.size(f)) }]));
    const k = (d3.zoomTransform(svg.node()).k || k0) / k0;
    const c = gC.selectAll('circle').data(list, (f) => f);
    (animate && DUR ? c.exit().transition().duration(DUR).attr('r', 0).remove() : c.exit().remove());
    const ce = c.enter().append('circle').attr('cx', (f) => cur.get(f).x).attr('cy', (f) => cur.get(f).y).attr('r', 0)
      .attr('fill', (f) => ctx.fill(f)).style('pointer-events', 'none');
    const all = ce.merge(c).attr('stroke', 'rgba(35,48,107,.45)').attr('stroke-width', 0.35 / k)
      .attr('opacity', (f) => (S && !S.has(f) ? DIM : 1));
    (animate && DUR ? all.transition().duration(DUR) : all).attr('cx', (f) => cur.get(f).x).attr('cy', (f) => cur.get(f).y).attr('r', (f) => cur.get(f).r).attr('fill', (f) => ctx.fill(f));
    // Small circles on top, so a big county never hides its neighbours.
    all.sort((a, b) => cur.get(b).r - cur.get(a).r);
    // Reference circle, at the map's current scale.
    const unit = ctx.sizeUnit(), ref = unit.ref, rr = Math.sqrt(lay.r * ref) * (d3.zoomTransform(svg.node()).k || k0);
    head.querySelector('.v2d-ref').innerHTML = `<svg width="${Math.ceil(rr * 2 + 4)}" height="${Math.ceil(rr * 2 + 4)}" style="vertical-align:middle"><circle cx="${rr + 2}" cy="${rr + 2}" r="${rr}" fill="none" stroke="${INK}" stroke-width="1.2"/></svg> ${unit.label}`;
    foot.textContent = '';
  }
  return { build, draw, reset, zoomTo };
}
