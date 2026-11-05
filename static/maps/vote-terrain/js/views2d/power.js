/* Power (county tracks, flat): how the system turns votes into power, in three charts chosen by the switch in the
   head (state.pc), so a saved view or card shows only its own chart. Arithmetic in ../power.js.
   rank: states ranked by the electoral weight of one vote (national average = 1), each bar split into its three
   parts on a doubling scale, so the parts' lengths add up to the state's weight (the black tick).
   tiles: a state tile map whose squares are sized by each state's share of the votes cast, of the electoral votes,
   or of the Senate's seats (state.pm); choosing another plays the morph, and the slider scrubs it.
   conc: each party's counties ordered from most of its votes to fewest, its cumulative share of votes against the
   cumulative share of land (or of counties, state.pa); the marker (state.pq, dragged up and down) reads off how
   many counties hold that share of the chosen party's votes (state.pk) and selects them. */
import { INK, GRAPHITE, RULE, DIM, TILES } from './style.js';
import { PARTIES } from '../power.js';

const CHARTS = [['rank', 'Weight per vote'], ['tiles', 'Cartogram'], ['conc', 'Concentration']];
const STOPS = { votes: 0, ev: 1, sen: 2 }, STOP_NAME = { votes: 'Votes cast', ev: 'Electoral votes', sen: 'Senate seats' };
const PARTS = [['B', 'State electoral votes per resident', '#23306B'], ['N', 'Residents per eligible citizen', '#8890B4'], ['T', 'Eligible citizens per vote cast', '#C3C7CE']];
const pct = (x, d = 1) => (x * 100).toFixed(d) + '%';
const times = (x) => (x >= 10 ? x.toFixed(0) : x.toFixed(2)) + '×';

