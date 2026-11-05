/* District strips (House track only): one row per state, its districts as ticks on a margin axis, over the
   state's bands. At risk: a held seat whose margin is below the plausible swing. Captured: beyond the state's
   largest observed swing, or the plausible swing when higher. Contestable: between. house.js computes the
   bands from the plausible swing (Adjust); this view only draws them.
   Seats without a Democrat and a Republican sit apart at the row's end. Click a row or a district to select
   the state; shift adds. With states selected, only their rows are drawn, larger ("Show all states" brings the
   rest back). In export mode (?export=1) the rows keep a legible height and the view shows as many states as
   fit, most seats first, and says so. */
import { INK, GRAPHITE, RULE, DIM } from './style.js';

export const BAND_FILL = { atRisk: 'rgba(35,48,107,.16)', contestable: 'rgba(35,48,107,.07)' };
const MAX = 70;                        // margins beyond 70 points are drawn at the edge
export const lead = (m) => (m == null ? '' : m === 0 ? 'even' : `${m > 0 ? 'D' : 'R'}+${Math.abs(m).toFixed(1)}`);
export const distName = (d) => `${d.st}-${d.n === 'AL' ? 'AL' : d.n}`;

export function stripsView({ ctx, DUR, head, body, foot, place, shiftOf }) {
  const { fmt } = ctx;
  let axisSvg, rowsBox, gRows, sortKey = 'seats', showAll = false;
  const exporting = document.body.classList.contains('export');
  function build() {
    head.innerHTML = '<span class="v2d-label v2d-sort">Sort states by</span><div class="seg v2d-seg" role="group" aria-label="Sort states by">' +
      [['seats', 'Seats'], ['captured', 'Captured share'], ['name', 'Name']].map(([k, t]) => `<button data-sort="${k}" aria-pressed="${k === sortKey}">${t}</button>`).join('') + '</div>' +
      '<span class="v2d-ref strips-count"></span><button class="v2d-showall" hidden></button><button class="lens-i" aria-label="How the bands are set">i</button>';
    head.querySelector('.v2d-showall').addEventListener('click', () => { showAll = !showAll; draw(false); });
    head.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { sortKey = b.dataset.sort; head.querySelectorAll('[data-sort]').forEach((x) => x.setAttribute('aria-pressed', x === b)); draw(true); }));
    ctx.infoButton(head.querySelector('.lens-i'), () => {
      const h = ctx.house();
      return `Plausible swing: ${h.plausible.label}; change it under Adjust. ` +
        'At risk: a held seat whose margin is below the plausible swing. Captured: a margin above the state\'s largest observed swing, or above the plausible swing when that is higher. Contestable: between. ' +
        'An observed swing is the change in a district\'s margin between two elections on the same lines, Democrat against Republican. ' +
        `States with fewer than ${h.data.minSwings} observed swings use national figures (the median state's largest, ${h.national.largest} points, and median, ${h.national.median}). ` +
        'Seats without a Democrat and a Republican are kept apart. The bands describe margins, not anyone\'s intent. Click a row to select the state.';
    });
    body.innerHTML = '';
    axisSvg = d3.select(body).append('svg').attr('class', 'v2d-band strips-axis');
    rowsBox = d3.select(body).append('div').attr('class', 'v2d-rows');
    gRows = rowsBox.append('svg');
  }
  function draw(animate = true) {
    const h = ctx.house();
    foot.textContent = `Plausible swing: ${h.plausible.label}. At risk: below it; captured: above the state's largest observed swing, or the plausible swing if higher. ${h.unofficial ? `${h.label} is unofficial (AP via CNN, as of ${h.asof}).` : ''}`;
    const { w, h: hh } = place(), narrow = w < 520;
    const padL = narrow ? 44 : 150, padR = narrow ? 34 : 70, AH = 30;
    const xs = d3.scaleLinear().domain([-MAX, MAX]).range([padL, w - padR]).clamp(true);
    const S = ctx.selectedStates();
    // Axis: margin, Republican left, Democrat right.
    axisSvg.attr('width', w).attr('height', AH).selectAll('*').remove();
    for (const t of xs.ticks(narrow ? 4 : 8)) {
      axisSvg.append('line').attr('x1', xs(t)).attr('x2', xs(t)).attr('y1', AH - 8).attr('y2', AH).attr('stroke', t === 0 ? INK : RULE);
      axisSvg.append('text').attr('x', xs(t)).attr('y', AH - 11).attr('text-anchor', 'middle').text(t === 0 ? 'even' : `${t > 0 ? 'D' : 'R'}+${Math.abs(t)}`);
    }
    axisSvg.append('text').attr('class', 'axis-title').attr('x', narrow ? 2 : 6).attr('y', 12).text(`Margin, ${h.label}`);
    if (!narrow) axisSvg.append('text').attr('x', w - padR + 6).attr('y', AH - 11).text('apart');
    // Rows.
    const by = d3.group(h.districts, (d) => d.st);
    const list = [...by].map(([st, ds]) => ({ st, ds: ds.slice().sort((a, b) => (a.m ?? 0) - (b.m ?? 0)), t: h.thr[st], L: h.lines[st], s: h.states[st] }));
    const share = (r) => r.s.captured / Math.max(1, r.ds.length);
    const sb = head.querySelector('.v2d-showall');
    sb.hidden = !S; sb.textContent = !S ? '' : showAll ? 'Only the selected states' : 'Show all states';
    const only = S && !showAll;
    list.sort({ seats: (a, b) => b.ds.length - a.ds.length || a.st.localeCompare(b.st), captured: (a, b) => share(b) - share(a) || b.ds.length - a.ds.length,
      name: (a, b) => ctx.stateName(a.st).localeCompare(ctx.stateName(b.st)) }[sortKey]);
    const avail = Math.max(80, hh - AH - 6);
    let shown = only ? list.filter((r) => S.has(r.st)) : list, note = '';
    // Selected states alone get taller rows; an export keeps rows legible and shows only what fits, saying so.
    const RH = only ? Math.max(20, Math.min(shown.length > 3 ? 64 : 160, Math.floor((avail - 6) / Math.max(1, shown.length)))) : 20;
    if (exporting && !only && shown.length * RH + 6 > avail) {
      const bySeats = shown.slice().sort((a, b) => b.ds.length - a.ds.length || a.st.localeCompare(b.st));
      const keep = new Set(bySeats.slice(0, Math.max(1, Math.floor((avail - 6) / RH))).map((r) => r.st));
      const seats = bySeats.filter((r) => keep.has(r.st)).reduce((a, r) => a + r.ds.length, 0);
      note = ` · The ${keep.size} states with the most seats (${fmt(seats)} of ${fmt(h.districts.length)} districts); every state is on the page.`;
      shown = shown.filter((r) => keep.has(r.st));
    }
    const big = RH >= 32, TH = big ? Math.min(RH - 12, 120) : RH - 6, TW = big ? 5 : 3;
    rowsBox.style('height', avail + 'px').style('overflow-y', exporting ? 'hidden' : null);
    gRows.attr('width', w).attr('height', shown.length * RH + 6);
    const g = gRows.selectAll('g.row').data(shown, (r) => r.st);
    g.exit().remove();
    const ge = g.enter().append('g').attr('class', 'row');
    ge.append('rect').attr('class', 'hit').attr('x', 0).attr('height', RH).attr('fill', 'transparent');
    ge.append('rect').attr('class', 'contestable');
    ge.append('rect').attr('class', 'atrisk');
    ge.append('line').attr('class', 'zero');
    ge.append('text').attr('class', 'st').attr('x', 6);
    ge.append('g').attr('class', 'ticks');
    ge.append('g').attr('class', 'apart');
    const gm = ge.merge(g);
    (animate && DUR ? gm.transition().duration(DUR) : gm).attr('transform', (r, i) => `translate(0,${3 + i * RH})`);
    gm.attr('opacity', (r) => (S && !S.has(r.st) ? DIM : 1));
    gm.select('.hit').attr('width', w).attr('height', RH).style('cursor', 'pointer')
      .on('click', (ev, r) => ctx.select({ kind: 'states', states: [r.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, r) => ctx.hoverHtml(rowHtml(r, h), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    gm.select('.contestable').attr('x', (r) => xs(-r.L.captured)).attr('width', (r) => xs(r.L.captured) - xs(-r.L.captured)).attr('y', 2).attr('height', RH - 4).attr('fill', BAND_FILL.contestable).attr('pointer-events', 'none');
    gm.select('.atrisk').attr('x', (r) => xs(-r.L.atRisk)).attr('width', (r) => xs(r.L.atRisk) - xs(-r.L.atRisk)).attr('y', 2).attr('height', RH - 4).attr('fill', BAND_FILL.atRisk).attr('pointer-events', 'none');
    gm.select('.zero').attr('x1', xs(0)).attr('x2', xs(0)).attr('y1', 1).attr('y2', RH - 1).attr('stroke', RULE).attr('pointer-events', 'none');
    gm.select('.st').attr('y', RH / 2 + 4).attr('pointer-events', 'none').attr('font-weight', (r) => (S && S.has(r.st) && !only ? 700 : 400)).style('font-size', big ? '14px' : null)
      .text((r) => (narrow ? r.st : `${ctx.stateName(r.st)} ${r.ds.length}`));
    gm.each(function (r) {
      const live = r.ds.filter((d) => d.band !== 'apart'), apart = r.ds.filter((d) => d.band === 'apart');
      const t = d3.select(this).select('.ticks').selectAll('rect').data(live, distName);
      t.exit().remove();
      t.enter().append('rect').attr('x', (d) => xs(d.m) - TW / 2).merge(t).attr('width', TW).attr('y', (RH - TH) / 2).attr('height', TH)
        .attr('fill', (d) => ctx.colour(d.m, true)).attr('stroke', (d) => (d.band === 'captured' ? INK : 'none')).attr('stroke-width', 0.6)
        .on('mousemove', (ev, d) => ctx.hoverHtml(districtHtml(d, r, h), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null))
        .on('click', (ev) => { ev.stopPropagation(); ctx.select({ kind: 'states', states: [r.st] }, { add: shiftOf(ev) }); })
        .style('cursor', 'pointer')
        .transition().duration(animate ? DUR : 0).attr('x', (d) => xs(d.m) - TW / 2);
      const a = d3.select(this).select('.apart').selectAll('rect').data(apart, distName);
      a.exit().remove();
      a.enter().append('rect').attr('width', 5).attr('height', 5).attr('y', RH / 2 - 2.5).merge(a)
        .attr('x', (d, i) => w - padR + 6 + (i % 8) * 7).attr('fill', 'none').attr('stroke', GRAPHITE).attr('stroke-width', 0.8)
        .on('mousemove', (ev, d) => ctx.hoverHtml(districtHtml(d, r, h), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null))
        .on('click', (ev) => { ev.stopPropagation(); ctx.select({ kind: 'states', states: [r.st] }, { add: shiftOf(ev) }); });
    });
    // Counts across the map (or across the selected states when only they are drawn), in the head.
    const n = (b) => h.districts.filter((d) => d.band === b && (!only || S.has(d.st))).length;
    head.querySelector('.strips-count').innerHTML =
      `<i class="swatch" style="background:${BAND_FILL.atRisk}"></i>${fmt(n('at risk'))} at risk <i class="swatch" style="background:${BAND_FILL.contestable}"></i>${fmt(n('contestable'))} contestable ` +
      `<i class="swatch"></i>${fmt(n('captured'))} captured · ${fmt(n('apart'))} without a Democrat and a Republican` + note;
  }
  const rowHtml = (r, h) => `<b>${ctx.stateName(r.st)}</b>, ${h.label}<br>${r.ds.length} district${r.ds.length > 1 ? 's' : ''}: ${r.s.captured} captured, ${r.s.contestable} contestable, ${r.s.atRisk} at risk` +
    `${r.s.apart ? `, ${r.s.apart} apart` : ''}<br>At risk below ${r.L.atRisk} points; captured above ${r.L.captured}<br>Observed swing here: largest ${r.t.largest}, median ${r.t.median} (${r.t.basis})<br><span style="color:${GRAPHITE}">Click to select the state</span>`;
  const districtHtml = (d, r, h) => {
    const who = d.w ? `${d.w === 'D' ? 'Democrat' : 'Republican'} ${h.year === '2026' ? (d.status === 'called' ? 'won (AP call)' : 'leading') : 'won'}` : 'not decided (runoff or uncalled)';
    return `<b>${distName(d)}</b>, ${h.label}${h.unofficial ? ' (unofficial)' : ''}<br>${d.T ? `${fmt(d.T)} votes: Republican ${fmt(d.R)}, Democratic ${fmt(d.D)}; ${lead(d.m)}` : 'No votes printed (unopposed)'}<br>${who}` +
      (d.band === 'apart' ? `<br>Kept apart: ${d.reason || 'no Democrat-vs-Republican race'}`
        : `<br>${d.band[0].toUpperCase() + d.band.slice(1)}: at risk below ${r.L.atRisk} points, captured above ${r.L.captured}${d.capv ? `<br>Captured votes: ${fmt(d.capv)}` : ''}`);
  };
  return { build, draw };
}
