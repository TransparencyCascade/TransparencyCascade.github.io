/* Road to 270 (and to 51), any track, flat: one horizontal bar of the election day's electoral votes (or the Senate's
   100 seats), each state (or race) a segment as wide as its electoral votes (or one seat), ordered from the safest
   Democratic result to the safest Republican one by two-party margin. The winning side's line (270, or 51) is
   marked, the segment that holds its last needed vote is outlined (the tipping point) with its margin in votes,
   and the closest results by votes to flip are listed under the bar. Hover a segment for its margin and the votes
   that would flip it; click selects the state. Under the President bar: the tipping state against the nation (bias.js,
   from history.json): the national popular-vote margin, the tipping state and its margin, and the gap in a sentence. state.rb picks President or Senate. Arithmetic in ../races.js. */
import { INK, GRAPHITE, RULE, DIM } from './style.js';
import { rowFor, natLine, tipLine, gapSentence, ratioLine } from '../bias.js';

const BARS = [['pres', 'President'], ['sen', 'Senate']];
const GROUND = '#E8ECEC';

export function roadView({ ctx, head, body, foot, place, shiftOf, DUR }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let svg, prev = new Map();
  function build() {
    head.innerHTML = (exporting ? '' : '<div class="seg v2d-seg" role="group" aria-label="Bar">' + BARS.map(([k, t]) => `<button data-rb="${k}">${t}</button>`).join('') + '</div>') +
      '<span class="v2d-ref rd-note"></span>';
    head.querySelectorAll('[data-rb]').forEach((b) => b.addEventListener('click', () => ctx.setRoad({ rb: b.dataset.rb })));
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-band rd-chart');
  }
  const pts = (x) => Math.abs(x).toFixed(1);
  const side = (r, c) => ({ D: 'Democrats', R: 'Republicans' }[c]);
  const tipHtml = (r, s) => {
    if (s.kind === 'held') return `<b>${s.name}</b><br>${fmt(s.size)} ${s.size === 1 ? r.unit.replace(/s$/, '') : r.unit}, held at ${r.body === 'pres' ? 'their result as cast' : 'the party holding them'}`;
    const who = s.win === 'D' ? 'Democratic' : 'Republican';
    if (s.votes == null) return `<b>${s.name}</b><br>${who} hold, held at its result: ${s.why || 'no Democrat against a Republican'}<br><span style="color:${GRAPHITE}">Click to select the state</span>`;
    return `<b>${s.name}</b>${r.body === 'pres' ? `<br>${s.size} electoral votes` : ''}<br>${who} ahead by ${fmt(s.votes)} votes, ${pts(s.points)} points of the two-party vote${s.called === false ? ' (leading, not called)' : ''}` +
      `<br>${fmt(s.flip)} votes switching would flip it${r.tip === s ? '<br>The tipping point' : ''}<br><span style="color:${GRAPHITE}">Click to select the state</span>`;
  };
  function draw(animate = true) {
    const R = ctx.road();
    head.querySelectorAll('[data-rb]').forEach((b) => { b.setAttribute('aria-pressed', !!R && b.dataset.rb === R.body); b.disabled = !R || !R.bodies.includes(b.dataset.rb); });
    const note = head.querySelector('.rd-note');
    const { w, h: h0 } = place();
    svg.attr('width', w).attr('height', Math.max(h0, 330)).selectAll('*').remove();
    if (!R || !R.road) { note.textContent = R ? `No ${R.body === 'pres' ? 'presidential' : 'Senate'} result for ${R.label} in the page.` : 'Loading…'; foot.textContent = ''; return; }
    const r = R.road, S = ctx.selectedStates(), narrow = w < 520, pad = { l: 8, r: 8 };
    const x = d3.scaleLinear().domain([0, r.total]).range([pad.l, w - pad.r]);
    const unit = r.unit, evw = r.body === 'pres';
    note.textContent = evw ? `${R.label}: ${r.total} electoral votes, each state a segment as wide as its electoral votes, from the most Democratic to the most Republican by two-party margin.`
      : `${R.label}: ${r.total} seats, each race one seat; the seats not on the ballot stand at their party's end.`;
    foot.textContent = R.sources + (R.unofficial ? ' ' + R.unofficial : '');
    // The two sentences: who won, and the tipping point with its margin.
    const win = r.control, lose = win === 'D' ? 'R' : 'D';
    const lines = [];
    if (evw) lines.push(win === 'none' ? `Democrats ${r.D}, Republicans ${r.R} electoral votes; no side reached ${r.need}.` : `${side(r, win)} ${r[win]} electoral votes, ${side(r, lose)} ${r[lose]}; ${r.need} needed.`);
    else lines.push(`${side(r, 'D')} ${r.counts.D}, ${side(r, 'R')} ${r.counts.R} seats${r.control === 'none' ? '; neither side reached 51' : r.mine < r.need ? `; ${side(r, win)} control with the vice president's vote (${r.vp === 'D' ? 'Democrat' : 'Republican'})` : `; ${side(r, win)} hold the majority`}.`);
    const t = r.tip;
    lines.push(t ? `Tipping point: ${t.name}${evw ? ` (${t.size} electoral votes)` : ''}, ${t.win === 'D' ? 'Democratic' : 'Republican'} by ${fmt(t.votes)} votes, ${pts(t.points)} points; ${fmt(t.flip)} votes switching would have changed its result.`
      : 'No tipping point: control does not rest on one race in this data.');
    // Sentences wrap to the width; the bar sits below them.
    const wrap = (ls, y0, cls, lh, gap) => {
      let y = y0;
      for (const l of ls) {
        const words = l.split(' '); let cur = '', t = svg.append('text').attr('class', cls).attr('x', pad.l).attr('y', y);
        for (const wd of words) { const tr = cur ? cur + ' ' + wd : wd; t.text(tr); if (t.node().getComputedTextLength() > w - pad.l - pad.r && cur) { t.text(cur); y += lh; t = svg.append('text').attr('class', cls).attr('x', pad.l).attr('y', y).text(wd); cur = wd; } else cur = tr; }
        y += gap;
      }
      return y;
    };
    let ly = wrap(lines, 16, 'rd-line', 18, 22);
    // The bar, the winning side's line.
    const bt = ly + 40, bh = narrow ? 46 : 62, bb = bt + bh;
    if (r.lineAt != null) {
      svg.append('line').attr('x1', x(r.lineAt)).attr('x2', x(r.lineAt)).attr('y1', bt - 16).attr('y2', bb + 6).attr('stroke', INK).attr('stroke-width', 2);
      const lt = svg.append('text').attr('class', 'rd-lab').attr('x', x(r.lineAt)).attr('y', bt - 20).attr('text-anchor', 'middle').text(`${r.mine} ${unit}`);
      const bw = lt.node().getComputedTextLength(), cx = Math.max(bw / 2 + 2, Math.min(w - bw / 2 - 2, x(r.lineAt))); lt.attr('x', cx);
    }
    if (!narrow) { svg.append('text').attr('x', pad.l).attr('y', bt - 6).attr('fill', GRAPHITE).text('most Democratic'); svg.append('text').attr('x', w - pad.r).attr('y', bt - 6).attr('text-anchor', 'end').attr('fill', GRAPHITE).text('most Republican'); }
    const pos = new Map(r.segs.map((s) => [s.id, [x(s.x0), x(s.x1) - x(s.x0)]]));
    const g = svg.append('g');
    const sel = (s) => !S || s.kind === 'held' || S.has(s.st);
    const fill = (s) => (s.kind === 'held' || s.votes == null ? ctx.colour(s.win === 'D' ? 60 : -60, true) : ctx.colour(s.points, true));
    const rects = g.selectAll('rect').data(r.segs, (s) => s.id).enter().append('rect').attr('class', 'rd-seg').attr('data-st', (s) => s.st || s.id).attr('y', bt).attr('height', bh)
      .attr('x', (s) => (prev.get(s.id) || pos.get(s.id))[0]).attr('width', (s) => (prev.get(s.id) || pos.get(s.id))[1])
      .attr('fill', fill).attr('fill-opacity', (s) => (s.kind === 'held' || s.votes == null ? 0.5 : 1)).attr('stroke', GROUND).attr('stroke-width', 0.8)
      .attr('opacity', (s) => (sel(s) ? 1 : DIM)).style('cursor', (s) => (s.st && !exporting ? 'pointer' : null));
    (animate && DUR && prev.size ? rects.transition().duration(DUR) : rects).attr('x', (s) => pos.get(s.id)[0]).attr('width', (s) => pos.get(s.id)[1]);
    prev = pos;
    if (t) { const [tx, tw] = pos.get(t.id); svg.append('rect').attr('class', 'rd-tip').attr('x', tx - 1.5).attr('y', bt - 3).attr('width', tw + 3).attr('height', bh + 6).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 3).style('pointer-events', 'none'); }
    // Labels: inside a segment wide enough, otherwise rotated under the bar in the first row that is free, with a leader.
    const rowH = 24, edge = [], fs = 11;
    for (const s of r.segs) {
      if (!s.label) { if (pos.get(s.id)[1] > 90) svg.append('text').attr('class', 'rd-in').attr('x', pos.get(s.id)[0] + pos.get(s.id)[1] / 2).attr('y', bt + bh / 2 + 4).attr('text-anchor', 'middle')
        .text(pos.get(s.id)[1] > 230 ? `${s.size} ${s.kind === 'held' && !evw ? 'seats not on the ballot' : unit}` : `${s.size}`); continue; }
      const [sx, sw] = pos.get(s.id), cx = sx + sw / 2;
      if (sw >= 24) { svg.append('text').attr('class', 'rd-in').attr('x', cx).attr('y', bt + bh / 2 + 4).attr('text-anchor', 'middle').text(s.label); continue; }
      let row = 0; while (edge[row] != null && edge[row] > cx - fs / 2 - 1) row++;
      edge[row] = cx + fs / 2;
      const ty = bb + 8 + row * rowH;
      svg.append('line').attr('x1', cx).attr('x2', cx).attr('y1', bb).attr('y2', ty).attr('stroke', RULE).attr('stroke-width', 0.6);
      svg.append('text').attr('class', 'rd-out').attr('transform', `translate(${cx + 4},${ty + 1}) rotate(90)`).text(s.label);
    }
    const rowsUsed = Math.max(1, edge.length);
    let top = bb + 8 + rowsUsed * rowH + 8;
    // The tipping state against the nation (President only): two figures and the gap, in plain words.
    const B = evw ? rowFor(ctx.history(), r.year) : null;
    if (B) {
      const ey = wrap([natLine(B), tipLine(B), `${gapSentence(B)} ${ratioLine(B)}`], top + 4, 'rd-row rd-bias', 15, 18);
      svg.selectAll('.rd-bias').attr('data-bias', B.year);
      top = ey + 2;
    }
    // Under the bar: the closest results by votes to flip, each a row that selects its state.
    const near = r.byFlip.slice(0, Math.max(0, Math.min(narrow ? 5 : 8, Math.floor((Math.max(h0, 330) - top - 28) / 20))));
    if (near.length) {
      svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', top + 12).text(`Fewest votes to flip, among the ${r.byFlip.length} ${evw ? 'states' : 'races'} with a result:`);
      near.forEach((s, i) => {
        const y = top + 20 + i * 20 + 14, row = svg.append('g').attr('class', 'rd-near').attr('data-st', s.st).style('cursor', exporting ? null : 'pointer');
        row.append('rect').attr('x', 0).attr('y', y - 14).attr('width', w).attr('height', 20).attr('fill', 'transparent');
        row.append('rect').attr('x', pad.l).attr('y', y - 9).attr('width', 11).attr('height', 11).attr('fill', fill(s));
        row.append('text').attr('class', 'rd-row').attr('x', pad.l + 18).attr('y', y).attr('font-weight', S && S.has(s.st) ? 700 : null).text(narrow ? `${s.st}: ${fmt(s.flip)} to flip` : `${s.name}${evw ? `, ${s.size} electoral votes` : ''}: margin ${fmt(s.votes)} votes, ${pts(s.points)} points; ${fmt(s.flip)} votes to flip${s === t ? '; tipping point' : ''}`);
        if (!exporting) row.on('click', (ev) => ctx.select({ kind: 'states', states: [s.st] }, { add: shiftOf(ev) })).on('mousemove', (ev) => ctx.hoverHtml(tipHtml(r, s), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
      });
    }
    if (!exporting) {
      rects.on('mousemove', (ev, s) => ctx.hoverHtml(tipHtml(r, s), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null))
        .on('click', (ev, s) => { if (s.st) ctx.select({ kind: 'states', states: [s.st] }, { add: shiftOf(ev) }); });
    }
    const left = S ? r.segs.filter((s) => s.st && S.has(s.st)).length : 0;
    ctx.viewNote(S ? `${fmt(left)} of the ${r.segs.filter((s) => s.st).length} ${evw ? 'states' : 'races'} in this bar are in the selection.` : '');
  }
  return { build, draw };
}