export function powerView({ ctx, head, body, foot, place, shiftOf, DUR }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let svg, ctl, tNow = null, anim = null, qDrag = null;
  function build() {
    head.innerHTML = (exporting ? '' : '<div class="seg v2d-seg pw-switch" role="group" aria-label="Chart">' +
      CHARTS.map(([k, t]) => `<button data-pc="${k}">${t}</button>`).join('') + '</div><span class="pw-ctl"></span>') +
      '<span class="v2d-ref pw-note"></span>' + (exporting ? '' : '<button class="lens-i" aria-label="About these charts">i</button>');
    head.querySelectorAll('[data-pc]').forEach((b) => b.addEventListener('click', () => ctx.setPower({ pc: b.dataset.pc })));
    ctl = head.querySelector('.pw-ctl');
    const i = head.querySelector('.lens-i');
    if (i) ctx.infoButton(i, () => ({
      rank: 'Weight per vote: each state\'s electoral votes for every vote cast there, against the national average. Its three parts multiply back to it: the state\'s electoral votes per resident (two Senate electors per state, House seats in whole numbers); residents per eligible citizen (children and non-citizens are counted for apportionment but cannot vote); eligible citizens per vote cast (turnout). On the doubling scale a part\'s length is its factor, so the parts add up to the black tick. Click a row to select the state.',
      tiles: 'Each square\'s area is the state\'s share of the votes cast in the election in view, of the electoral votes in force, or of the Senate\'s seats. Choose one to play the change; drag the slider to scrub it. Colour is the state\'s margin. Alaska reports by House district, not by county, so its square uses its certified statewide total. Click a square to select the state.',
      conc: 'Each line orders one party\'s counties from most of its votes to fewest and adds them up: how much of the land (or how many of the counties) holds a given share of that party\'s votes. The diagonal is an even spread. Drag the marker up or down; the counties it reaches for the chosen party become the selection.',
    })[ctx.power().pc]);
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-band pw-chart');
  }

  function draw() {
    const P = ctx.power(), e = ctx.election();
    head.querySelectorAll('[data-pc]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.pc === P.pc));
    if (anim && P.pc !== 'tiles') { anim.stop(); anim = null; }
    // The chart's own controls go in before the drawing is measured: they can add a line to the head.
    if (ctl) ctl.innerHTML = exporting ? '' : ctlHtml(P);
    const note = head.querySelector('.pw-note');
    const { w, h: h0 } = (() => { note.textContent = noteFor(P, e); foot.textContent = footFor(P); return place(); })();
    // A short space (a phone, under the head's controls) scrolls instead of squeezing the chart.
    const h = Math.max(h0, { rank: 300, tiles: Math.min(520, w * 0.72 + 30), conc: Math.min(520, w * 0.8) }[P.pc]);
    svg.attr('width', w).attr('height', h).selectAll('*').remove();
    if (P.pc === 'tiles') drawTilesChart(P, e, w, h);
    else if (P.pc === 'conc') drawConc(P, e, w, h);
    else drawRank(P, e, w, h);
  }
  const ctlHtml = (P) => (P.pc === 'tiles' ? '<span class="seg v2d-seg pw-stops" role="group" aria-label="Size squares by">' +
      Object.keys(STOPS).map((k) => `<button data-pm="${k}" aria-pressed="${k === P.pm}">${STOP_NAME[k]}</button>`).join('') + '</span>' +
      '<input type="range" class="pw-morph" min="0" max="2" step="0.01" aria-label="Scrub between votes cast, electoral votes and Senate seats">'
    : P.pc === 'conc' ? '<span class="seg v2d-seg" role="group" aria-label="Marker follows">' +
      Object.entries(PARTIES).map(([k, x]) => `<button data-pk="${k}" aria-pressed="${k === P.pk}">${x.name}</button>`).join('') + '</span>' +
      '<span class="seg v2d-seg" role="group" aria-label="Across">' + [['land', 'Share of land'], ['counties', 'Share of counties']].map(([k, t]) => `<button data-pa="${k}" aria-pressed="${k === P.pa}">${t}</button>`).join('') + '</span>' : '');
  const noteFor = (P, e) => {
    const L = ctx.label();
    if (P.pc === 'rank') return P.calc.rank(e) ? `Weight of one vote, by state, ${L}: national average = 1.` : `Weight per vote needs census and citizen counts, and ${L} has none in the page.`;
    if (P.pc === 'tiles') { const rows = P.calc.states(e).rows, n = rows.filter((r) => r.st !== 'DC').length, dc = rows.some((r) => r.st === 'DC');
      const ak = rows.some((r) => r.st === 'AK');
      return `Squares sized by each state's share of the ${({ votes: `votes cast in ${L}`, ev: 'electoral votes in force', sen: 'Senate\'s seats' })[P.pm]}, among the ${n} states${dc ? ' and DC' : ''} with results here${n < 50 ? `; states with no race in ${L} are left out` : ''}. ${ak ? 'Alaska, which reports by House district, uses its statewide total.' : 'Alaska is left out: it reports by House district, and the page has no statewide total for this race.'}`; }
    return `Each party's votes, ${L}, counted from its biggest counties down.`;
  };
  const footFor = (P) => ({ rank: ctx.effSource(), tiles: `${ctx.source()} Electoral votes: National Archives, by the apportionment in force.`, conc: `${ctx.source()} Land: Census Bureau county areas.` })[P.pc];

  // ---------- weight per vote, ranked ----------
  function drawRank(P, e, w, hh) {
    const R = P.calc.rank(e); if (!R) return;
    const S = ctx.selectedStates(), narrow = w < 560;
    const pad = { l: narrow ? 96 : 150, r: narrow ? 46 : 64, t: 62, b: 8 };
    // Legend first: it may take two lines, and the rows get what is left.
    // The legend wraps onto a second line when the three do not fit beside each other.
    let lx = pad.l, ly = 4;
    for (const [, name, col] of PARTS) {
      const g = svg.append('g');
      g.append('rect').attr('width', 10).attr('height', 10).attr('fill', col);
      const t = g.append('text').attr('x', 14).attr('y', 9).text(name), iw = 14 + t.node().getComputedTextLength();
      if (lx > pad.l && lx + iw > w) { lx = pad.l; ly += 17; }
      g.attr('transform', `translate(${lx},${ly})`); lx += iw + 12;
    }
    pad.t += ly - 4;
    // Every state when the rows fit; otherwise the top and bottom of the ranking, said in the head.
    const fitN = Math.floor((hh - pad.t - pad.b) / 11);
    let rows = R, gapAt = null;
    if (fitN < R.length) { const k = Math.max(3, Math.floor((fitN - 1) / 2)); rows = [...R.slice(0, k), ...R.slice(-k)]; gapAt = k;
      head.querySelector('.pw-note').textContent += ` The ${k} highest and ${k} lowest of ${R.length} are shown; every state is on the page.`; }
    const n = rows.length + (gapAt ? 1 : 0), rh = Math.min(26, (hh - pad.t - pad.b) / n);
    // Doublings either way, wide enough for the longest stack of parts.
    const lg = (x) => Math.log2(x), ext = Math.max(2, ...R.map((x) => Math.max(...[['B', 'N', 'T'].reduce((a, k) => a + Math.max(0, lg(x[k])), 0), -['B', 'N', 'T'].reduce((a, k) => a + Math.min(0, lg(x[k])), 0)])));
    const D = Math.ceil(ext * 2) / 2, x = d3.scaleLinear().domain([-D, D]).range([pad.l, w - pad.r]);
    for (let d = -Math.floor(D); d <= Math.floor(D); d++) {
      svg.append('line').attr('x1', x(d)).attr('x2', x(d)).attr('y1', pad.t - 8).attr('y2', hh - pad.b).attr('stroke', d === 0 ? INK : RULE).attr('stroke-width', d === 0 ? 1 : 0.5);
      const v = 2 ** d, lab = v >= 1 ? v + '×' : `1/${1 / v}×`;
      svg.append('text').attr('x', x(d)).attr('y', pad.t - 10).attr('text-anchor', 'middle').text(d === 0 ? (narrow ? '1×' : '1× average') : lab);
    }
    const title = svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', ly + 28).text('Doubling scale: each part\'s length is its factor, so the parts add up to the state\'s weight (black tick)');
    if (title.node().getComputedTextLength() > w - pad.l) title.text('Doubling scale: the parts add up to the black tick');
    rows.forEach((d, i) => {
      const y = pad.t + (gapAt != null && i >= gapAt ? i + 1 : i) * rh;
      const on = !S || S.has(d.st);
      const g = svg.append('g').attr('class', 'pw-row').attr('data-st', d.st).attr('transform', `translate(0,${y})`).attr('opacity', on ? 1 : DIM)
        .style('cursor', exporting ? null : 'pointer');
      g.append('rect').attr('x', 0).attr('y', 0).attr('width', w).attr('height', rh).attr('fill', 'transparent');
      g.append('text').attr('x', pad.l - 8).attr('y', rh / 2 + 4).attr('text-anchor', 'end').attr('font-weight', S && S.has(d.st) ? 700 : null).text(narrow ? d.st : ctx.stateName(d.st));
      let pos = 0, neg = 0; const bh = Math.max(4, Math.min(14, rh * 0.62)), by = (rh - bh) / 2;
      for (const [k, , col] of PARTS) {
        const l = lg(d[k]);
        const x0 = l >= 0 ? pos : neg + l; if (l >= 0) pos += l; else neg += l;
        g.append('rect').attr('x', x(x0)).attr('y', by).attr('width', Math.max(0, x(x0 + Math.abs(l)) - x(x0))).attr('height', bh).attr('fill', col);
      }
      g.append('line').attr('x1', x(lg(d.r))).attr('x2', x(lg(d.r))).attr('y1', by - 3).attr('y2', by + bh + 3).attr('stroke', '#000').attr('stroke-width', 2);
      g.append('text').attr('x', w - pad.r + 6).attr('y', rh / 2 + 4).attr('fill', INK).attr('font-weight', 700).text(times(d.r));
      if (!exporting) g.on('click', (ev) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
        .on('mousemove', (ev) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b><br>Each vote here carries ${d.r.toFixed(2)}× the national average electoral weight:<br>` +
          PARTS.map(([k, name]) => `${name} ×${d[k].toFixed(2)}`).join('<br>') + `<br><span style="color:${GRAPHITE}">Click to select the state</span>`, ev.clientX, ev.clientY))
        .on('mouseleave', () => ctx.hover(null));
    });
    if (gapAt != null) svg.append('text').attr('x', pad.l - 8).attr('y', pad.t + gapAt * rh + rh / 2 + 4).attr('text-anchor', 'end').attr('fill', GRAPHITE).text('…');
  }

  // ---------- power cartogram ----------
  function drawTilesChart(P, e, w, hh) {
    const T = P.calc.states(e);
    if (ctl && !exporting) {
      ctl.querySelectorAll('[data-pm]').forEach((b) => b.addEventListener('click', () => play(P, e, w, hh, b.dataset.pm)));
      const r = ctl.querySelector('.pw-morph');
      r.value = tNow == null ? STOPS[P.pm] : tNow;
      r.addEventListener('input', () => { if (anim) { anim.stop(); anim = null; } tNow = +r.value; drawTiles(T, w, hh, tNow); });
      r.addEventListener('change', () => { const k = Object.keys(STOPS).reduce((a, b) => (Math.abs(STOPS[b] - tNow) < Math.abs(STOPS[a] - tNow) ? b : a)); tNow = null; ctx.setPower({ pm: k }); });
    }
    if (!anim) tNow = null;
    drawTiles(T, w, hh, tNow == null ? STOPS[P.pm] : tNow);
  }
  // Animate the squares from where they stand to a measure, then keep it.
  const play = (P, e, w, hh, k) => {
    const T = P.calc.states(e), from = tNow == null ? STOPS[P.pm] : tNow, to = STOPS[k];
    if (anim) anim.stop();
    const dur = DUR ? 900 * Math.abs(to - from) : 0;
    if (!dur) { anim = null; tNow = null; ctx.setPower({ pm: k }); return; }
    anim = d3.timer((el) => {
      const u = Math.min(1, el / dur), t = from + (to - from) * d3.easeCubicInOut(u);
      tNow = t; drawTiles(T, w, hh, t);
      const r = ctl && ctl.querySelector('.pw-morph'); if (r) r.value = t;
      if (u >= 1) { anim.stop(); anim = null; tNow = null; ctx.setPower({ pm: k }); }
    });
  };
  const shareAt = (x, t) => (t <= 1 ? x.share.votes + (x.share.ev - x.share.votes) * t : x.share.ev + (x.share.sen - x.share.ev) * (t - 1));
  function drawTiles(T, w, hh, t) {
    svg.selectAll('*').remove();
    const S = ctx.selectedStates(), pad = 4;
    const cs = Math.max(10, Math.min((w - pad * 2) / 12, (hh - pad * 2 - 18) / 8)), gx = (w - cs * 12) / 2, gy = 18 + pad;
    const by = Object.fromEntries(T.rows.map((x) => [x.st, x]));
    const stop = Object.keys(STOPS).find((k) => Math.abs(STOPS[k] - t) < 1e-6);
    svg.append('text').attr('class', 'axis-title').attr('x', gx).attr('y', 13).text(stop ? `Square area: share of ${STOP_NAME[stop].toLowerCase()}` : 'Square area: changing between measures');
    for (const [st, [c, r]] of Object.entries(TILES)) {
      const x = by[st], cx = gx + c * cs + cs / 2, cy = gy + r * cs + cs / 2;
      const g = svg.append('g').attr('class', 'pw-tile').attr('data-st', st).attr('opacity', S && !S.has(st) ? DIM : 1).style('cursor', x && !exporting ? 'pointer' : null);
      g.append('rect').attr('x', cx - cs / 2 + 1).attr('y', cy - cs / 2 + 1).attr('width', cs - 2).attr('height', cs - 2).attr('fill', 'none').attr('stroke', RULE).attr('stroke-width', 0.5);
      if (!x) { g.append('text').attr('x', cx).attr('y', cy + 4).attr('text-anchor', 'middle').attr('fill', GRAPHITE).text(st); continue; }
      const side = (cs - 3) * Math.sqrt(shareAt(x, t) / T.maxShare);
      g.append('rect').attr('x', cx - side / 2).attr('y', cy - side / 2).attr('width', side).attr('height', side).attr('fill', ctx.colour(x.margin, true))
        .attr('stroke', S && S.has(st) ? INK : 'none').attr('stroke-width', 2);
      const fs = Math.max(8, Math.min(12, cs * 0.24));
      g.append('text').attr('x', cx).attr('y', side > fs * 1.6 ? cy + fs / 3 : cy + side / 2 + fs + 1).attr('text-anchor', 'middle')
        .attr('class', side > fs * 1.6 ? 'sim-tile-st' : null).attr('fill', side > fs * 1.6 ? null : INK).style('font-size', fs + 'px').text(st);
      if (!exporting) g.on('click', (ev) => ctx.select({ kind: 'states', states: [st] }, { add: shiftOf(ev) }))
        .on('mousemove', (ev) => ctx.hoverHtml(`<b>${ctx.stateName(st)}</b><br>${fmt(x.votes)} votes cast, ${pct(x.share.votes, 2)} of the total<br>${x.ev} electoral votes, ${pct(x.share.ev, 2)}<br>` +
          (x.sen ? `${x.sen} Senate seats, ${pct(x.share.sen, 2)}` : 'No Senate seats') +
          `<br>Each vote here carries ${x.evPerVote.toFixed(2)}× the average electoral weight${x.sen ? ` and ${x.senPerVote.toFixed(2)}× the average Senate weight` : ''}<br><span style="color:${GRAPHITE}">Click to select the state</span>`, ev.clientX, ev.clientY))
        .on('mouseleave', () => ctx.hover(null));
    }
  }

  // ---------- concentration curves ----------
  function drawConc(P, e, w, hh) {
    const C = P.calc, by = P.pa === 'counties' ? 'cn' : 'ca';
    if (ctl && !exporting) {
      ctl.querySelectorAll('[data-pk]').forEach((b) => b.addEventListener('click', () => { ctx.setPower({ pk: b.dataset.pk }); selectReach(); }));
      ctl.querySelectorAll('[data-pa]').forEach((b) => b.addEventListener('click', () => ctx.setPower({ pa: b.dataset.pa })));
    }
    const narrow = w < 560, pad = { l: 58, r: narrow ? 16 : 40, t: 52, b: 50 };
    // No wider than twice its height, so the curves keep their shape in a wide card.
    const pw = Math.min(w - pad.l - pad.r, (hh - pad.t - pad.b) * 2);
    const x = d3.scaleLinear().domain([0, 1]).range([pad.l, pad.l + pw]), y = d3.scaleLinear().domain([0, 1]).range([hh - pad.b, pad.t]);
    for (const t of [0, 0.25, 0.5, 0.75, 1]) {
      svg.append('line').attr('x1', x(0)).attr('x2', x(1)).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', x(0) - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(pct(t, 0));
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', y(0)).attr('y2', y(1)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', x(t)).attr('y', y(0) + 16).attr('text-anchor', 'middle').text(pct(t, 0));
    }
    svg.append('text').attr('x', (x(0) + x(1)) / 2).attr('y', y(0) + 32).attr('text-anchor', 'middle').text(by === 'ca' ? 'Share of the land in counties with results, biggest counties for the party first' : 'Share of counties with results, biggest for the party first');
    svg.append('text').attr('x', 0).attr('y', 0).attr('transform', `translate(${x(0) - 44},${(y(0) + y(1)) / 2}) rotate(-90)`).attr('text-anchor', 'middle').text('Share of the party\'s votes');
    svg.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(1)).attr('y2', y(1)).attr('stroke', GRAPHITE).attr('stroke-dasharray', '3 4');
    svg.append('text').attr('x', x(0.78)).attr('y', y(0.74) + 14).attr('fill', GRAPHITE).text('even spread');
    for (const pk of ['r', 'd']) {
      const pts = C.curve(e, pk); if (!pts.length) continue;
      // Thin the path to about one point per pixel; the ends stay exact.
      const step = Math.max(1, Math.floor(pts.length / (x(1) - x(0)))), path = [{ cv: 0, cn: 0, ca: 0 }, ...pts.filter((_, i) => i % step === 0 || i === pts.length - 1)];
      svg.append('path').datum(path).attr('fill', 'none').attr('stroke', ctx.colour(pk === 'd' ? 60 : -60, true)).attr('stroke-width', pk === P.pk ? 3 : 2)
        .attr('opacity', pk === P.pk ? 1 : 0.7).attr('d', d3.line().x((p) => x(p[by])).y((p) => y(p.cv)));
    }
    // The marker: a level of the party's votes, read off both curves, dragged up and down by its handle.
    const mk = svg.append('g').attr('class', 'pw-marker'), sentence = svg.append('text').attr('class', 'axis-title pw-sentence').attr('x', x(0)).attr('y', 14);
    const sentence2 = svg.append('text').attr('class', 'axis-title pw-sentence').attr('x', x(0)).attr('y', 32);
    const drawMarker = (q) => {
      mk.selectAll('*').remove();
      const a = C.reach(e, P.pk, q), o = C.reach(e, P.pk === 'd' ? 'r' : 'd', q);
      if (!a) return;
      mk.append('line').attr('x1', x(0)).attr('x2', x(1)).attr('y1', y(q / 100)).attr('y2', y(q / 100)).attr('stroke', INK).attr('stroke-width', 1.5);
      for (const [r, pk] of [[a, P.pk], [o, P.pk === 'd' ? 'r' : 'd']]) if (r) {
        const xv = by === 'ca' ? r.land : r.counties;
        mk.append('line').attr('x1', x(xv)).attr('x2', x(xv)).attr('y1', y(q / 100)).attr('y2', y(0)).attr('stroke', ctx.colour(pk === 'd' ? 60 : -60, true)).attr('stroke-dasharray', '2 3');
        mk.append('circle').attr('cx', x(xv)).attr('cy', y(q / 100)).attr('r', pk === P.pk ? 6 : 4.5).attr('fill', ctx.colour(pk === 'd' ? 60 : -60, true)).attr('stroke', '#fff');
      }
      const handle = mk.append('g').attr('class', 'pw-handle').attr('transform', `translate(${x(1) + 10},${y(q / 100)})`).style('cursor', exporting ? null : 'ns-resize');
      if (!exporting) handle.append('path').attr('d', 'M-6,-9L6,-9L6,9L-6,9Z').attr('fill', INK);
      handle.append('text').attr('x', exporting ? 2 : -10).attr('y', -12).attr('text-anchor', 'end').attr('fill', INK).attr('font-weight', 700).text(`${q}%`);
      const A = PARTIES[P.pk], O = PARTIES[P.pk === 'd' ? 'r' : 'd'];
      sentence.text(`${q}% of ${A.name} votes came from ${fmt(a.n)} of ${fmt(a.of)} counties, holding ${pct(a.land)} of the land.`);
      sentence2.text(o ? `The same share of ${O.name} votes came from ${fmt(o.n)} counties, holding ${pct(o.land)} of the land.` : '');
      if (!exporting) handle.call(d3.drag().on('drag', (ev) => { qDrag = Math.max(1, Math.min(99, Math.round(y.invert(ev.y) * 100))); drawMarker(qDrag); })
        .on('end', () => { if (qDrag != null) { const q2 = qDrag; qDrag = null; ctx.setPower({ pq: String(q2) }); selectReach(); } }));
    };
    drawMarker(qDrag != null ? qDrag : +P.pq);
  }
  // The counties the marker reaches for the chosen party become the selection (kept in the link as a rule).
  const selectReach = () => {
    const P = ctx.power(), r = P.calc.reach(ctx.election(), P.pk, +P.pq);
    if (r) ctx.select({ kind: 'counties', counties: r.list, rule: `k:${P.pk}:${P.pq}` });
  };
  return { build, draw };
}
