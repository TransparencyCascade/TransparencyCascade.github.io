/* People (any county election, flat): one dot per N votes (state.pn: 500, 1,000 or 5,000), coloured by party, placed inside each county where people live
   (people.json and people.bin, built from the 2020 census tracts by tools/vote-terrain/build_people.mjs; the arithmetic is in ../people.js). The dots show how
   many votes each county holds and where in the county people live; they do not say where each party's voters live, so a county's dots take its party shares
   at random. Drawn on canvas: the county and state outlines on one layer, the dots (pixels written straight into an image, in a shuffled order so no party
   hides another where they overlap) on the next, and the county under the pointer or selected outlined on the top one. Hover shows the county tooltip, a click
   selects the county (shift adds); a selection fades the dots of other counties. The table is the county table with each county's dots added. */
import { INK, GRAPHITE, RULE } from './style.js';
import { SAPPHIRE, GARNET, PAGE, rgb } from '../colour.js';
import { PER, dotCounts } from '../people.js';

const GREY = [140, 146, 150], SIZE = { 500: 1.5, 1000: 2, 5000: 3.6 };   // dot width in CSS pixels at each N
const COLS = { D: rgb(SAPPHIRE), R: rgb(GARNET), O: GREY };
const dim = (c) => c.map((x, i) => Math.round(x + (PAGE[i] - x) * 0.65));
const pack = (c) => ((255 << 24) | (c[2] << 16) | (c[1] << 8) | c[0]) >>> 0;
const PACK = { D: pack(COLS.D), R: pack(COLS.R), O: pack(COLS.O) }, PACKDIM = { D: pack(dim(COLS.D)), R: pack(dim(COLS.R)), O: pack(dim(COLS.O)) };
const rng = (seed) => { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };

