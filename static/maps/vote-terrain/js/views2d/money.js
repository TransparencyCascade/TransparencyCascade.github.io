/* Money (any office, flat): money.json from tools/vote-terrain/build_money.py, arithmetic in ../money.js. One chart at a time (state.mc):
   time    dollars per decisive vote, one dot per Senate race 2008-2026 on a log scale, a median per cycle; beside it, a bar per cycle of the
           outside money no race can be named for (super PACs and hybrid PACs: disbursements less Schedule E), with the Schedule E part above it.
           md: the decisive votes (flip: votes to flip; moved: votes moved since the previous race for the seat); mm: the money counted
           (cand: candidates; party: plus party coordinated expenditures; out: plus the independent expenditures that name the race's candidates).
   lost    outspent and lost: each race's Democratic-side share of the two candidates' spending (mm) against the Democratic share of the two-party vote;
           the two quadrants where the bigger spender lost are marked and a click on their label selects those states. my: one cycle, or all.
   donors  where it came from: the top 10 and top 100 individual donors' shares of super PAC receipts per cycle, and the donors of $1 million or more for
           one cycle (my; 2026 by default) with the filings behind each figure; for 2026, America PAC's totals as filed.
   Spending and votes are drawn side by side and the page does not say one produced the other. Money that is not reported to the FEC as spending naming a
   candidate (501(c)(4) groups and other organizations that do not disclose) is described as unreported and never estimated. */
import { INK, GRAPHITE, RULE } from './style.js';
import * as M from '../money.js';

const CHARTS = [['time', 'Dollars per decisive vote'], ['lost', 'Outspent and lost'], ['donors', 'Where it came from']];
const hash = (s) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 9973; return h / 9973; };
const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const UNREPORTED = 'Unreported money (501(c)(4) groups and other organizations that do not disclose their spending or donors) is not in these figures and is not estimated.';

