/* Seats against votes (House track only): one point per state, its Democratic share of the two-party
   House vote against its Democratic share of the seats, beside the line where the two are equal; then a
   bar per state for its captured votes and, where it can be computed, the efficiency gap. Figures from
   build_house.py (house.json). Click a point or a row to select the state; shift adds. */
import { INK, GRAPHITE, RULE, DIM } from './style.js';

export const EG_DEF = 'Efficiency gap: a published measure (Stephanopoulos and McGhee, 2015) of the difference between the parties\' "wasted" votes (a losing candidate\'s votes, and a winner\'s votes beyond half plus one) as a share of two-party votes; shown only for states with two or more districts, all with a Democrat and a Republican.';

export function seatsView({ ctx, DUR, head, body, foot, place, shiftOf, nearest, hitLayer }) {
  const { fmt } = ctx;
  let svg, gPlot, barsBox, gBars, nearFn = () => null;
  function build() {
    head.innerHTML = '<span class="v2d-ref seats-note"></span><button class="lens-i" aria-label="About these measures">i</button>';
    ctx.infoButton(head.querySelector('.lens-i'), () => 'Each point is a state: its Democratic share of the two-party House vote (across) against its share of the seats (up). ' +
      'On the diagonal the two are equal. Captured votes: in captured seats, the winner\'s votes beyond the captured line (the state\'s largest observed swing, or the plausible swing when higher) plus all the runner-up\'s. ' + EG_DEF);
    body.innerHTML = '';
    const wrap = d3.select(body).append('div').attr('class', 'seats-wrap');
    svg = wrap.append('svg').attr('class', 'v2d-band');
    gPlot = svg.append('g');
    hitLayer(svg, () => nearFn, (p, add) => ctx.select({ kind: 'states', states: [p.st] }, { add }), (p) => pointHtml(p));
    svg.on('click.pick', (ev) => { const p = nearFn(ev.clientX, ev.clientY); if (p) ctx.select({ kind: 'states', states: [p.st] }, { add: shiftOf(ev) }); });
    barsBox = wrap.append('div').attr('class', 'v2d-rows');
    gBars = barsBox.append('svg');
  }
  let hNow = null;
  function draw(animate = true) {
    const h = (hNow = ctx.house());
    foot.textContent = `Captured votes are counted in captured seats only; uncontested seats count toward seats but are marked (hollow). ${h.unofficial ? `${h.label} is unofficial (AP via CNN, as of ${h.asof}).` : ''}`;
    const { w, h: hh } = place(), narrow = w < 720;
    const S = ctx.selectedStates();
    const pts = Object.entries(h.states).filter(([, s]) => s.dshare != null && s.seatsD + s.seatsR > 0)
      .map(([st, s]) => ({ st, s, x: s.dshare, y: s.seatsD / (s.seatsD + s.seatsR) * 100 }));
    // The plot: square, as large as the space allows; the bars beside it (below on narrow screens).
    const side = Math.max(200, Math.min(narrow ? w : w * 0.5, narrow ? hh * 0.55 : hh) - 4);
    d3.select(body).select('.seats-wrap').style('display', 'flex').style('flex-direction', narrow ? 'column' : 'row').style('gap', '14px').style('height', hh + 'px');
    svg.attr('width', side).attr('height', side);
    const pad = { l: 46, r: 12, t: 22, b: 36 };
    const x = d3.scaleLinear().domain([0, 100]).range([pad.l, side - pad.r]), y = d3.scaleLinear().domain([0, 100]).range([side - pad.b, pad.t]);
    const maxN = d3.max(pts, (p) => p.s.districts) || 1, rad = (p) => 3 + 13 * Math.sqrt(p.s.districts / maxN);
    gPlot.selectAll('*').remove();
    for (const t of [0, 25, 50, 75, 100]) {
      gPlot.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', pad.t).attr('y2', side - pad.b).attr('stroke', RULE).attr('stroke-width', t === 50 ? 1 : 0.5);
      gPlot.append('line').attr('x1', pad.l).attr('x2', side - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', t === 50 ? 1 : 0.5);
      gPlot.append('text').attr('x', x(t)).attr('y', side - pad.b + 14).attr('text-anchor', 'middle').text(t + '%');
      gPlot.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t + '%');
    }
    gPlot.append('line').attr('x1', x(0)).attr('y1', y(0)).attr('x2', x(100)).attr('y2', y(100)).attr('stroke', INK).attr('stroke-dasharray', '4 3');
    gPlot.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', side - 4).text('Democratic share of the two-party House vote');
    gPlot.append('text').attr('class', 'axis-title').attr('transform', `translate(12,${side - pad.b}) rotate(-90)`).text('Democratic share of the seats');
    gPlot.append('text').attr('x', x(24)).attr('y', y(17)).text('seats equal votes');
    const sorted = pts.slice().sort((a, b) => b.s.districts - a.s.districts);
    gPlot.selectAll('circle').data(sorted, (p) => p.st).join('circle')
      .attr('cx', (p) => x(p.x)).attr('cy', (p) => y(p.y)).attr('r', rad)
      .attr('fill', (p) => (p.s.apart ? 'none' : ctx.colour(2 * p.x - 100, true))).attr('stroke', (p) => (p.s.apart ? ctx.colour(2 * p.x - 100, true) : 'rgba(35,48,107,.5)'))
      .attr('stroke-width', (p) => (p.s.apart ? 2 : 0.6)).attr('opacity', (p) => (S && !S.has(p.st) ? DIM : 0.92)).style('pointer-events', 'none');
    // State labels for the larger states, biggest first; a label that would overlap one already placed is left off.
    const placed = [], cw = 7;
    const labs = sorted.filter((p) => p.s.districts >= 8).filter((p) => {
      const lx = x(p.x) + rad(p) + 2, ly = y(p.y) + 4, box = [lx, ly - 10, lx + cw * p.st.length, ly + 2];
      if (placed.some((b) => box[0] < b[2] && box[2] > b[0] && box[1] < b[3] && box[3] > b[1])) return false;
      placed.push(box); return true;
    });
    gPlot.selectAll('text.lab').data(labs, (p) => p.st).join('text').attr('class', 'lab')
      .attr('x', (p) => x(p.x) + rad(p) + 2).attr('y', (p) => y(p.y) + 4).text((p) => p.st).style('pointer-events', 'none');
    nearFn = nearest(svg.node(), sorted, (p) => [x(p.x), y(p.y)], rad);
    const shownNote = drawBars(h, narrow ? w : w - side - 14, narrow ? hh - side - 14 : hh, S);
    const nEg = Object.values(h.states).filter((s) => s.eg != null).length;
    head.querySelector('.seats-note').textContent = `${h.label}: point area is the number of districts; hollow: a state with seats lacking a Democrat and a Republican; efficiency gap computed for ${nEg} states.${shownNote}`;
  }
  function drawBars(h, w, hAvail, S) {
    barsBox.style('height', Math.max(120, hAvail) + 'px').style('flex', '1');
    let rows = Object.entries(h.states).map(([st, s]) => ({ st, s, cp: s.T ? s.capv / s.T * 100 : 0 })).sort((a, b) => b.cp - a.cp || a.st.localeCompare(b.st));
    // Two columns with room between for the value labels: captured votes left, the efficiency gap right.
    const RH = 18, top = 34, labW = 34, mid = labW + (w - labW) * 0.5;
    // An export shows whole rows only, as many as fit, and says so.
    let note = '';
    const fit = Math.floor((Math.max(120, hAvail) - top - 6) / RH);
    if (document.body.classList.contains('export') && rows.length > fit) {
      note = ` Bars: the ${fit} states with the largest share of captured votes; every state is on the page.`;
      rows = rows.slice(0, fit);
    }
    const xc = d3.scaleLinear().domain([0, Math.max(10, d3.max(rows, (r) => r.cp))]).range([labW + 4, mid - 52]);
    const egMax = Math.max(10, d3.max(rows, (r) => Math.abs(r.s.eg || 0)));
    const xe = d3.scaleLinear().domain([-egMax, egMax]).range([mid + 40, w - 36]);
    gBars.attr('width', w).attr('height', top + rows.length * RH + 6).selectAll('*').remove();
    gBars.append('text').attr('class', 'axis-title').attr('x', labW + 4).attr('y', 13).text('Captured votes, % of votes cast');
    gBars.append('text').attr('class', 'axis-title').attr('x', xe(-egMax)).attr('y', 13).text('Efficiency gap, points');
    // The measure's sign, in outcome terms: a positive gap means more Democratic votes counted as "wasted", a map tilted to Republicans.
    gBars.append('text').attr('x', xe(0) - 4).attr('y', 27).attr('text-anchor', 'end').text('tilts to Dem.');
    gBars.append('text').attr('x', xe(0) + 4).attr('y', 27).text('tilts to Rep.');
    gBars.append('line').attr('x1', xe(0)).attr('x2', xe(0)).attr('y1', top - 4).attr('y2', top + rows.length * RH).attr('stroke', RULE);
    const g = gBars.selectAll('g.r').data(rows, (r) => r.st).join('g').attr('class', 'r').attr('transform', (r, i) => `translate(0,${top + i * RH})`)
      .attr('opacity', (r) => (S && !S.has(r.st) ? DIM : 1)).style('cursor', 'pointer')
      .on('click', (ev, r) => ctx.select({ kind: 'states', states: [r.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, r) => ctx.hoverHtml(pointHtml({ st: r.st, s: r.s }), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    g.append('rect').attr('x', 0).attr('width', w).attr('height', RH).attr('fill', 'transparent');
    g.append('text').attr('class', 'st').attr('x', 2).attr('y', RH / 2 + 4).text((r) => r.st);
    g.append('rect').attr('x', xc(0)).attr('y', 4).attr('height', RH - 8).attr('width', (r) => xc(r.cp) - xc(0)).attr('fill', INK).attr('opacity', 0.75);
    g.append('text').attr('x', (r) => xc(r.cp) + 3).attr('y', RH / 2 + 4).text((r) => (r.s.capv ? r.cp.toFixed(1) + '%' : '0'));
    g.filter((r) => r.s.eg != null).append('rect').attr('y', 4).attr('height', RH - 8)
      .attr('x', (r) => Math.min(xe(0), xe(r.s.eg))).attr('width', (r) => Math.abs(xe(r.s.eg) - xe(0))).attr('fill', GRAPHITE).attr('opacity', 0.7);
    g.append('text').attr('y', RH / 2 + 4)
      .attr('x', (r) => (r.s.eg == null ? xe(0) + 4 : r.s.eg >= 0 ? xe(r.s.eg) + 3 : xe(r.s.eg) - 3)).attr('text-anchor', (r) => (r.s.eg != null && r.s.eg < 0 ? 'end' : 'start'))
      .text((r) => (r.s.eg == null ? 'not computed' : `${Math.abs(r.s.eg).toFixed(1)}`));
    barsBox.style('overflow-y', note ? 'hidden' : null);
    return note;
  }
  const pointHtml = (p) => {
    const s = p.s, h = hNow, egT = s.eg == null ? `not computed (${s.egWhy})` : `${Math.abs(s.eg).toFixed(1)} points, tilted to ${s.eg >= 0 ? 'Republicans' : 'Democrats'} (more ${s.eg >= 0 ? 'Democratic' : 'Republican'} votes counted as "wasted" by the measure)`;
    return `<b>${ctx.stateName(p.st)}</b>, ${h.label}${h.unofficial ? ' (unofficial)' : ''}<br>${s.districts} district${s.districts > 1 ? 's' : ''}: Democrats ${s.seatsD}, Republicans ${s.seatsR}` +
      `${s.districts - s.seatsD - s.seatsR ? `, ${s.districts - s.seatsD - s.seatsR} undecided` : ''}<br>Democratic share of the two-party vote: ${s.dshare == null ? 'none' : s.dshare.toFixed(1) + '%'}` +
      `<br>Captured seats ${s.captured}; captured votes ${fmt(s.capv)} (${s.T ? (s.capv / s.T * 100).toFixed(1) : 0}% of votes cast)${s.apart ? `<br>${s.apart} seat${s.apart > 1 ? 's' : ''} without a Democrat and a Republican` : ''}` +
      `<br>Efficiency gap: ${egT}<br><span style="color:${GRAPHITE}">Click to select the state</span>`;
  };
  return { build, draw };
}
