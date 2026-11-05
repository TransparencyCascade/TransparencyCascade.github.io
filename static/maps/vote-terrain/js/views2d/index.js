/* Flat companion views for the vote terrain: Circles, Arrows, Dots and Scatter (d3 + SVG), and for the
   House track, District strips and Seats against votes; History (any office) draws the long view; Simulator (any
   office) moves every place on the election day by one swing; Power (county tracks) ranks the weight of a vote,
   sizes states by votes, electoral votes and Senate seats, and draws each party's concentration; Road to 270 (and 51)
   lines the election day's states or Senate races up by margin; Closest races tables every race on it. main.js owns
   the data, the state and the selection; each view only draws what it is given and reports the reader's
   gestures back through ctx.select(). This module holds what the views share: the county outlines and
   centroids, state borders, the frame each view draws in, and the gesture helpers. */
import { reduced } from '../util.js';
import { dotsView } from './dots.js';
import { arrowsView } from './arrows.js';
import { scatterView } from './scatter.js';
import { circlesView } from './circles.js';
import { stripsView } from './strips.js';
import { seatsView } from './seats.js';
import { historyView } from './history.js';
import { simView } from './sim.js';
import { powerView } from './power.js';
import { roadView } from './road.js';
import { closestView } from './closest.js';

export function createViews2d(ctx) {
  const { el, geo, meta } = ctx;
  const DUR = reduced ? 0 : 700;

  // ---------- shared geometry: county outlines, centroids, state borders (screen y = -projected y) ----------
  const shoelace = (r) => { let a = 0; for (let i = 0, n = r.length; i < n; i++) { const p = r[i], q = r[(i + 1) % n]; a += p[0] * q[1] - q[0] * p[1]; } return a / 2; };
  const countyPath = {}, centroid = {}, bboxOf = {}, bestArea = {};
  for (const pc of geo.pieces) {
    let d = countyPath[pc.f] || '';
    for (const r of pc.p) d += 'M' + r.map((q) => `${q[0].toFixed(1)},${(-q[1]).toFixed(1)}`).join('L') + 'Z';
    countyPath[pc.f] = d;
    const outer = pc.p[0], a = Math.abs(shoelace(outer));
    if (!(bestArea[pc.f] > a)) { bestArea[pc.f] = a; centroid[pc.f] = d3.polygonCentroid(outer.map((q) => [q[0], -q[1]])); }
    const bb = bboxOf[pc.f] || [Infinity, Infinity, -Infinity, -Infinity];
    for (const q of outer) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.min(bb[1], -q[1]); bb[2] = Math.max(bb[2], q[0]); bb[3] = Math.max(bb[3], -q[1]); }
    bboxOf[pc.f] = bb;
  }
  // State borders: county edges shared by two counties in different states.
  const statePath = (() => {
    const seen = new Map(); let d = '';
    const key = (q) => q[0].toFixed(2) + ',' + q[1].toFixed(2);
    for (const pc of geo.pieces) {
      const st = meta[pc.f] && meta[pc.f].st;
      for (const r of pc.p) for (let i = 0; i < r.length; i++) {
        const a = r[i], b = r[(i + 1) % r.length], ka = key(a), kb = key(b), k = ka < kb ? ka + '|' + kb : kb + '|' + ka;
        const prev = seen.get(k);
        if (prev === undefined) seen.set(k, st);
        else if (prev !== st && prev !== null) { d += `M${a[0].toFixed(1)},${(-a[1]).toFixed(1)}L${b[0].toFixed(1)},${(-b[1]).toFixed(1)}`; seen.set(k, null); }
      }
    }
    return d;
  })();
  const W0 = (() => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const f in bboxOf) { const b = bboxOf[f]; x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); } return [x0, y0, x1, y1]; })();
  const statesOf = (() => { const m = {}; for (const f in meta) { const st = meta[f].st; (m[st] ||= []).push(f); } return m; })();

  // ---------- frame: the region left free by the panel, key, balance box and timeline ----------
  const root = document.createElement('div'); root.className = 'v2d-root'; el.appendChild(root);
  const head = document.createElement('div'); head.className = 'v2d-head'; root.appendChild(head);
  const body = document.createElement('div'); body.className = 'v2d-body'; root.appendChild(body);
  const foot = document.createElement('div'); foot.className = 'v2d-foot'; root.appendChild(foot);
  const place = () => {
    const r = ctx.region(); Object.assign(root.style, { left: r.left + 'px', top: r.top + 'px', width: (r.right - r.left) + 'px', height: (r.bottom - r.top) + 'px' });
    // The drawing gets what the head and foot leave of the region.
    return { w: body.clientWidth || r.right - r.left, h: body.clientHeight || r.bottom - r.top - 60 };
  };
  const inSel = () => { const s = ctx.selection(); return s ? s.counties : null; };
  const shiftOf = (ev) => !!(ev && (ev.shiftKey || ev.metaKey || ev.ctrlKey));
  // Long press on touch adds to the selection, like shift-click.
  const longPress = (node, onLong) => {
    let t = null;
    node.addEventListener('touchstart', (ev) => { t = setTimeout(() => { t = null; onLong(ev); }, 550); }, { passive: true });
    for (const e of ['touchend', 'touchmove', 'touchcancel']) node.addEventListener(e, () => { clearTimeout(t); t = null; }, { passive: true });
  };
  // A redraw in the middle of a drag (a resize, the play timer) would swap the brush out from under the pointer: hold it until the drag ends.
  const dragGuard = () => { const g = { on: false, held: null }; g.start = (ev) => { if (ev.sourceEvent) g.on = true; };
    g.end = (redraw) => { g.on = false; if (g.held !== null) setTimeout(() => { const a = g.held; g.held = null; if (a !== null) redraw(a); }); }; return g; };
  // The brush lies over the points so a drag can start anywhere; hover and click find the nearest point instead.
  const nearest = (svgNode, list, at, radius) => {
    const del = d3.Delaunay.from(list, (d) => at(d)[0], (d) => at(d)[1]);
    return (clientX, clientY) => {
      if (!list.length) return null;
      const b = svgNode.getBoundingClientRect(), x = clientX - b.left, y = clientY - b.top, i = del.find(x, y), d = list[i], p = at(d);
      return Math.hypot(p[0] - x, p[1] - y) <= radius(d) + 3 ? d : null;
    };
  };
  const hitLayer = (svg, near, onHit, hoverHtml) => {
    svg.on('mousemove.hit', (ev) => { const d = near()(ev.clientX, ev.clientY); if (!d) return ctx.hover(null); hoverHtml ? ctx.hoverHtml(hoverHtml(d), ev.clientX, ev.clientY) : ctx.hover(d.f, ev.clientX, ev.clientY); })
      .on('mouseleave.hit', () => ctx.hover(null));
    longPress(svg.node(), (ev) => { const t = ev.touches && ev.touches[0]; const d = t && near()(t.clientX, t.clientY); if (d) onHit(d, true); });
  };

  const env = { ctx, meta, DUR, head, body, foot, place, inSel, shiftOf, longPress, dragGuard, nearest, hitLayer,
    countyPath, centroid, bboxOf, statePath, W0, statesOf, rows: () => ctx.rows() };
  const views = { dots: dotsView(env), arrows: arrowsView(env), scatter: scatterView(env), circles: circlesView(env), strips: stripsView(env), seats: seatsView(env), history: historyView(env), sim: simView(env), power: powerView(env), road: roadView(env), closest: closestView(env) };
  let current = null;
  return {
    show(name) {
      root.hidden = !name;
      if (!name) { current = null; ctx.viewNote(''); return; }
      if (current !== name) { current = name; root.dataset.view = name; foot.textContent = ''; ctx.viewNote(''); views[name].build(); views[name].draw(false); }
    },
    redraw(animate = true) { if (current) views[current].draw(animate); },
    // The bottom of what the view drew, in page pixels (export.mjs crops a card's image to it).
    contentBottom() {
      let b = 0;
      for (const n of root.querySelectorAll('.v2d-head, .v2d-body > *, .v2d-foot')) {
        if (n.hidden || !n.getClientRects().length || getComputedStyle(n).display === 'none') continue;
        b = Math.max(b, n.getBoundingClientRect().bottom);
      }
      return Math.ceil(b);
    },
    frame(counties) {                          // zoom the arrows or circles to a set of counties (others: no camera)
      if (current === 'circles') { if (counties && counties.length) views.circles.zoomTo(counties); else views.circles.reset(); return; }
      if (current !== 'arrows') return;
      if (!counties || !counties.length) { views.arrows.reset(); return; }
      const sts = [...new Set(counties.map((f) => meta[f] && meta[f].st))];
      if (sts.length === 1) views.arrows.zoomTo(sts[0]); else views.arrows.reset();
    },
  };
}
