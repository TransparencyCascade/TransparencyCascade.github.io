/* History (any office): the long view, from history.json (build_history.py). Two charts, one above the other.
   Residents per House seat at each census since 1910: the national average as a line, every state's figure as a
   faint dot, the House's size beneath, and the 1929 act that fixed it at 435 marked. The smallest change that
   would have flipped each presidential election since 1976: one bar per election on a log scale, its votes and
   states labelled; a bar for an election the page has (2016, 2020, 2024) opens it with those states selected,
   as the balance box's line does. The series start where the gathered data starts, and the head says so. */
import { INK, GRAPHITE, RULE } from './style.js';

export function historyView({ ctx, head, body, foot, place, shiftOf }) {
  const { fmt } = ctx;
  let svgA, svgB;
  const exporting = document.body.classList.contains('export');
  function build() {
    head.innerHTML = '<span class="v2d-ref hist-note"></span><button class="lens-i" aria-label="About these series">i</button>';
    ctx.infoButton(head.querySelector('.lens-i'), () => {
      const H = ctx.history();
      return `Residents per seat: ${H.sources.perSeat}. ${H.cap.text} (${H.cap.source}). Smallest change: ${H.sources.smallest} ${H.sources.starts} Click a state's dot to select it; click a bar for 2016, 2020 or 2024 to open that election with those states selected.`;
    });
    body.innerHTML = '';
    svgA = d3.select(body).append('svg').attr('class', 'v2d-band hist-seats');
    svgB = d3.select(body).append('svg').attr('class', 'v2d-band hist-small');
  }
  function draw() {
    const H = ctx.history();
    if (!H) { head.querySelector('.hist-note').textContent = 'Loading the history…'; return; }
    head.querySelector('.hist-note').textContent = `Residents per House seat at each census, ${H.perSeat[0].year} to ${H.perSeat[H.perSeat.length - 1].year}; the smallest change in each presidential election, ${H.smallest[0].year} to ${H.smallest[H.smallest.length - 1].year}. ${H.sources.starts}`;
    foot.textContent = `Census Bureau apportionment data; ${H.cap.source.split(', http')[0]}; MIT Election Data and Science Lab, U.S. President 1976-2024.`;
    const { w, h } = place();   // after the head and foot have their text, so the charts get what is left
    const S = ctx.selectedStates();
    const hA = Math.max(180, Math.floor(h * 0.56) - 6), hB = Math.max(150, h - hA - 14);
    drawSeats(H, w, hA, S);
    drawSmallest(H, w, hB);
  }

  function drawSeats(H, w, hh, S) {
    const P = H.perSeat, pad = { l: 72, r: 24, t: 24, b: 44 };
    svgA.attr('width', w).attr('height', hh).selectAll('*').remove();
    const x = d3.scaleLinear().domain([P[0].year - 4, P[P.length - 1].year + 4]).range([pad.l, w - pad.r]);
    const maxV = d3.max(P, (e) => e.states[e.hi].perSeat);
    const y = d3.scaleLinear().domain([0, maxV * 1.05]).range([hh - pad.b, pad.t]).nice();
    for (const t of y.ticks(5)) {
      svgA.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svgA.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t >= 1e6 ? (t / 1e6) + 'M' : t ? (t / 1000) + 'k' : '0');
    }
    svgA.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('Residents per House seat (apportionment population), at each census');
    // The 1929 act: between the 1920 and 1930 censuses.
    const capYear = +H.cap.signed.slice(0, 4);
    svgA.append('line').attr('x1', x(capYear)).attr('x2', x(capYear)).attr('y1', pad.t + 6).attr('y2', hh - pad.b).attr('stroke', INK).attr('stroke-dasharray', '3 3');
    svgA.append('text').attr('x', x(capYear) + 5).attr('y', pad.t + 18).attr('fill', INK).text(`${capYear}: House fixed at ${H.cap.seats}`);
    // Every state's figure, faint; the national average as the line.
    const dots = P.flatMap((e) => Object.entries(e.states).map(([st, s]) => ({ year: e.year, st, v: s.perSeat, seats: s.seats })));
    svgA.append('g').selectAll('circle').data(dots).join('circle')
      .attr('cx', (d) => x(d.year)).attr('cy', (d) => y(d.v)).attr('r', (d) => (S && S.has(d.st) ? 4 : 2.2))
      .attr('fill', (d) => (S && S.has(d.st) ? INK : GRAPHITE)).attr('opacity', (d) => (S ? (S.has(d.st) ? 0.95 : 0.18) : 0.35)).style('cursor', 'pointer')
      .on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(`<b>${ctx.stateName(d.st)}</b>, ${d.year} census<br>${fmt(d.v)} residents per seat; ${d.seats} seat${d.seats > 1 ? 's' : ''}<br><span style="color:${GRAPHITE}">Click to select the state</span>`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    svgA.append('path').datum(P).attr('fill', 'none').attr('stroke', INK).attr('stroke-width', 2.5)
      .attr('d', d3.line().x((e) => x(e.year)).y((e) => y(e.perSeat)));
    svgA.append('g').selectAll('circle').data(P).join('circle').attr('cx', (e) => x(e.year)).attr('cy', (e) => y(e.perSeat)).attr('r', 4).attr('fill', INK)
      .on('mousemove', (ev, e) => ctx.hoverHtml(`<b>${e.year} census</b><br>${e.seats} seats; ${fmt(e.perSeat)} residents per seat on average<br>Fewest per seat: ${ctx.stateName(e.lo)}, ${fmt(e.states[e.lo].perSeat)}<br>Most per seat: ${ctx.stateName(e.hi)}, ${fmt(e.states[e.hi].perSeat)}${e.year === 1920 ? '<br>No reapportionment followed this census; the seats are those in force.' : ''}`, ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    const last = P[P.length - 1];
    svgA.append('text').attr('x', x(last.year) - 6).attr('y', y(last.perSeat) - 10).attr('text-anchor', 'end').attr('fill', INK).attr('font-weight', 700).text(`${fmt(last.perSeat)} per seat`);
    svgA.append('text').attr('x', x(P[0].year) + 6).attr('y', y(P[0].perSeat) - 10).attr('fill', INK).attr('font-weight', 700).text(`${fmt(P[0].perSeat)}`);
    // Census years, with the House size beneath each.
    for (const e of P) {
      svgA.append('text').attr('x', x(e.year)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text(e.year);
      svgA.append('text').attr('x', x(e.year)).attr('y', hh - pad.b + 31).attr('text-anchor', 'middle').attr('fill', INK).text(e.seats);
    }
    svgA.append('text').attr('x', pad.l - 6).attr('y', hh - pad.b + 31).attr('text-anchor', 'end').text('seats');
  }

  function drawSmallest(H, w, hh) {
    const L = H.smallest, pad = { l: 72, r: 24, t: 30, b: 50 };
    svgB.attr('width', w).attr('height', hh).selectAll('*').remove();
    const x = d3.scaleBand().domain(L.map((s) => s.year)).range([pad.l, w - pad.r]).padding(0.28);
    const y = d3.scaleLog().domain([100, 10 ** Math.ceil(Math.log10(d3.max(L, (s) => s.votes) * 1.5))]).range([hh - pad.b, pad.t]);
    for (const t of y.ticks().filter((t) => Number.isInteger(Math.log10(t)))) {
      svgB.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svgB.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t >= 1e6 ? (t / 1e6) + 'M' : t >= 1000 ? (t / 1000) + 'k' : t);
    }
    svgB.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('The smallest change: fewest votes that would have changed each presidential election (log scale)');
    const g = svgB.append('g').selectAll('g').data(L).join('g').style('cursor', (s) => (s.election ? 'pointer' : 'default'))
      .on('click', (ev, s) => { if (s.election) ctx.openElection(s.election, s.states); })
      .on('mousemove', (ev, s) => ctx.hoverHtml(`<b>${s.year}</b>: ${s.winner} over ${s.runner}<br>Smallest change ${fmt(s.votes)} votes in ${s.states.length} state${s.states.length > 1 ? 's' : ''}:<br>` +
        Object.entries(s.perState).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${ctx.stateName(st)} ${fmt(n)}`).join(', ') +
        (s.election ? `<br><span style="color:${GRAPHITE}">Click to open ${s.year} with these states selected</span>` : ''), ev.clientX, ev.clientY))
      .on('mouseleave', () => ctx.hover(null));
    g.append('rect').attr('x', (s) => x(s.year)).attr('width', x.bandwidth()).attr('y', (s) => y(Math.max(100, s.votes))).attr('height', (s) => hh - pad.b - y(Math.max(100, s.votes)))
      .attr('fill', (s) => ctx.colour(s.winnerParty === 'D' ? 40 : -40, true)).attr('opacity', (s) => (s.election ? 0.9 : 0.65));
    g.append('text').attr('x', (s) => x(s.year) + x.bandwidth() / 2).attr('y', (s) => y(Math.max(100, s.votes)) - 5).attr('text-anchor', 'middle').attr('fill', INK).text((s) => fmt(s.votes));
    g.append('text').attr('x', (s) => x(s.year) + x.bandwidth() / 2).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text((s) => s.year);
    g.append('text').attr('x', (s) => x(s.year) + x.bandwidth() / 2).attr('y', hh - pad.b + 31).attr('text-anchor', 'middle').attr('fill', INK)
      .text((s) => { const names = s.states.join(' '); return names.length * 7 <= x.bandwidth() + 8 ? names : x.bandwidth() >= 64 ? `${s.states.length} states` : String(s.states.length); });
    svgB.append('text').attr('x', pad.l - 6).attr('y', hh - pad.b + 31).attr('text-anchor', 'end').text('states');
    if (!exporting) svgB.append('text').attr('x', w - pad.r).attr('y', hh - 4).attr('text-anchor', 'end').text('Bar colour: the winner\'s party. Click 2016, 2020 or 2024 to open it.');
  }
  return { build, draw };
}
