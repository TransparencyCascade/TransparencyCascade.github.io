/* History (any office): the long view, from history.json (build_history.py). One chart at a time, chosen by the
   switch in the head (state.hc), so a saved view or card shows only its own chart.
   seats: residents per House seat at each census since 1910: the national average as a line, every state's
   figure as a faint dot, the House's size beneath, and the 1929 act that fixed it at 435 marked.
   small: the smallest change that would have flipped each presidential election since 1976: one dot per
   election on a log scale (a bar's length would not be proportional to its value there), its votes and states
   labelled; a dot for an election the page has (2016, 2020, 2024) opens it with those states selected.
   weight: the weight of a vote in each presidential year since 1976, as two ratios in two panels: residents per
   senator (most populous state against least) and electoral votes per vote cast (highest state against lowest).
   bias: the tipping state's two-party margin minus the national two-party margin in each presidential election,
   a bar and a dot from a zero line, coloured by the party the tipping state leaned toward more than the nation, with
   the tipping state labelled (bias.js; arithmetic in build_history.py).
   The series start where the gathered data starts, and the head says so. */
import { INK, GRAPHITE, RULE } from './style.js';
import { PARTY, SIDE, pts, gapSentence, ratioText, sameAsNation } from '../bias.js';

const CHARTS = [['seats', 'Residents per seat'], ['small', 'Smallest change'], ['weight', 'Weight per vote'], ['bias', 'Tipping state vs nation']];