export function peopleView({ ctx, head, body, foot, place, inSel, shiftOf, longPress, countyPath, bboxOf, statePath, W0 }) {
  const { fmt } = ctx;
  let wrap, cBase, cDots, cTop, note, paths = {}, tf = null, drawn = null;
  const exporting = document.body.classList.contains('export');
  const path = (f) => (paths[f] ||= new Path2D(countyPath[f]));
  function build() {
    head.innerHTML = (exporting ? '' : '<span class="v2d-label">One dot per</span><div class="seg v2d-seg" role="group" aria-label="Votes per dot">' +
      PER.map((n) => `<button data-pn="${n}">${fmt(n)}</button>`).join('') + '</div><span class="v2d-label">votes</span>') + '<span class="v2d-ref pp-note"></span>';
    head.querySelectorAll('[data-pn]').forEach((b) => b.addEventListener('click', () => ctx.setPeople({ pn: b.dataset.pn })));
    note = head.querySelector('.pp-note');
    body.innerHTML = '<div class="pp-wrap"><canvas class="pp-base"></canvas><canvas class="pp-dots"></canvas><canvas class="pp-top"></canvas><div class="pp-msg" hidden></div></div>';
    wrap = body.querySelector('.pp-wrap'); [cBase, cDots, cTop] = wrap.querySelectorAll('canvas');
    paths = {};
    const at = (ev) => countyAt(ev.clientX, ev.clientY);
    wrap.addEventListener('mousemove', (ev) => { const f = at(ev); top(f); if (f) ctx.hover(f, ev.clientX, ev.clientY); else ctx.hover(null); });
    wrap.addEventListener('mouseleave', () => { top(null); ctx.hover(null); });
    wrap.addEventListener('click', (ev) => { const f = at(ev); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: shiftOf(ev) }); });
    longPress(wrap, (ev) => { const t = ev.touches && ev.touches[0], f = t && countyAt(t.clientX, t.clientY); if (f) ctx.select({ kind: 'counties', counties: [f] }, { add: true }); });
  }
  // The county under a client point: bounding boxes first, then the outline on the base layer's own transform.
  function countyAt(cx, cy) {
    if (!tf) return null;
    const b = cBase.getBoundingClientRect(), px = cx - b.left, py = cy - b.top, mx = (px - tf.ox) / tf.s, my = (py - tf.oy) / tf.s, c = cBase.getContext('2d');
    c.setTransform(tf.dpr * tf.s, 0, 0, tf.dpr * tf.s, tf.dpr * tf.ox, tf.dpr * tf.oy);
    for (const f in bboxOf) { const bb = bboxOf[f]; if (mx >= bb[0] && mx <= bb[2] && my >= bb[1] && my <= bb[3] && c.isPointInPath(path(f), px * tf.dpr, py * tf.dpr)) return f; }
    return null;
  }
  function top(hoverF) {
    if (!tf) return;
    const c = cTop.getContext('2d'), S = inSel();
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, cTop.width, cTop.height);
    c.setTransform(tf.dpr * tf.s, 0, 0, tf.dpr * tf.s, tf.dpr * tf.ox, tf.dpr * tf.oy);
    c.lineJoin = 'round';
    if (S) { c.strokeStyle = INK; c.lineWidth = 1.1 / tf.s; for (const f of S) if (countyPath[f]) c.stroke(path(f)); }
    if (hoverF) { c.strokeStyle = INK; c.lineWidth = 1.8 / tf.s; c.stroke(path(hoverF)); }
  }
  function draw() {
    const P = ctx.people(), N = +ctx.peopleN(), msg = wrap.querySelector('.pp-msg');
    head.querySelectorAll('[data-pn]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pn === String(N)));
    const E = ctx.electionMeta();
    msg.hidden = !!P; if (!P) { msg.textContent = 'Loading where people live…'; note.textContent = ''; foot.textContent = ''; return; }
    const { w, h } = place(), dpr = Math.min(2, window.devicePixelRatio || 1), pad = 8;
    const [x0, y0, x1, y1] = W0, s = Math.min((w - 2 * pad) / (x1 - x0), (h - 2 * pad) / (y1 - y0)), ox = (w - s * (x1 - x0)) / 2 - s * x0, oy = (h - s * (y1 - y0)) / 2 - s * y0;
    tf = { s, ox, oy, dpr };
    for (const c of [cBase, cDots, cTop]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); c.style.width = w + 'px'; c.style.height = h + 'px'; }
    // Outlines: counties faint, states firmer.
    const bc = cBase.getContext('2d');
    bc.setTransform(dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy);
    bc.fillStyle = 'rgba(255,255,255,.35)'; bc.strokeStyle = 'rgba(35,48,107,.10)'; bc.lineWidth = 0.4 / s; bc.lineJoin = 'round';
    const all = new Path2D(); for (const f in countyPath) all.addPath(path(f));
    bc.fill(all); bc.stroke(all);
    bc.strokeStyle = RULE; bc.lineWidth = 0.9 / s; bc.stroke(new Path2D(statePath));
    // Dots: every county's counts by party, in the slots the build placed, in a shuffled order.
    const data = E.data, S = inSel(), key = `${ctx.election()}|${N}`, list = [];
    const xs = [], ys = [], ps = [], cs = [];
    let nD = 0, nR = 0, nO = 0, votes = 0;
    for (const f in data) {
      const slot = P.at[f]; if (!slot) continue;
      const v = data[f], c = dotCounts(f, v, N, slot.n); votes += v[0];
      let k = slot.first;
      for (const party of ['D', 'R', 'O']) for (let i = 0; i < c[party]; i++, k++) {
        xs.push(P.x(P.xy[2 * k])); ys.push(P.y(P.xy[2 * k + 1])); ps.push(party); cs.push(f);
      }
      nD += c.D; nR += c.R; nO += c.O;
    }
    const n = xs.length, order = new Uint32Array(n); for (let i = 0; i < n; i++) order[i] = i;
    const r = rng(20201001 + N); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = order[i]; order[i] = order[j]; order[j] = t; }
    const W = cDots.width, H = cDots.height, img = new ImageData(W, H), buf = new Uint32Array(img.data.buffer), sz = Math.max(1, Math.round(SIZE[N] * Math.min(1, s / 1.15) * dpr));   // dots shrink with the map on a card
    const paint = (i, colour) => {
      const px = Math.round((xs[i] * s + ox) * dpr - sz / 2), py = Math.round((ys[i] * s + oy) * dpr - sz / 2);
      for (let yy = Math.max(0, py); yy < Math.min(H, py + sz); yy++) for (let xx = Math.max(0, px); xx < Math.min(W, px + sz); xx++) buf[yy * W + xx] = colour;
    };
    if (S) { for (const i of order) if (!S.has(cs[i])) paint(i, PACKDIM[ps[i]]); for (const i of order) if (S.has(cs[i])) paint(i, PACK[ps[i]]); }
    else for (const i of order) paint(i, PACK[ps[i]]);
    cDots.getContext('2d').putImageData(img, 0, 0);
    top(null);
    drawn = { key, n, nD, nR, nO, votes, N };
    note.textContent = `${exporting ? '' : '· '}${fmt(n)} dots: ${fmt(nD)} Democratic, ${fmt(nR)} Republican${nO ? `, ${fmt(nO)} other` : ''}${E.unofficial ? ' (unofficial)' : ''}.`;
    foot.textContent = `${E.label}${E.unofficial ? ', unofficial' : ''}: one dot per ${fmt(N)} votes, the county's votes over ${fmt(N)} rounded at random, so the dots stand for ${fmt(votes)} votes. ${P.head.method} Counties without a result are blank.`;
  }
  return { build, draw, drawn: () => drawn };
}