export function moneyView({ ctx, head, body, foot, place, shiftOf }) {
  const exporting = document.body.classList.contains('export');
  let svg, side;
  const sw = (k, cur, items, label) => `<div class="seg v2d-seg mn-sw" role="group" aria-label="${label}">${items.map(([v, t]) => `<button data-${k}="${v}">${t}</button>`).join('')}</div>`;
  function build() {
    const cyc = [['all', 'All'], ...M.CYCLES.map((y) => [y, y])];
    head.innerHTML = (exporting ? '' : sw('mc', null, CHARTS, 'Chart') + sw('md', null, [['flip', 'Votes to flip'], ['moved', 'Votes moved']], 'Decisive votes') +
      sw('mm', null, [['cand', 'Candidates'], ['party', '+ parties'], ['out', '+ outside, by race']], 'Money counted') + `<div class="seg v2d-seg mn-sw mn-cyc" role="group" aria-label="Cycle">${cyc.map(([v, t]) => `<button data-my="${v}">${t}</button>`).join('')}</div>`) +
      '<span class="v2d-ref mn-note"></span>';
    for (const k of ['mc', 'md', 'mm', 'my']) head.querySelectorAll(`[data-${k}]`).forEach((b) => b.addEventListener('click', () => ctx.setMoney({ [k]: b.dataset[k] })));
    body.innerHTML = '<div class="mn-wrap"><svg class="v2d-band mn-chart"></svg><div class="mn-side"></div></div>';
    svg = d3.select(body).select('svg'); side = body.querySelector('.mn-side');
  }

  function draw() {
    const D = ctx.money();
    if (!D) { head.querySelector('.mn-note').textContent = 'Loading the money…'; return; }
    const S = ctx.moneyState(), k = S.mc;
    head.querySelectorAll('[data-mc]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.mc === k));
    head.querySelectorAll('[data-md]').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.md === S.md); b.disabled = k !== 'time'; });
    head.querySelectorAll('[data-mm]').forEach((b) => { b.setAttribute('aria-pressed', b.dataset.mm === S.mm); b.disabled = k === 'donors'; });
    head.querySelectorAll('[data-my]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.my === String(S.my)));
    const cycSw = head.querySelector('.mn-cyc'); if (cycSw) cycSw.hidden = k === 'time';
    head.querySelectorAll('[data-my="all"]').forEach((b) => { b.hidden = k === 'donors'; });
    side.hidden = k !== 'donors'; side.innerHTML = '';
    const cov = D.coverage['2026'];
    head.querySelector('.mn-note').textContent = {
      time: `One dot per Senate race, dollars counted: ${M.COUNTS[S.mm]}, over ${M.DEFS[S.md]} (log scale). Median per cycle as a bar across the dots; in 2024 the median race is ${M.usd(M.medianOf(D, 2024, S.mm, 'flip'))} per vote to flip and ${M.usd(M.medianOf(D, 2024, S.mm, 'moved'))} per vote moved. 2026 is partial and unofficial: filings through ${cov.committeeSummariesThrough}, candidate summaries through ${cov.candidateSummariesThrough}.`,
      lost: `${S.my === 'all' ? 'Every Senate race with both sides named, 2008 to 2026' : `Senate ${S.my}`}: the Democratic side's share of the two candidates' spending (${M.COUNTS[S.mm]}) against its share of the two-party vote. Spending and votes side by side; neither is shown as the cause of the other.`,
      donors: `Itemized individual gifts to super PACs, ${S.my === 'all' ? 2026 : S.my}${S.my === 2026 || S.my === 'all' ? `: partial, committee summaries through ${cov.committeeSummariesThrough}, itemized lines through ${cov.itemizedLinesThrough}` : ''}. Donors are named only at $1 million or more.`,
    }[k];
    foot.textContent = `FEC bulk files (candidate summaries, committee summaries, Schedule E, itemized individual contributions), retrieved ${D.sources.webk24.retrieved}; votes: certified results (MIT Election Data and Science Lab; simulator.json), 2026 unofficial (AP via CNN). ${UNREPORTED}`;
    const { w, h: h0 } = place(), h = Math.max(h0, 300);
    svg.attr('width', w).attr('height', h).selectAll('*').remove();
    const wrap = body.querySelector('.mn-wrap');
    if (k === 'donors') { const sw2 = Math.min(Math.max(w * 0.42, 340), 560); svg.attr('width', sw2); side.style.width = (w - sw2 - 16) + 'px'; drawDonors(D, S, sw2, h); }
    else if (k === 'lost') drawLost(D, S, w, h); else drawTime(D, S, w, h);
    wrap.dataset.chart = k;
  }

  // ---------- dollars per decisive vote ----------
  const note = (g, x, y, lines) => lines.forEach((t, i) => g.append('text').attr('x', x).attr('y', y + i * 13).attr('fill', GRAPHITE).text(t));
  function drawTime(D, S, w, hh0) {
    const cycles = D.cycles, narrow = w < 720, gap = narrow ? 26 : 28;
    const wl = narrow ? w : Math.round((w - gap) * 0.62), wr = narrow ? w : w - gap - wl;
    const h1 = narrow ? Math.max(320, Math.round(hh0 * 0.62)) : hh0, h2 = narrow ? Math.max(280, Math.round(hh0 * 0.5)) : hh0;
    svg.attr('height', narrow ? h1 + gap + h2 : hh0);
    const gd = svg.append('g'), gb = svg.append('g').attr('transform', narrow ? `translate(0,${h1 + gap})` : `translate(${wl + gap},0)`);
    const pad = { l: 64, r: 16, t: 28, b: 54 };
    const rows = M.races(D, null, S.mm, S.md).map((r) => ({ r, v: M.perVote(r, S.mm, S.md), cycle: r.cycle }));
    const x = d3.scalePoint().domain(cycles).range([pad.l, wl - pad.r]).padding(0.5), step = x.step();
    const lo = d3.min(rows, (d) => d.v), hi = d3.max(rows, (d) => d.v);
    const y = d3.scaleLog().domain([10 ** Math.floor(Math.log10(lo)), 10 ** Math.ceil(Math.log10(hi))]).range([h1 - pad.b, pad.t + 8]);
    gd.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text(`Dollars per decisive vote (${M.DEFS[S.md]}), log scale`);
    for (const t of y.ticks().filter((t) => Number.isInteger(Math.log10(t)))) {
      gd.append('line').attr('x1', pad.l).attr('x2', wl - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      gd.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text('$' + (t >= 1e6 ? t / 1e6 + 'M' : t >= 1000 ? t / 1000 + 'k' : t));
    }
    const g = gd.append('g').attr('class', 'mn-dots');
    g.selectAll('circle').data(rows).join('circle').attr('class', 'mn-dot')
      .attr('cx', (d) => x(d.cycle) + (hash(d.r.st + d.cycle) - 0.5) * step * 0.7).attr('cy', (d) => y(d.v)).attr('r', 4.2)
      .attr('fill', (d) => ctx.colour(d.r.votes.D > d.r.votes.R ? 40 : -40, true)).attr('fill-opacity', 0.78).attr('stroke', (d) => (M.unofficial(d.r) ? INK : '#fff')).attr('stroke-width', (d) => (M.unofficial(d.r) ? 1.1 : 0.7)).style('cursor', 'pointer')
      .on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.r.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(raceTip(D, d.r, S), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    const sel = ctx.selectedStates();
    if (sel) g.selectAll('circle').attr('opacity', (d) => (sel.has(d.r.st) ? 1 : 0.25));
    for (const c of cycles) {
      const m = M.median(rows.filter((d) => d.cycle === c).map((d) => d.v));
      gd.append('text').attr('x', x(c)).attr('y', h1 - pad.b + 16).attr('text-anchor', 'middle').text(c === 2026 ? '2026*' : c);
      if (m == null) continue;
      gd.append('line').attr('class', 'mn-median').attr('x1', x(c) - step * 0.4).attr('x2', x(c) + step * 0.4).attr('y1', y(m)).attr('y2', y(m)).attr('stroke', INK).attr('stroke-width', 2.6).style('pointer-events', 'none');
      gd.append('text').attr('class', 'halo').attr('x', x(c) + step * 0.42).attr('y', y(m) + 4).attr('fill', INK).attr('font-weight', 700).attr('font-size', 10.5).text(M.usdWords(m).replace(' million', 'M')).style('pointer-events', 'none');
    }
    note(gd, pad.l, h1 - 22, ['Bar and figure: the cycle\'s median. Colour: the winner\'s party.', '* 2026 is partial and unofficial (dots outlined).']);
    // The outside money no race can be named for, beside it (below it on a phone).
    const op = { l: 46, r: 8, t: 28, b: 54 };
    const rowsC = cycles.map((c) => ({ c, v: M.committees(D, c) })).filter((d) => d.v);
    const bx = d3.scaleBand().domain(cycles).range([op.l, wr - op.r]).padding(0.22);
    const by = d3.scaleLinear().domain([0, d3.max(rowsC, (d) => d.v.notAllocated + Math.max(0, d.v.allocated)) * 1.12]).range([h2 - op.b, op.t + 8]).nice();
    gb.append('text').attr('class', 'axis-title').attr('x', 4).attr('y', 13).text('Super and hybrid PAC spending, by cycle');
    for (const t of by.ticks(5)) {
      gb.append('line').attr('x1', op.l).attr('x2', wr - op.r).attr('y1', by(t)).attr('y2', by(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      gb.append('text').attr('x', op.l - 5).attr('y', by(t) + 4).attr('text-anchor', 'end').text(t ? '$' + t / 1e9 + 'B' : '0');
    }
    const bars = gb.append('g').attr('class', 'mn-bars').selectAll('g').data(rowsC).join('g')
      .on('mousemove', (ev, d) => ctx.hoverHtml(unallocTip(D, d.c, d.v), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    bars.append('rect').attr('class', 'mn-notalloc').attr('x', (d) => bx(d.c)).attr('width', bx.bandwidth()).attr('y', (d) => by(Math.max(0, d.v.notAllocated))).attr('height', (d) => Math.max(0, by(0) - by(Math.max(0, d.v.notAllocated)))).attr('fill', INK);
    bars.append('rect').attr('class', 'mn-alloc').attr('x', (d) => bx(d.c)).attr('width', bx.bandwidth()).attr('y', (d) => by(Math.max(0, d.v.notAllocated) + d.v.allocated)).attr('height', (d) => Math.max(0, by(Math.max(0, d.v.notAllocated)) - by(Math.max(0, d.v.notAllocated) + d.v.allocated)))
      .attr('fill', 'rgba(35,48,107,.25)').attr('stroke', INK).attr('stroke-width', 0.8);
    bars.append('text').attr('x', (d) => bx(d.c) + bx.bandwidth() / 2).attr('y', h2 - op.b + 16).attr('text-anchor', 'middle').text((d) => (d.c === 2026 ? '26*' : String(d.c).slice(2)));
    bars.append('text').attr('x', (d) => bx(d.c) + bx.bandwidth() / 2).attr('y', (d) => by(Math.max(0, d.v.notAllocated) + d.v.allocated) - 4).attr('text-anchor', 'middle').attr('fill', INK).attr('font-size', 9.5).attr('font-weight', 700)
      .text((d) => (d.v.notAllocated > 5e7 ? (d.v.notAllocated / 1e9).toFixed(2) : ''));
    note(gb, op.l, h2 - 22, ['Dark: no race named. Pale: Schedule E.', 'Label: the dark part, $B. * partial.']);
  }
  const raceTip = (D, r, S) => {
    const f = M.figures(r), cov = D.coverage[r.cycle];
    const per = (c, d) => { const v = M.perVote(r, c, d); return v == null ? 'n/a' : M.usd(v); };
    return `<b>Senate ${r.cycle}, ${ctx.stateName(r.st)}</b>${r.special ? ' (special)' : ''}: ${esc(r.votes.dName)} (D) ${ctx.fmt(r.votes.D)}, ${esc(r.votes.rName)} (R) ${ctx.fmt(r.votes.R)}${M.unofficial(r) ? ' (unofficial)' : ''}<br>` +
      `Candidates, spent: ${M.usd(f.spent)}<br>Party coordinated expenditures, outside: ${M.usd(f.coord)}<br>Independent expenditures naming the candidates, outside: ${M.usd(f.ie)}<br>` +
      `Votes to flip ${ctx.fmt(r.decisive.flip)}; votes moved ${r.decisive.moved != null ? ctx.fmt(r.decisive.moved) : 'n/a (no earlier race for the seat)'}<br>` +
      `Per vote to flip: ${per('cand', 'flip')} candidates, ${per('out', 'flip')} with outside. Per vote moved: ${per('cand', 'moved')}, ${per('out', 'moved')}<br>` +
      `<span style="color:${GRAPHITE}">FEC candidate summaries through ${cov.candidateSummariesThrough}; Schedule E through ${cov.scheduleEFileThrough}. Click to select the state</span>`;
  };
  const unallocTip = (D, c, v) => {
    const sp = v.superPac, hy = v.hybrid, cov = D.coverage[c];
    return `<b>${c} cycle${c === 2026 ? ' (partial)' : ''}: super PACs and hybrid PACs</b><br>Disbursements (spent): ${M.usdWords(v.disbursed)}<br>Named for a race, Schedule E (outside): ${M.usdWords(v.allocated)}<br>` +
      `No race named (disbursements less Schedule E): ${M.usdWords(v.notAllocated)}<br>Super PACs: ${M.usdWords(sp.notAllocatedToARaceUsd)}; hybrid PACs: ${M.usdWords(hy.notAllocatedToARaceUsd)}<br>` +
      `<span style="color:${GRAPHITE}">FEC committee summaries through ${cov.committeeSummariesThrough}. Includes transfers to other committees and operating costs, and money for races the page does not draw.</span>`;
  };

  // ---------- outspent and lost ----------
  function drawLost(D, S, w, hh) {
    const cycle = S.my === 'all' ? null : +S.my, rows = M.lostRows(D, cycle, S.mm);
    const pad = { l: 64, r: 20, t: 34, b: 46 };
    const x = d3.scaleLinear().domain([0, 100]).range([pad.l, w - pad.r]), y = d3.scaleLinear().domain([0, 100]).range([hh - pad.b, pad.t]);
    svg.append('text').attr('class', 'axis-title').attr('x', pad.l).attr('y', 13).text('Democratic side\'s share of the two candidates\' spending, against its share of the two-party vote');
    for (const t of [0, 25, 50, 75, 100]) {
      svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', t === 50 ? INK : RULE).attr('stroke-width', t === 50 ? 1.4 : 0.5);
      svg.append('line').attr('x1', x(t)).attr('x2', x(t)).attr('y1', pad.t).attr('y2', hh - pad.b).attr('stroke', t === 50 ? INK : RULE).attr('stroke-width', t === 50 ? 1.4 : 0.5);
      svg.append('text').attr('x', pad.l - 6).attr('y', y(t) + 4).attr('text-anchor', 'end').text(t + '%');
      svg.append('text').attr('x', x(t)).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').text(t + '%');
    }
    svg.append('text').attr('x', (pad.l + w - pad.r) / 2).attr('y', hh - 8).attr('text-anchor', 'middle').attr('fill', INK).text('Democratic share of the two-party vote');
    svg.append('text').attr('transform', `translate(16,${(pad.t + hh - pad.b) / 2}) rotate(-90)`).attr('text-anchor', 'middle').attr('fill', INK).text('Democratic share of spending');
    // The two quadrants where the bigger spender lost: shaded, labelled with their counts, and a click selects their states.
    const lostD = rows.filter((d) => d.bigger === 'D' && d.lost), lostR = rows.filter((d) => d.bigger === 'R' && d.lost);
    const quad = (x0, x1, y0, y1, lines, set, atBottom) => {
      const pick = (ev) => ctx.select({ kind: 'states', states: [...new Set(set.map((d) => d.st))] }, { add: shiftOf(ev) });
      svg.append('rect').attr('class', 'mn-quadbg').attr('x', x(x0)).attr('width', x(x1) - x(x0)).attr('y', y(y1)).attr('height', y(y0) - y(y1)).attr('fill', 'rgba(35,48,107,.07)').style('cursor', 'pointer').on('click', pick);
      const tx = atBottom ? x(x1) - 8 : x(x0) + 8, ty = atBottom ? y(y0) - 8 - (lines.length - 1) * 15 : y(y1) + 18;
      const t = svg.append('text').attr('class', 'quad mn-quad').attr('x', tx).attr('y', ty).attr('text-anchor', atBottom ? 'end' : 'start').style('cursor', 'pointer').on('click', pick);
      lines.forEach((l, i) => t.append('tspan').attr('x', tx).attr('dy', i ? 15 : 0).text(l));
    };
    quad(0, 50, 50, 100, [`Democratic side outspent, lost: ${lostD.length}`, '(click to select these states)'], lostD);
    quad(50, 100, 0, 50, [`Republican side outspent, lost: ${lostR.length}`, '(click to select these states)'], lostR, true);
    const sel = ctx.selectedStates();
    svg.append('g').attr('class', 'mn-lost').selectAll('circle').data(rows).join('circle').attr('class', 'mn-dot')
      .attr('cx', (d) => x(d.vd * 100)).attr('cy', (d) => y(d.sd * 100)).attr('r', 4.6)
      .attr('fill', (d) => ctx.colour(d.winner === 'D' ? 40 : -40, true)).attr('fill-opacity', 0.8).attr('stroke', (d) => (d.lost ? INK : '#fff')).attr('stroke-width', (d) => (d.lost ? 1.4 : 0.6))
      .attr('opacity', (d) => (sel ? (sel.has(d.st) ? 1 : 0.25) : 1)).style('cursor', 'pointer')
      .on('click', (ev, d) => ctx.select({ kind: 'states', states: [d.st] }, { add: shiftOf(ev) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(lostTip(D, d, S), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    svg.append('text').attr('x', w - pad.r).attr('y', pad.t - 8).attr('text-anchor', 'end').attr('fill', GRAPHITE).text(`${rows.length} races; the bigger spender lost in ${lostD.length + lostR.length}. Colour: the winner's party; outlined dots: bigger spender lost.`);
  }
  const lostTip = (D, d, S) => {
    const r = d.r, cov = D.coverage[r.cycle];
    return `<b>Senate ${r.cycle}, ${ctx.stateName(r.st)}</b>: ${esc(r.votes.dName)} (D) ${(d.vd * 100).toFixed(1)}% of the two-party vote, ${esc(r.votes.rName)} (R) ${(100 - d.vd * 100).toFixed(1)}%<br>` +
      `Spending (${M.COUNTS[S.mm]}): D side ${M.usd(d.dUsd)}, R side ${M.usd(d.rUsd)}; D share ${(d.sd * 100).toFixed(1)}%<br>${d.lost ? `The ${d.bigger === 'D' ? 'Democratic' : 'Republican'} side spent more and lost` : 'The bigger spender won'}<br>` +
      `<span style="color:${GRAPHITE}">Candidate spending is the two named candidates' whole cycle; independent expenditures that name no candidate id are in the race totals only. FEC candidate summaries through ${cov.candidateSummariesThrough}.</span>`;
  };

  // ---------- where it came from ----------
  function drawDonors(D, S, w, hh) {
    const cycles = M.donorCycles(D), pad = { l: 46, r: 12, t: 54, b: 40 }, cy = S.my === 'all' ? 2026 : +S.my;
    const x = d3.scaleBand().domain(cycles).range([pad.l, w - pad.r]).padding(0.2), x1 = d3.scaleBand().domain(['t10', 't100']).range([0, x.bandwidth()]).padding(0.06);
    const top = Math.min(1, Math.ceil(d3.max(cycles, (c) => D.donors.cycles[c].top100ShareOfReceipts) * 12) / 10 + 0.0), y = d3.scaleLinear().domain([0, top]).range([hh - pad.b, pad.t]);
    svg.append('text').attr('class', 'axis-title').attr('x', 4).attr('y', 13).text('Top 10 and top 100 individual donors,');
    svg.append('text').attr('class', 'axis-title').attr('x', 4).attr('y', 28).text('share of super PAC receipts');
    for (const t of y.ticks(5)) {
      svg.append('line').attr('x1', pad.l).attr('x2', w - pad.r).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', RULE).attr('stroke-width', 0.5);
      svg.append('text').attr('x', pad.l - 5).attr('y', y(t) + 4).attr('text-anchor', 'end').text(Math.round(t * 100) + '%');
    }
    const rows = cycles.map((c) => ({ c, d: D.donors.cycles[c] }));
    const bars = svg.append('g').attr('class', 'mn-conc').selectAll('g').data(rows).join('g').attr('transform', (d) => `translate(${x(d.c)},0)`).style('cursor', 'pointer')
      .on('click', (ev, d) => ctx.setMoney({ my: String(d.c) }))
      .on('mousemove', (ev, d) => ctx.hoverHtml(concTip(D, d.c, d.d), ev.clientX, ev.clientY)).on('mouseleave', () => ctx.hover(null));
    for (const [key, fld, fill] of [['t10', 'top10ShareOfReceipts', INK], ['t100', 'top100ShareOfReceipts', 'rgba(35,48,107,.3)']]) {
      bars.append('rect').attr('class', 'mn-' + key).attr('x', x1(key)).attr('width', x1.bandwidth()).attr('y', (d) => y(d.d[fld] || 0)).attr('height', (d) => Math.max(0, y(0) - y(d.d[fld] || 0))).attr('fill', fill).attr('stroke', INK).attr('stroke-width', (d) => (d.c === cy ? 1.6 : 0.5));
      if (x1.bandwidth() > 9) bars.append('text').attr('x', x1(key) + x1.bandwidth() / 2).attr('y', (d) => y(d.d[fld] || 0) - 3).attr('text-anchor', 'middle').attr('font-size', 9).attr('fill', INK).text((d) => Math.round((d.d[fld] || 0) * 100));
    }
    bars.append('text').attr('x', x.bandwidth() / 2).attr('y', hh - pad.b + 16).attr('text-anchor', 'middle').attr('font-weight', (d) => (d.c === cy ? 700 : 400)).attr('fill', INK).text((d) => (d.c === 2026 ? '26*' : String(d.c).slice(2)));
    note(svg, 4, hh - 14, ['Dark: top 10. Pale: top 100. Click a cycle to list its donors.', '* 2026 is partial: the shares can only rise.']);
    // America PAC (2026), then the donors of $1 million or more for the cycle with the filing behind each figure.
    const dc = D.donors.cycles[cy], cov = D.coverage[cy], lb = cy === 2026 ? 'at least ' : '';
    let h = cy === 2026 ? americaHtml(D.americaPac) : '';
    h += `<h4>${cy}: ${dc.donorsAtLeast1M} individuals gave $1 million or more in itemized cash, ${M.usdWords(dc.donorsAtLeast1MUsd)} in all${exporting ? `; top 10 ${lb}${M.pct(dc.top10ShareOfReceipts)}, top 100 ${lb}${M.pct(dc.top100ShareOfReceipts)} of super PAC receipts` : ''}.</h4>` +
      (exporting ? '' : `<p class="mn-fine">Top 10: ${lb}${M.pct(dc.top10ShareOfReceipts)} of super PAC receipts (${M.usdWords(dc.superPacReceiptsUsd)}) and ${lb}${M.pct(dc.top10ShareOfIndividualContributions)} of the individual gifts to them (${M.usdWords(dc.superPacIndividualContributionsUsd)}); top 100: ${lb}${M.pct(dc.top100ShareOfReceipts)} and ${lb}${M.pct(dc.top100ShareOfIndividualContributions)}. ` +
      `Itemized lines cover ${M.pct(dc.itemizedIndividualShareOfIndividualContributions, 0)} of those gifts${cy === 2026 ? ' so far (the FEC has not yet itemized the rest)' : ' (the rest is unitemized: $200 or less per donor and year)'}.</p>`);
    h += '<table class="cl mn-donors"><thead><tr><th class="l">Donor, with first to last gift</th><th class="r">Cash (itemized)</th><th class="r">Memo-attributed</th><th class="l">Largest line: amount, date, filing</th></tr></thead><tbody>' +
      dc.named.map((n) => { const L = n.largestLines[0] || n.largestMemoLines[0], memoOnly = !n.largestLines[0];
        return `<tr><td class="l">${esc(n.name)}, ${esc(n.state)}<br><span class="mn-sub">${n.firstDate ? esc(n.firstDate) + ' to ' + esc(n.lastDate) : 'memo lines only'}</span></td><td class="r">${M.usd(n.cashUsd)}</td><td class="r">${n.memoAttributedUsd ? M.usd(n.memoAttributedUsd) + '<br><span class="mn-sub">memo, not added</span>' : ''}</td>` +
          `<td class="l">${L ? `${M.usd(L.usd)}${memoOnly ? ' (memo)' : ''}, ${esc(L.date)}<br><span class="mn-sub">filing ${esc(L.filing)}, ${esc(L.committeeName)}</span>` : ''}</td></tr>`; }).join('') + '</tbody></table>';
    if (!exporting) h += `<p class="mn-fine">Individuals only, keyed by last name, first name and state (the FEC has no donor id). Memo lines are an attribution of money received through another entity and are not added to cash. ${esc(UNREPORTED)} Itemized lines through ${esc(dc.lastLine)}; committee summaries through ${esc(cov.committeeSummariesThrough)}.${cy === 2026 ? ' Post-general reports are due in early December.' : ''}</p>`;
    side.innerHTML = h;
    if (exporting) {   // an export shows whole rows only
      const tb = side.querySelector('.mn-donors tbody'), tot = tb.rows.length; let n = tot;
      while (side.scrollHeight > side.clientHeight + 1 && n > 1) { tb.deleteRow(n - 1); n--; }
      if (n < tot) side.insertAdjacentHTML('beforeend', `<p class="mn-fine">The ${n} largest of ${tot} named donors are shown; all are on the page.</p>`);
    }
  }
  const concTip = (D, c, d) => `<b>${c}${c === 2026 ? ' (partial)' : ''}</b>: super PAC receipts ${M.usdWords(d.superPacReceiptsUsd)}<br>Top 10 individuals gave ${M.usdWords(d.top10Usd)} (${M.pct(d.top10ShareOfReceipts)}); top 100 ${M.usdWords(d.top100Usd)} (${M.pct(d.top100ShareOfReceipts)})<br>` +
    `Itemized individual cash ${M.usdWords(d.itemizedIndividualCashUsd)} of ${M.usdWords(d.superPacIndividualContributionsUsd)} individual contributions reported (${M.pct(d.itemizedIndividualShareOfIndividualContributions, 0)} itemized)<br>` +
    `<span style="color:${GRAPHITE}">Receipts include transfers between committees. Click to list this cycle's donors.</span>`;
  const americaHtml = (A) => {
    const ex = exporting, cov = D2().coverage['2026'];
    const rows = ex ? [['Receipts, through ' + A.summary.coverageEnd, M.usd(A.summary.receiptsUsd)],
      ['Schedule E: committee summary; FEC file through ' + cov.scheduleEFileThrough, M.usd(A.summary.scheduleESummaryUsd) + '; ' + M.usd(A.scheduleEFileUsd)],
      ['Elon Musk, cash (' + M.pct(A.musk.cashShareOfReceipts, 1) + ' of receipts)', M.usd(A.musk.cashUsd)],
      ['In-kind lines, memo-attributed to Musk (not added)', M.usd(A.musk.inKindFromUnitedStatesOfAmericaIncUsd)]]
      : [['Receipts, through ' + A.summary.coverageEnd + ' (committee summary)', M.usd(A.summary.receiptsUsd)], ['Disbursements (spent)', M.usd(A.summary.disbursementsUsd)],
        ['Schedule E, committee summary (outside, named for a race)', M.usd(A.summary.scheduleESummaryUsd)], ['Schedule E, FEC file through ' + cov.scheduleEFileThrough, M.usd(A.scheduleEFileUsd)],
        ['Disbursements not named for a race (summary basis): canvassing, petitions and operations are operating expenditures', M.usd(A.notAllocatedToARaceUsd)],
        ['Elon Musk, cash, ' + A.musk.cashFirst + ' to ' + A.musk.cashLast + ` (${M.pct(A.musk.cashShareOfReceipts, 2)} of receipts; filings ${[...new Set(A.musk.largestCashLines.map((l) => l.filing))].join(', ')} and ${A.musk.filings.length - 2} earlier)`, M.usd(A.musk.cashUsd)],
        ['In-kind lines booked to United States of America Inc', M.usd(A.musk.inKindFromUnitedStatesOfAmericaIncUsd)], ['Memo lines attributing those to Musk (not added)', M.usd(A.musk.memoAttributionToMuskUsd)],
        [`Cash plus attributed memo lines (${M.pct(A.musk.cashPlusAttributedShareOfReceipts, 2)} of receipts)`, M.usd(A.musk.cashPlusAttributedUsd)]];
    return `<h4>America PAC (${A.committee}), 2026 cycle, as filed</h4><table class="cl mn-america"><tbody>` + rows.map(([a, b]) => `<tr><td class="l">${esc(a)}</td><td class="r">${esc(b)}</td></tr>`).join('') + '</tbody></table>' +
      (ex ? '' : `<p class="mn-fine">America PAC's receipts and Musk lines come from our research note (July to October read from filings 2026216 and 2038959). Schedule E differs between the summary and the file: the file carries 24- and 48-hour reports the summary has not caught up with (the note found $51.4 million and $71.4 million at earlier dates).</p>`);
  };
  const D2 = () => ctx.money();
  return { build, draw };
}
