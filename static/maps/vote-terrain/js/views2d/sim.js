/* Simulator (any track, flat): one swing for every place on the election day in view, from simulator.json
   (president by state, the Senate's races and seats not up) and house.json (the House by district, 2022 on).
   A slider from 10 points toward Republicans to 10 toward Democrats, centred on the actual result; the balance
   of the Electoral College, the Senate and the House at that swing; tick marks where control of a body changes;
   a state tile map coloured by the margin after the swing (flipped tiles outlined); and the list of what flipped,
   earliest first. The House list shows only contestable and at-risk seats at the plausible swing in force;
   captured seats are counted apart. State: sw (swing), swr (u uniform, p proportional), lock (states held at
   their actual result), sm (which body the map shows). Arithmetic in ../sim.js. */
import { INK, GRAPHITE, RULE, DIM, TILES } from './style.js';
import { RANGE } from '../sim.js';

const BODY = { pres: 'Electoral College', sen: 'Senate', house: 'House' };
const PARTY = { D: 'Democrats', R: 'Republicans' };
const pts = (x) => Math.abs(x).toFixed(1);
const toward = (x) => (x > 0 ? 'toward Democrats' : 'toward Republicans');

export function simView({ ctx, head, body, foot, place, shiftOf }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let top, range, readout, tickSvg, barsSvg, tilesSvg, listBox;
  function build() {
    head.innerHTML = (exporting ? '' : '<div class="seg v2d-seg sim-rule" role="group" aria-label="Swing rule"><button data-swr="u">Uniform</button><button data-swr="p">Proportional</button></div>' +
      '<div class="seg v2d-seg sim-map" role="group" aria-label="Map shows"></div>' +
      '<button class="v2d-showall sim-reset">Reset to actual</button><button class="v2d-showall sim-lock-sel" hidden>Lock selected</button>') +
      '<span class="v2d-ref sim-note"></span>' + (exporting ? '' : '<button class="lens-i" aria-label="About the simulator">i</button>');
    head.querySelectorAll('[data-swr]').forEach((b) => b.addEventListener('click', () => ctx.setSim({ swr: b.dataset.swr })));
    head.querySelector('.sim-map') && head.querySelector('.sim-map').addEventListener('click', (ev) => { const b = ev.target.closest('[data-sm]'); if (b) ctx.setSim({ sm: b.dataset.sm }); });
    const reset = head.querySelector('.sim-reset'); if (reset) reset.addEventListener('click', () => ctx.setSim({ sw: '', lock: '' }));
    const lockSel = head.querySelector('.sim-lock-sel');
    if (lockSel) lockSel.addEventListener('click', () => { const S = ctx.selectedStates(); if (S) ctx.toggleLock([...S], true); });
    const i = head.querySelector('.lens-i');
    if (i) ctx.infoButton(i, () => { const R = ctx.simRules(); return `${R.swing} ${R.uniform} ${R.proportional} Every place takes the same swing; real elections do not, and this is not a forecast. ` +
      'Held at the actual result: races whose top two were not a Democrat against a Republican, races decided another way (ranked choice), and states you lock. ' +
      'Maine\'s and Nebraska\'s district electors stay as they were. The House list shows only contestable and at-risk seats at the plausible swing in force (Adjust, on the House track); captured seats are counted apart. ' +
      'Click a tile or a row to select the state; Lock holds a state at its actual result.'; });
    body.innerHTML = '';
    top = d3.select(body).append('div').attr('class', 'sim-top');
    const row = top.append('div').attr('class', 'sim-readout-row');
    readout = row.append('span').attr('class', 'sim-readout');
    row.append('span').attr('class', 'sim-label').text('Uniform swing, a simplification; not a forecast');
    range = top.append('input').attr('type', 'range').attr('class', 'sim-range').attr('min', -RANGE).attr('max', RANGE).attr('step', 0.1)
      .attr('aria-label', 'Swing in points of margin: left toward Republicans, right toward Democrats');
    range.on('input', (ev) => ctx.setSim({ sw: +ev.target.value === 0 ? '' : String(+(+ev.target.value).toFixed(1)) }, { quick: true }));
    tickSvg = top.append('svg').attr('class', 'sim-ticks');
    barsSvg = d3.select(body).append('svg').attr('class', 'sim-bars');
    const main = d3.select(body).append('div').attr('class', 'sim-main');
    tilesSvg = main.append('svg').attr('class', 'sim-tiles');
    listBox = main.append('div').attr('class', 'sim-list v2d-rows');
    listBox.on('click', (ev) => {
      const lk = ev.target.closest('[data-lock]'); if (lk) { ev.stopPropagation(); ctx.toggleLock([lk.dataset.lock]); return; }
      const r = ev.target.closest('[data-st]'); if (r) ctx.select({ kind: 'states', states: [r.dataset.st] }, { add: shiftOf(ev) });
    });
  }

  function draw() {
    const S = ctx.sim();
    if (!S) { head.querySelector('.sim-note').textContent = 'Loading the simulator…'; return; }
    const { sim, P, s, rule, locked, sm, bodies, held, plausible } = S;
    const t = sim.tally(P, s, rule, locked), th = sim.thresholds(P, rule, locked), base = sim.tally(P, 0, rule, new Set());
    head.querySelectorAll('[data-swr]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.swr === rule));
    const mapSeg = head.querySelector('.sim-map');
    if (mapSeg) { mapSeg.innerHTML = bodies.map((b) => `<button data-sm="${b}"${b === sm ? ' aria-pressed="true"' : ''}>${b === 'pres' ? 'President' : BODY[b]}</button>`).join(''); mapSeg.hidden = bodies.length < 2; }
    const lockSel = head.querySelector('.sim-lock-sel'); if (lockSel) lockSel.hidden = !ctx.selectedStates();
    head.querySelector('.sim-note').textContent = `${S.label}: ${rule === 'p' ? 'proportional' : 'uniform'} swing.` +
      (locked.size ? ` Locked at the actual result: ${[...locked].sort().join(', ')}.` : '') + (S.unofficial ? ` ${S.unofficial}` : '');
    foot.textContent = S.sources;
    range.property('value', s);
    readout.text(s === 0 ? 'The actual result' : `${pts(s)} points of margin ${toward(s)}`);

    const { w: W, h } = place(), narrow = W < 760;
    // A wide, short space (a card) puts the tile map to the right of everything else, at full height.
    const wide = !narrow && W / h > 2, tilesW = wide ? Math.min(h * 1.5, W * (exporting ? 0.44 : 0.36)) : 0, w = W - (wide ? tilesW + 16 : 0);
    top.style('width', wide ? w + 'px' : null);
    // Ticks under the slider: where control of a body changes, staggered so labels do not collide.
    const pad = 9, x = d3.scaleLinear().domain([-RANGE, RANGE]).range([pad, w - pad]);
    const placed = [], ticks = th.map((k) => {
      const lab = `${BODY[k.body]}: ${k.control === 'tie' ? 'tie' : k.control === 'none' ? 'no majority' : PARTY[k.control]} at ${pts(k.at)}`;
      // Centred on its tick; at either end of the axis the label sits beside its tick instead of over it.
      const wid = lab.length * 6.6 + 8, xc = x(k.at), x0 = xc - wid / 2 < 0 ? xc + 4 : xc + wid / 2 > w ? xc - wid - 4 : xc - wid / 2;
      let rowN = 0; while (placed.some((p) => p.row === rowN && x0 < p.x1 && x0 + wid > p.x0)) rowN++;
      placed.push({ row: rowN, x0, x1: x0 + wid }); return { ...k, lab, x0, rowN };
    });
    const rows = Math.max(1, d3.max(ticks, (k) => k.rowN + 1) || 1);
    tickSvg.attr('width', w).attr('height', 14 + rows * 15).selectAll('*').remove();
    for (const v of [-10, -5, 0, 5, 10]) tickSvg.append('text').attr('x', x(v)).attr('y', 10).attr('text-anchor', v === -10 ? 'start' : v === 10 ? 'end' : 'middle').attr('class', 'sim-axis')
      .text(v === 0 ? 'actual' : `${Math.abs(v)} ${v < 0 ? 'R' : 'D'}`);
    for (const k of ticks) {
      tickSvg.append('line').attr('x1', x(k.at)).attr('x2', x(k.at)).attr('y1', 0).attr('y2', 16 + k.rowN * 15).attr('stroke', INK).attr('stroke-width', 1.5);
      tickSvg.append('text').attr('x', k.x0 + 4).attr('y', 25 + k.rowN * 15).attr('class', 'sim-tick').text(k.lab)
        .style('cursor', exporting ? null : 'pointer').on('click', () => ctx.setSim({ sw: String(k.at) }));
    }

    // Balance bars.
    const lines = [];
    if (t.pres) lines.push({ b: 'pres', D: t.pres.D, R: t.pres.R, total: 538, need: 270, control: t.pres.control });
    lines.push({ b: 'sen', D: t.sen.D, R: t.sen.R, other: t.sen.other, total: 100, need: 51, control: t.sen.control, vp: t.sen.vp });
    if (t.house) lines.push({ b: 'house', D: t.house.D, R: t.house.R, other: t.house.undecided, total: 435, need: 218, control: t.house.control });
    else if (held.house) lines.push({ b: 'house', D: held.house.D, R: held.house.R, total: 435, need: 218, control: held.house.D >= 218 ? 'D' : 'R', held: held.house.why });
    const short = narrow || (exporting && w < 560), BH = 30, labW = narrow ? 0 : 200, bx = d3.scaleLinear().domain([0, 1]).range([labW, w - 4]);
    barsSvg.attr('width', w).attr('height', lines.length * (narrow ? BH + 14 : BH) + 4).selectAll('*').remove();
    lines.forEach((L, i) => {
      const g = barsSvg.append('g').attr('transform', `translate(0,${i * (narrow ? BH + 14 : BH) + (narrow ? 12 : 0)})`).attr('opacity', L.held ? 0.55 : 1);
      g.append('text').attr('class', 'st').attr('x', 0).attr('y', narrow ? -2 : 13).text(BODY[L.b]);
      if (!narrow) g.append('text').attr('class', 'sim-bar-lab').attr('x', 0).attr('y', 26).text(L.b === 'sen' ? (L.vp ? `${L.need}, or 50 and the VP (${L.vp})` : `${L.need}; no VP decided`) : `${L.need} to control`);
      const wD = L.D / L.total, wR = L.R / L.total;
      g.append('rect').attr('x', bx(0)).attr('y', 4).attr('width', bx(wD) - bx(0)).attr('height', 14).attr('fill', ctx.colour(60, true));
      g.append('rect').attr('x', bx(1 - wR)).attr('y', 4).attr('width', bx(1) - bx(1 - wR)).attr('height', 14).attr('fill', ctx.colour(-60, true));
      g.append('line').attr('x1', bx(L.need / L.total)).attr('x2', bx(L.need / L.total)).attr('y1', 1).attr('y2', 21).attr('stroke', INK).attr('stroke-width', 1.5);
      const changed = !L.held && base[L.b] && L.control !== base[L.b].control;
      const ctl = L.held ? `held at the actual result: ${L.held}` : L.control === 'tie' ? 'a 269-269 tie' : L.control === 'none' ? 'no majority' : `${narrow ? L.control : PARTY[L.control]} control${changed ? ', changed' : ''}`;
      g.append('text').attr('x', bx(0) + 4).attr('y', 30).attr('class', 'sim-bar-lab')
        .text(`${short ? 'D' : PARTY.D} ${L.D}, ${short ? 'R' : PARTY.R} ${L.R}${L.other ? `, ${L.other} ${L.b === 'house' ? 'undecided' : 'other'}` : ''}: ${ctl}${narrow ? ` (${L.need} to control)` : ''}`);
    });
    barsSvg.attr('height', lines.length * (narrow ? BH + 14 : BH) + 18);

    // Tiles and the flip list share what remains.
    // On a phone the view scrolls: the tiles at the full width, the list below them.
    const used = top.node().offsetHeight + barsSvg.node().getBoundingClientRect().height + 16, rest = narrow ? w / 1.5 + 240 : Math.max(exporting ? 60 : 160, h - used);
    d3.select(body).select('.sim-main').style('flex-direction', narrow ? 'column' : 'row').style('height', rest + 'px').style('width', wide ? w + 'px' : null);
    tilesSvg.style('position', wide ? 'absolute' : null).style('right', wide ? '0' : null).style('top', wide ? '0' : null);
    const tw = wide ? tilesW : narrow ? w : Math.min(w * 0.56, rest * 1.6), th2 = wide ? h : narrow ? w / 1.5 : rest;
    drawTiles(S, t, tw, th2);
    listBox.style('height', narrow ? (rest - th2 - 10) + 'px' : rest + 'px').style('flex', '1');
    drawList(S, t, plausible);
  }

  function drawTiles(S, t, w, h) {
    const { sim, P, s, rule, locked, sm } = S, sel = ctx.selectedStates();
    const cs = Math.max(8, Math.min((w - 4) / 12, (h - 4) / 8)), gx = (w - cs * 12) / 2;
    tilesSvg.attr('width', w).attr('height', cs * 8 + 4).selectAll('*').remove();
    const byState = {};
    for (const p of P[sm] || []) (byState[p.st] ||= []).push(p);
    const flippedSet = new Set(((t[sm] || {}).flips || []).map((p) => p.st));
    for (const [st, [c, r]] of Object.entries(TILES)) {
      const list = byState[st] || [];
      let fill, label = '';
      if (sm === 'house') {
        const ch = list.reduce((a, p) => { const w2 = sim.winnerAt(p, s, rule, locked); return a + (w2 === p.actual ? 0 : w2 === 'D' ? 1 : -1); }, 0);
        fill = list.length ? ctx.colour(Math.max(-60, Math.min(60, ch * 20)), true) : ctx.colour(null);
        label = ch ? (ch > 0 ? `+${ch} D` : `+${-ch} R`) : '';
      } else if (list.length) {
        const m = sim.marginAt(list[0], s, rule);
        fill = list[0].fixed ? ctx.colour(null) : ctx.colour(m, true);
        label = sm === 'pres' ? String(list[0].ev) : list.length > 1 ? '2 races' : '';
      } else fill = ctx.colour(null);
      const g = tilesSvg.append('g').attr('transform', `translate(${gx + c * cs + 1},${r * cs + 2})`).attr('opacity', sel && !sel.has(st) ? DIM : 1)
        .style('cursor', exporting ? null : 'pointer').attr('class', 'sim-tile').attr('data-st', st);
      const flipped = flippedSet.has(st);
      g.append('rect').attr('width', cs - 2).attr('height', cs - 2).attr('fill', fill)
        .attr('stroke', flipped ? INK : locked.has(st) ? GRAPHITE : 'none').attr('stroke-width', flipped ? 3 : 1.5).attr('stroke-dasharray', locked.has(st) && !flipped ? '3 2' : null);
      const fs = Math.max(7, Math.min(12, cs * 0.3));
      g.append('text').attr('x', (cs - 2) / 2).attr('y', (cs - 2) / 2 + (label && cs > 30 ? -1 : fs / 3)).attr('text-anchor', 'middle').attr('class', 'sim-tile-st').style('font-size', fs + 'px').text(st);
      if (label && cs > 30) g.append('text').attr('x', (cs - 2) / 2).attr('y', (cs - 2) / 2 + fs + 1).attr('text-anchor', 'middle').attr('class', 'sim-tile-n').style('font-size', fs * 0.8 + 'px').text(label);
      if (!exporting) g.on('click', (ev) => ctx.select({ kind: 'states', states: [st] }, { add: shiftOf(ev) }))
        .on('mousemove', (ev) => ctx.hoverHtml(tileHtml(S, st, list), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    }
  }
  const tileHtml = (S, st, list) => {
    const { sim, s, rule, locked, sm } = S;
    const lines = list.slice(0, sm === 'house' ? 0 : 2).map((p) => {
      const f = sim.flipAt(p, rule), now = sim.winnerAt(p, s, rule, locked);
      const name = p.body === 'sen' ? `Senate${p.race.endsWith('special') ? ' (special)' : ''}: ${p.dName || '–'} (D) against ${p.rName || '–'} (R)` : `President: ${fmt(p.D)} D, ${fmt(p.R)} R; ${p.ev} electoral votes`;
      const m = sim.marginOf(p);
      return `${name}<br>Actual margin ${m >= 0 ? 'D' : 'R'}+${pts(m)}; ${p.fixed ? `held (${p.fixed})` : locked.has(st) ? 'locked at the actual result' : `flips at ${pts(f)} ${toward(f)}`}; at this swing: ${PARTY[now] || now}`;
    });
    if (sm === 'house') {
      const flips = list.filter((p) => sim.winnerAt(p, s, rule, locked) !== p.actual);
      lines.push(`${list.length} district${list.length === 1 ? '' : 's'}; ${flips.length ? `flipped at this swing: ${flips.map((p) => `${p.st}-${p.n}`).join(', ')}` : 'none flipped at this swing'}`);
    }
    return `<b>${ctx.stateName(st)}</b><br>${lines.join('<br>') || 'No race on this map'}<br><span style="color:${GRAPHITE}">Click to select the state</span>`;
  };

  function drawList(S, t, plausible) {
    const { sim, P, s, rule, locked, bodies } = S;
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const name = (p) => (p.body === 'pres' ? `${ctx.stateName(p.st)} (${p.ev} electoral vote${p.ev === 1 ? '' : 's'})` : p.body === 'sen' ? `${ctx.stateName(p.st)} Senate${p.race.endsWith('special') ? ' (special)' : ''}` : `${p.st}-${p.n}`);
    const row = (x, faint) => `<div class="sim-row${faint && s !== 0 ? ' faint' : ''}" data-st="${x.p.st}"><span>${esc(name(x.p))}</span><span>${faint && s !== 0 ? 'next: ' : ''}to ${x.p.actual === 'R' ? 'D' : 'R'} at ${pts(x.at)}${x.p.body === 'house' ? `, ${x.p.band}` : ''}</span>` +
      (exporting ? '' : `<button class="sim-lock" data-lock="${x.p.st}" aria-pressed="${locked.has(x.p.st)}">${locked.has(x.p.st) ? 'Locked' : 'Lock'}</button>`) + '</div>';
    let html = '';
    // The body on the map first.
    for (const b of [S.sm, ...bodies.filter((x) => x !== S.sm)]) {
      if (!t[b]) continue;
      // At the actual result nothing has flipped: show the closest races either way instead.
      let flips = sim.flipped(P, s, rule, locked, b), nx = s === 0 ? [...sim.next(P, 1e-9, rule, locked, b, 2), ...sim.next(P, -1e-9, rule, locked, b, 2)].sort((a, c) => Math.abs(a.at) - Math.abs(c.at)) : sim.next(P, s, rule, locked, b);
      let extra = '';
      if (b === 'house') {
        const capFlips = flips.filter((x) => x.p.band === 'captured').length, cap = P.house.filter((p) => p.band === 'captured').length;
        flips = flips.filter((x) => x.p.band !== 'captured'); nx = nx.filter((x) => x.p.band !== 'captured');
        extra = `<p class="sim-cap">${fmt(cap)} captured seats (plausible swing ${plausible}); ${capFlips ? `${capFlips} of them flip at this swing` : 'none of them flip at this swing'}.</p>`;
      }
      html += `<h4>${BODY[b]}: ${s === 0 ? 'the actual result; closest to flipping' : `${flips.length} flipped`}</h4>${extra}` + flips.map((x) => row(x, false)).join('') + nx.map((x) => row(x, true)).join('');
    }
    listBox.html(html);
  }
  return { build, draw };
}