export function historyView({ ctx, head, body, foot, place, shiftOf }) {
  const { fmt } = ctx;
  let svg;
  const exporting = document.body.classList.contains('export');
  function build() {
    head.innerHTML = (exporting ? '' : '<div class="seg v2d-seg hist-switch" role="group" aria-label="Chart">' +
      CHARTS.map(([k, t]) => `<button data-hc="${k}">${t}</button>`).join('') + '</div>') +
      '<span class="v2d-ref hist-note"></span>' + (exporting ? '' : '<button class="lens-i" aria-label="About these series">i</button>');
    head.querySelectorAll('[data-hc]').forEach((b) => b.addEventListener('click', () => ctx.setHistoryChart(b.dataset.hc)));
    const i = head.querySelector('.lens-i');
    if (i) ctx.infoButton(i, () => {
      const H = ctx.history();
      return `Residents per seat: ${H.sources.perSeat}. ${H.cap.text} (${H.cap.source}). Smallest change: ${H.sources.smallest} Weight per vote: ${H.sources.weight} ${H.sources.starts} Tipping state against the nation: ${H.sources.bias} Click a state's dot to select it; click 2016, 2020 or 2024 to open that election with its states selected.`;
    });
    body.innerHTML = '';
    svg = d3.select(body).append('svg').attr('class', 'v2d-band hist-chart');
  }
  function draw() {
    const H = ctx.history();
    if (!H) { head.querySelector('.hist-note').textContent = 'Loading the history…'; return; }
    const k = ctx.historyChart();
    head.querySelectorAll('[data-hc]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.hc === k));
    const P = H.perSeat, L = H.smallest, W = H.weight, B = H.bias;
    head.querySelector('.hist-note').textContent = {
      seats: `Residents per House seat at each census, ${P[0].year} to ${P[P.length - 1].year}. The series starts at ${P[0].year}, where the gathered data starts.`,
      small: `The fewest votes that would have changed each presidential election, ${L[0].year} to ${L[L.length - 1].year}. The series starts at ${L[0].year}, where the gathered data starts.`,
      weight: `The weight of a vote in each presidential year, ${W[0].year} to ${W[W.length - 1].year}, using the census in force. The series starts at ${W[0].year}, where the gathered data starts.`,
      bias: `The tipping state's two-party margin against the nation's, ${B[0].year} to ${B[B.length - 1].year}. The series starts at ${B[0].year}, where the gathered data starts.`,
    }[k];
    foot.textContent = { seats: `Census Bureau apportionment data; ${H.cap.source.split(', http')[0]}.`,
      small: 'MIT Election Data and Science Lab, U.S. President 1976-2024; FEC certified totals for 2016-2024.',
      weight: 'Census Bureau apportionment data; MIT Election Data and Science Lab, U.S. President 1976-2024.',
      bias: 'MIT Election Data and Science Lab, U.S. President 1976-2024; FEC certified totals for 2016-2024; Census Bureau apportionment data.' }[k];
    const { w, h } = place();   // after the head and foot have their text, so the chart gets what is left
    svg.attr('width', w).attr('height', h).selectAll('*').remove();
    if (k === 'small') drawSmallest(H, w, h); else if (k === 'bias') drawBias(H, w, h); else if (k === 'weight') drawWeight(H, w, h); else drawSeats(H, w, h, ctx.selectedStates());
  }

  function drawSeats(H, w, hh, S) {
    const P = H.perSeat, pad = { l: 72, r: 24, t: 24, b: 44 };
    const x = d3.scaleLinear().domain([P[0].year - 4, P[P.length - 1].year + 4]).range([pad.l, w - pad.r]);
    const maxV = d3.max(P, (e) => e.states[e.hi].perSeat);
    const y = d3.scaleLinear().domain([0, maxV * 1.05]).range([hh - pad.b, pad.t]).nice();
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t >= 1e6 ? (t / 1e6) + 'M' : t ? (t / 1000) + 'k' : '0');
    }
    svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('Residents per House seat (apportionment population), at each census');
    // The 1929 act: between the 1920 and 1930 censuses.
    const capYear = +H.cap.signed.slice(0, 4);
    svg.append('line').attr('x1', x(capYear)).attr('x2', x(capYear)).attr('y1', pad.t + 6).attr('y2', hh - pad.b).attr('stroke', INK).attr('stroke-dasharray', '3 3');
    svg.append('text').attr('x', x(capYear) + 5).attr('y', pad.t + 18).attr('fill', INK).text(`${capYear}: House fixed at ${H.cap.seats}`);
    // Every state's figure, faint; the national average as the line.
    const dots = P.flatMap((e) => Object.entries(e.states).map(([st, s]) => ({ year: e.year, st, v: s.perSeat, seats: s.seats })));
    svg.append('g').selectAll('circle').data(dots).join('circle')
      .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.v)).attr('r', (d) => (S && S.has(d.st) ? 4 : 2.2))
      .attr('fill', (d) => (S && S.has(d.st) ? INK : GRAPHITE)).attr('opacity', (d) => (S ? (S.has(d.st) ? 0.95 : 0.18) : 0.35)).style('cursor', 'pointer')
      .on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b>, ${d.year} census<br>${fmt(d.v)} residents per seat; ${d.seats} seat${d.seats > 1 ? 's' : ''}<br><span style="color:${GRAPHITE}">Click to select the state</span>`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    svg.append('path').datum(P).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2.5)
      .attr('d', d3.line().x((e) => x(e.year)).y((e) => y(e.perSeat)));
    svg.append('g').selectAll('circle').data(P).join('circle').attr('cx', (e) => x(e.year)).attr('cy', (e) => y(e.perSeat)).attr('r', 4).attr('fill', INK)
      .on('mousemove', (ev, e) => ctx.hoverHtml(`<b>${e.year} census</b><br>${e.seats} seats; ${fmt(e.perSeat)} residents per seat on average<br>Fewest per seat: ${ctx.stateName(e.lo)}, ${fmt(e.states[e.lo].perSeat)}<br>Most per seat: ${ctx.stateName(e.hi)}, ${fmt(e.states[e.hi].perSeat)}${e.year === 1920 ? '<br>No reapportionment followed this census; the seats are those in force.' : ''}`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    const last = P[P.length - 1];
    svg.append('text').attr('x', x(last.year) - 6).attr('y', y(last.perSeat) - 10).attr('text-anchor', 'end').attr('fill', INK).attr('font-weight', 700).text(`${fmt(last.perSeat)} per seat`);
    svg.append('text').attr('x', x(P[0].year) + 6).attr('y', y(P[0].perSeat) - 10).attr('fill', INK).attr('font-weight', 700).text(`${fmt(P[0].perSeat)}`);
    // Census years, with the House size beneath each.
    for (const e of P) {
      svg.append('text').attr('x', x(e.year)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text(e.year);
      svg.append('text').attr('x', x(e.year)).attr('y', hh - pad.b + 31).attr('text-anchor', 'middle').attr('fill', INK).text(e.seats);
    }
    svg.append('text').attr('x', pad.l - 6).attr('y', hh - pad.b + 31).attr('text-anchor', 'end').text('seats');
  }

  function drawSmallest(H, w, hh) {
    const L = H.smallest, pad = { l: 72, r: 24, t: 30, b: 46 };
    const x = d3.scalePoint().domain(L.map((s) => s.year)).range([pad.l, w - pad.r]).padding(0.5);
    const y = d3.scaleLog().domain([100, 10 ** Math.ceil(Math.log10(d3.max(L, (s) => s.votes) * 1.5))]).range([hh - pad.b, pad.t + 24]);
    for (const t of y.ticks().filter((t) => Number.isInteger(Math.log10(t)))) {
      svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t >= 1e6 ? (t / 1e6) + 'M' : t >= 1000 ? (t / 1000) + 'k' : t);
    }
    svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('The smallest change: fewest votes that would have changed each presidential election (log scale)');
    const step = x.step();
    const g = svg.append('g').selectAll('g').data(L).join('g').style('cursor', (s) => (s.election ? 'pointer' : 'default'))
      .on('click', (ev, s) => { if (s.election) ctx.openElection(s.election, s.states); })
      .on('mousemove', (ev, s) => ctx.hoverHtml(`<b>${s.year}</b>: ${s.winner} over ${s.runner}<br>Smallest change ${fmt(s.votes)} votes in ${s.states.length} state${s.states.length > 1 ? 's' : ''}:<br>` +
        Object.entries(s.perState).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${ctx.stateName(st)} ${fmt(n)}`).join(', ') +
        (s.election ? `<br><span style="color:${GRAPHITE}">Click to open ${s.year} with these states selected</span>` : ''), ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    // A faint guide per election from the dot down to its year, so each dot reads against the axis without a bar.
    g.append('line').attr('x1', (s) => x(s.year)).attr('x2', (s) => x(s.year)).attr('y1', (s) => y(Math.max(100, s.votes)) + 8).attr('y2', hh - pad.b)
      .attr('stroke', RULE).attr('stroke-dasharray', '2 3');
    g.append('circle').attr('cx', (s) => x(s.year)).attr('cy', (s) => y(Math.max(100, s.votes))).attr('r', 7)
      .attr('fill', (s) => ctx.colour(s.winnerParty === 'D' ? 40 : -40, true)).attr('stroke', '#fff').attr('stroke-width', 1);
    // Each label must fit its column (measured, since cards draw text larger): the figure in full, else rounded
    // ("2.69M"); the states named, else counted, else just the count.
    const fits = (t) => t.getComputedTextLength() <= step - 6;
    const short = (n) => (n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : n >= 1e3 ? (n / 1e3).toPrecision(3) + 'k' : String(n));
    g.append('text').attr('x', (s) => x(s.year)).attr('y', (s) => y(Math.max(100, s.votes)) - 13).attr('text-anchor', 'middle').attr('fill', INK).attr('font-weight', 700)
      .text((s) => fmt(s.votes)).each(function (s) { if (!fits(this)) this.textContent = short(s.votes); });
    g.append('text').attr('x', (s) => x(s.year)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text((s) => s.year);
    g.append('text').attr('x', (s) => x(s.year)).attr('y', hh - pad.b + 32).attr('text-anchor', 'middle').attr('fill', INK)
      .text((s) => s.states.join(' ')).each(function (s) {
        for (const t of [`${s.states.length} states`, String(s.states.length)]) { if (fits(this)) break; this.textContent = t; }
      });
    svg.append('text').attr('x', pad.l - 6).attr('y', hh - pad.b + 32).attr('text-anchor', 'end').text('states');
    if (!exporting) svg.append('text').attr('x', w - pad.r).attr('y', pad.t + 6).attr('text-anchor', 'end').text('Dot colour: the winner\'s party. Click 2016, 2020 or 2024 to open it.');
  }

  // The tipping state against the nation: one bar and dot per election from the zero line (a linear scale, so a bar's
  // length is its value). Above zero the tipping state voted more Democratic than the nation, below more Republican.
  function drawBias(H, w, hh) {
    const B = H.bias, pad = { l: 72, r: 24, t: exporting ? 52 : 66, b: 46 };
    const x = d3.scalePoint().domain(B.map((b) => b.year)).range([pad.l, w - pad.r]).padding(0.5), step = x.step();
    const m = d3.max(B, (b) => Math.abs(b.gap)), lim = Math.max(1, Math.ceil(m * 1.45));
    const y = d3.scaleLinear().domain([-lim, lim]).range([hh - pad.b, pad.t]);
    const tickText = (t) => (t === 0 ? '0' : (t > 0 ? 'D+' : 'R+') + Math.abs(t));
    for (const t of y.ticks(Math.min(2 * lim, 8)).filter(Number.isInteger)) {
      svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(tickText(t));
    }
    svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('The tipping state\'s two-party margin minus the national two-party margin, in points');
    svg.append('text').attr('x', pad.l).attr('y', 30).attr('fill', INK).text('The standard "Electoral College bias". Above zero: more Democratic than the nation; below: more Republican.');
    if (!exporting) svg.append('text').attr('x', pad.l).attr('y', 46).attr('fill', GRAPHITE).text('Colour: that party. Click 2016, 2020 or 2024 to open it in Road to 270.');
    const g = svg.append('g').selectAll('g').data(B).join('g').style('cursor', 'pointer')
      .on('click', (ev, b) => (b.election ? ctx.openRoad(b.election) : ctx.select({ kind: 'states', states: [b.tip.st] }, { add: shiftOf(ev) })))
      .on('mousemove', (ev, b) => ctx.hoverHtml(`<b>${b.year}</b>: ${SIDE[b.winner]} won the Electoral College ${b.winner === 'D' ? b.evD : b.evR} to ${b.winner === 'D' ? b.evR : b.evD}<br>` +
        `National popular vote: ${SIDE[b.nat.votes > 0 ? 'D' : 'R']} by ${fmt(Math.abs(b.nat.votes))} votes, ${pts(b.nat.points)} points of the two-party vote<br>` +
        `Tipping state: ${ctx.stateName(b.tip.st)} (${b.tip.ev} electoral votes), ${PARTY[b.tip.votes > 0 ? 'D' : 'R']} by ${fmt(Math.abs(b.tip.votes))} votes, ${pts(b.tip.points)} points<br>` +
        `${gapSentence(b)}<br>The national vote margin was ${ratioText(b.ratio)} times the tipping state's vote margin<br>` +
        `<span style="color:${GRAPHITE}">${b.source === 'FEC' ? 'FEC certified totals' : 'MIT state totals'}. Click to ${b.election ? `open ${b.year} in Road to 270` : 'select the state'}</span>`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    const col = (b) => ctx.colour(b.gap > 0 ? 40 : -40, true);
    g.append('rect').attr('x', (b) => x(b.year) - Math.min(18, step * 0.28)).attr('width', Math.min(36, step * 0.56)).attr('y', (b) => Math.min(y(0), y(b.gap))).attr('height', (b) => Math.max(1, Math.abs(y(b.gap) - y(0))))
      .attr('fill', col).attr('fill-opacity', 0.55);
    g.append('circle').attr('cx', (b) => x(b.year)).attr('cy', (b) => y(b.gap)).attr('r', 6).attr('fill', col).attr('stroke', '#fff').attr('stroke-width', 1);
    svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', INK).attr('stroke-width', 1.6).style('pointer-events', 'none');
    // Beyond each mark: the tipping state and the gap in points (state alone where the column is narrow).
    const fits = (t) => t.getComputedTextLength() <= step - 4;
    g.append('text').attr('x', (b) => x(b.year)).attr('y', (b) => (b.gap > 0 ? y(b.gap) - 12 : y(b.gap) + 20)).attr('text-anchor', 'middle').attr('fill', INK).attr('font-weight', 700)
      .text((b) => `${b.tip.st} ${pts(b.gap)}`).each(function (b) { if (!fits(this)) this.textContent = b.tip.st; });
    g.append('text').attr('x', (b) => x(b.year)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text((b) => b.year);
    g.append('text').attr('x', (b) => x(b.year)).attr('y', hh - pad.b + 32).attr('text-anchor', 'middle').attr('fill', GRAPHITE).text((b) => (b.election ? 'open' : ''));
  }

  function drawWeight(H, w, hh) {
    const W = H.weight, pad = { l: 72, r: 24, t: 24, b: 30 }, gap = 34;
    const x = d3.scalePoint().domain(W.map((d) => d.year)).range([pad.l, w - pad.r]).padding(0.5);
    const step = x.step(), ph = (hh - pad.t - pad.b - gap) / 2;
    const panels = [
      { key: 'senate', top: pad.t, title: 'Residents per senator: the most populous state against the least (ratio)',
        v: (d) => d.senate.ratio, lab: (d) => `${d.senate.big}/${d.senate.small}`,
        tip: (d) => `<b>${d.year}</b> (census ${d.census})<br>${ctx.stateName(d.senate.big)} ${fmt(d.senate.bigPop)} residents, ${ctx.stateName(d.senate.small)} ${fmt(d.senate.smallPop)}: two senators each<br>One senator from ${ctx.stateName(d.senate.big)} represents ${d.senate.ratio.toFixed(1)}× as many people`,
        states: (d) => [d.senate.big, d.senate.small] },
      { key: 'ev', top: pad.t + ph + gap, title: 'Electoral votes per vote cast: the highest state against the lowest (ratio)',
        v: (d) => d.ev.ratio, lab: (d) => `${d.ev.hi}/${d.ev.lo}`,
        tip: (d) => `<b>${d.year}</b> (census ${d.census})<br>${ctx.stateName(d.ev.hi)}: ${d.ev.hiEv} electoral votes, ${fmt(d.ev.hiVotes)} votes cast<br>${ctx.stateName(d.ev.lo)}: ${d.ev.loEv} electoral votes, ${fmt(d.ev.loVotes)} votes cast<br>A vote in ${ctx.stateName(d.ev.hi)} carried ${d.ev.ratio.toFixed(2)}× the electoral weight of one in ${ctx.stateName(d.ev.lo)}`,
        states: (d) => [d.ev.hi, d.ev.lo] },
    ];
    for (const p of panels) {
      const bottom = p.top + ph;
      const y = d3.scaleLinear().domain([0, d3.max(W, p.v) * 1.18]).range([bottom, p.top + 26]).nice();
      for (const t of y.ticks(4)) {
        svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
        svg.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t ? t + '×' : '0');
      }
      svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', p.top + 4).text(p.title);
      svg.append('path').datum(W).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2.5).attr('d', d3.line().x((d) => x(d.year)).y((d) => y(p.v(d))));
      const g = svg.append('g').selectAll('g').data(W).join('g').style('cursor', 'pointer')
        .on('click', (ev, d) => (d.election ? ctx.openElection(d.election, p.states(d)) : ctx.select({ kind: 'states', states: p.states(d) }, { add: shiftOf(ev) })))
        .on('mousemove', (ev, d) => ctx.hoverHtml(p.tip(d) + `<br><span style="color:${GRAPHITE}">Click to select ${d.election ? `them in ${d.year}` : 'these states'}</span>`, ev.clientX, ev.clientY))
        .on('mouseleave', () => ctx.hover(null));
      g.append('circle').attr('cx', (d) => x(d.year)).attr('cy', (d) => y(p.v(d))).attr('r', 4.5).attr('fill', INK);
      g.append('text').attr('x', (d) => x(d.year)).attr('y', (d) => y(p.v(d)) - 10).attr('text-anchor', 'middle').attr('fill', INK).attr('font-weight', 700)
        .text((d) => p.v(d).toFixed(p.key === 'senate' ? 0 : 1) + '×');
      // The two states, under each point, when there is room; the hover always names them.
      if (step >= 44) g.append('text').attr('x', (d) => x(d.year)).attr('y', (d) => y(p.v(d)) + 18).attr('text-anchor', 'middle').text(p.lab);
    }
    for (const d of W) svg.append('text').attr('x', x(d.year)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text(d.year);
  }
  return { build, draw };
}
