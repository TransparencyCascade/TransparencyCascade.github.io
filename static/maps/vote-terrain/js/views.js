/* Saved views and tours (views.json).
   A saved view is a name for one exact screen: its state (the same keys as the address hash), a title, a caption
   and a sources line, and optionally the snapshot its numbers come from. ?view=<slug> opens it still, with its
   caption; ?tour=<slug> steps through a list of views with Back, Next and Skip. Pieces and guide chapters cite
   views by slug, and tools/vote-terrain/export.mjs renders the same record as a card, a GIF or a video.

   Captions hold no typed numbers. Every figure is a token resolved from the page's data:
     {path.into.data|filter}   roots: bal (balance.json), eff (effective.json), house (house.json), hist (history.json), elections (the page's elections), calc (below)
     filters: n (1,234), raw (as written: years), x (4.2×), x2 (0.95×), pct (12.3%), pct2 (0.18%), et (time, Eastern), last (last word), states (names joined),
              perstate ({ST: votes} as "60,134 in Pennsylvania, ...")
   calc.eff.<election>: hi, lo (state codes), hiName, loName, ratio (weight per vote, highest over lowest state)
   calc.hist: first, last (census rows), capYear, lastHiName/lastHiV, lastLoName/lastLoV (most and fewest residents per seat,
     latest census), smallFirst, smallLast, smallMin, smallMax (elections with the fewest and most votes in their smallest change)
   calc.bias.y<year> (1976-2024): the tipping state against the nation (bias.js, history.json): { year, winName, evW, evL, natName (popular-vote leader), natVotes, natPts,
     tipSt, tipName, tipEv, tipParty, tipVotes, tipPts, gap (signed), gapPts, gapToward (the party the tipping state voted more for than the nation), ratio, sentence };
     calc.bias.first, last, big, small (the elections with the largest and smallest gap), n; filter ratio: 126.1 or 341 (a ratio of margins).
   calc.sim.y<year>.<pres|sen|house>.<toD|toR>.<first|other>: { at, control, states } (uniform swing; see below);
     calc.sim.y<year>.swing: { ps, toR, toD, edgeR, edgeD } (House: seats that change hands at the plausible swing and at
     the slider's limit, each { n, captured, atRisk, contestable }); calc.sim.range: the slider's limit in points.
     filter pt: a swing as unsigned points (1.8).
   calc.power.<election>: rank { hi, lo ({ st, r, B, N, T }), hiName, loName, n }; tiles { hi, lo ({ st, name, votes, ev, sen
     (shares, percent), evPerVote }), n }; conc { q (50), d, r ({ n, of, land, counties: percent }) } (power.js).
   calc.ov.<layer>: n (counties marked), election (label), inN, outN, inMed, outMed, diff, unmatched, more (the party the
     marked counties moved more toward); roots ov.layers.<layer>: the layer record (name, rule, source, asof).
   calc.road.y<year>.<pres|sen>: { win, winName, loseName, need, evW, evL (the winning and losing side's count), tip { name, size, votes, points,
     flip, party }, c1, c2, c3 (the results with the fewest votes to flip: name, votes, points, flip) }; calc.closest.y<year>: { n, compared, changed,
     first, second, third (the races with the fewest votes to flip: place, office, votes, points, flip, win) }; calc.flips.<from>-<to> (election ids):
     { n, both, dToR, rToD, votes }; calc.bell: { n, of, k (presidential elections) }; calc.ms.<election>: { n, medAll, medR, medD, nR, nD, toR, toD, window }
     (margin against swing, swingview.js; medians are signed, positive toward Democrats; filter swing words one).
   calc.dropoff.y<2022|2026>: { year, base (the presidential year), n (counties), states, nSen, nGov, all (percent: the midterm votes of all counties shown over their
     presidential votes), noRace (state codes; filter states), cmp, below, above, within (counties against the 2022 band for counties of their margin, turnout.js),
     belowPct, abovePct }; calc.split: { n, states, differ, differPct (counties where different parties led the two races), big10 (counties 10 or more points apart),
     med (the median difference, signed; filter toward), top { st, name, med } (the state with the largest median difference) };
     calc.county.<code>: { name, st, m.<election>, votes.<election> } (margin in points, signed; filter lead); calc.region.<id>: { name, n, m.<election>, votes.<election> }
     (the preset's counties together, regions.json).
   calc.money.y<year> (2008-2026): { races, medFlip, medFlipParty, medFlipOut, medMoved, medMovedParty, medMovedOut (median dollars per decisive vote: candidates; plus party coordinated;
     plus independent expenditures naming the candidates), superNot, superAlloc, superDisb, superReceipts, hybridNot, alloc, notAlloc, disb, notAllocShare (super and hybrid PACs: Schedule E and what no
     race is named for), lostN, lostOutN, lostOf, lostOutOf (races where the bigger spender lost, counting candidates, and with outside money), top10, top100 (percent of super PAC receipts),
     top10Usd, n1m, topName, topUsd, topDate, topFiling (the largest donor's largest line), committeesThrough, itemizedThrough, candidatesThrough, cost { senatePerFlip, senateOutPerFlip, senateSpent,
     presPerVote, presSpent } }; calc.money.america: { receipts, disb, schedE, schedEFile, notAlloc, through, schedEThrough, muskCash, muskCashShare, inKind, memo, attributed, attributedShare };
     filters usd ($12,345) and usdw ($4.2 million); root money is money.json itself (coverage, sources).
   calc.house.<year>: ps, captured, contestable, atRisk, apart, capv, capvShare, st.<ST>.{captured, contestable, atRisk}
     (bands at the default plausible swing). An unknown token stops the caption and logs an error, so a broken
     caption cannot reach a card unnoticed. */
import { fmt, esc, list, countyLabelOf, $ } from './util.js';
import { createHouse } from './house.js';
import { createSim, RANGE } from './sim.js';
import { createRaces, OFFICES } from './races.js';
import { tokens as biasTokens, ratioText } from './bias.js';
import * as Mn from './money.js';

export function createSavedViews({ registry, bal, eff, houseData, histData, moneyData, simData, elections, stName, power, overlays, flips, meta, ms, sameOffice, turnout, places, regionData, apply }) {
  const etTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' }) + ' ET';
  // Derived figures, computed once from the data files (the House bands with their own state, at the default plausible swing).
  const calc = { eff: {}, house: {} };
  for (const [e, E] of Object.entries(eff.elections)) {
    const rows = Object.entries(E.states).sort((a, b) => b[1][0] - a[1][0]), [hi, lo] = [rows[0], rows[rows.length - 1]];
    calc.eff[e] = { hi: hi[0], lo: lo[0], hiName: stName(hi[0]), loName: stName(lo[0]), ratio: hi[1][0] / lo[1][0] };
  }
  for (const y of houseData.years) {
    const h = createHouse({ data: houseData, state: { e: 'house' + y, ps: '' }, elections }).now();
    const c = { captured: 0, contestable: 0, 'at risk': 0, apart: 0 };
    for (const d of h.districts) c[d.band] += 1;
    const capv = Object.values(h.states).reduce((a, s) => a + s.capv, 0), T = Object.values(h.states).reduce((a, s) => a + s.T, 0);
    calc.house[y] = { ps: h.plausible.value, captured: c.captured, contestable: c.contestable, atRisk: c['at risk'], apart: c.apart, capv, capvShare: capv / T * 100,
      st: Object.fromEntries(Object.entries(h.states).map(([st, s]) => [st, { captured: s.captured, contestable: s.contestable, atRisk: s.atRisk }])) };
  }
  // The long view (history.json): first and last census, the 1929 act's year, the widest and narrowest smallest change.
  {
    const P = histData.perSeat, last = P[P.length - 1], L = histData.smallest;
    const byVotes = L.slice().sort((a, b) => a.votes - b.votes);
    calc.hist = { first: P[0], last, capYear: histData.cap.signed.slice(0, 4), lastHiName: stName(last.hi), lastHiV: last.states[last.hi].perSeat,
      lastLoName: stName(last.lo), lastLoV: last.states[last.lo].perSeat, smallFirst: L[0].year, smallLast: L[L.length - 1].year,
      smallMin: byVotes[0], smallMax: byVotes[byVotes.length - 1] };
    // Weight per vote over time: the first and last presidential year, with the states named.
    const Wt = histData.weight, wF = Wt[0], wL = Wt[Wt.length - 1];
    Object.assign(calc.hist, { wFirst: wF, wLast: wL, wLastBigName: stName(wL.senate.big), wLastSmallName: stName(wL.senate.small),
      wLastHiName: stName(wL.ev.hi), wLastLoName: stName(wL.ev.lo), wFirstHiName: stName(wF.ev.hi), wFirstLoName: stName(wF.ev.lo) });
  }
  // The tipping state against the nation, each presidential election (history.json bias).
  if (histData.bias) {
    const rows = histData.bias.map(biasTokens), byGap = rows.slice().sort((a, b) => b.gapPts - a.gapPts);
    calc.bias = { ...Object.fromEntries(rows.map((r) => ['y' + r.year, r])), first: rows[0], last: rows[rows.length - 1], big: byGap[0], small: byGap[byGap.length - 1], n: rows.length };
  }
  // The simulator (simulator.json): per election day, where control of each body changes on a uniform swing, toward
  // Democrats (toD) and toward Republicans (toR): first, the first change; other, the first that hands it to the other
  // party; each { at (points, unsigned), control, states (the places flipped at that swing, earliest first) }.
  // Captured seats (House, at the default plausible swing): how many, and how many flip at that swing either way.
  if (simData) {
    const S = createSim(simData);
    calc.sim = { range: RANGE };
    for (const y of Object.keys(simData.days)) {
      const hn = houseData.years.includes(y) ? createHouse({ data: houseData, state: { e: 'house' + y, ps: '' }, elections }).now() : null;
      const P = S.placesFor(y, hn), th = S.thresholds(P, 'u'), base = S.tally(P, 0, 'u'), c = {};
      for (const b of ['pres', 'sen', 'house']) {
        if (!base[b]) continue;
        c[b] = { actual: base[b].control };
        for (const [k, dir] of [['toD', 1], ['toR', -1]]) {
          const list = th.filter((x) => x.body === b && x.at * dir > 0).sort((a, b2) => Math.abs(a.at) - Math.abs(b2.at));
          const pack = (x) => x && { at: Math.abs(x.at), control: x.control,
            states: S.flipped(P, x.at, 'u', new Set(), b).map((f) => f.p.st).filter((st, i, a) => a.indexOf(st) === i) };
          c[b][k] = { first: pack(list[0]), other: pack(list.find((x) => x.control !== base[b].control && x.control !== 'none' && x.control !== 'tie')) };
        }
      }
      if (hn) {
        // Seats that change hands at the plausible swing, and at the slider's limit, with how many of those the page
        // counts as captured. (At the plausible swing itself no captured seat can flip: the captured line is never
        // below it, so that count would only restate the definition.)
        const ps = hn.plausible.value, n = (sw) => { const f = S.tally(P, sw, 'u').house.flips; return { n: f.length, captured: f.filter((p) => p.band === 'captured').length,
          atRisk: f.filter((p) => p.band === 'at risk').length, contestable: f.filter((p) => p.band === 'contestable').length }; };
        c.swing = { ps, toR: n(-ps), toD: n(ps), edgeR: n(-RANGE), edgeD: n(RANGE) };
      }
      calc.sim['y' + y] = c;
    }
  }
  // The Power tab (power.js), per election with county results: the highest and lowest weight per vote with their
  // parts; the states whose share of electoral votes most exceeds, and most falls short of, their share of votes
  // cast; and each party's concentration at half its votes.
  calc.power = new Proxy({}, { get: (o, e) => {
    if (typeof e !== 'string' || !power || !elections[e] || elections[e].house) return undefined;
    if (o[e]) return o[e];
    const R = power.rank(e), T = power.states(e).rows.slice().sort((a, b) => b.evPerVote - a.evPerVote);
    const tile = (x) => ({ st: x.st, name: stName(x.st), votes: x.share.votes * 100, ev: x.share.ev * 100, sen: x.share.sen * 100, evPerVote: x.evPerVote });
    const conc = (pk) => { const r = power.reach(e, pk, 50); return r && { n: r.n, of: r.of, land: r.land * 100, counties: r.counties * 100 }; };
    return (o[e] = { rank: R && { hi: R[0], lo: R[R.length - 1], hiName: stName(R[0].st), loName: stName(R[R.length - 1].st), n: R.length },
      tiles: { hi: tile(T[0]), lo: tile(T[T.length - 1]), n: T.length }, conc: { q: 50, d: conc('d'), r: conc('r') } });
  } });
  // Overlays (overlays.js), each on the election its layer belongs to: counties marked, and the comparison of their
  // swing with matched unmarked counties { inN, outN, inMed, outMed, diff, unmatched }; filter swing gives
  // "1.2 points toward the Democrat".
  calc.ov = {};
  if (overlays) for (const k of Object.keys(overlays.sets)) {
    const L = overlays.layer(k), c = overlays.compare(k, L.election) || {};
    calc.ov[k] = { ...c, n: overlays.sets[k].size, election: elections[L.election].label, more: c.diff >= 0 ? 'Democrat' : 'Republican' };
  }
  // Road to 270, Closest races, flips and bellwethers, and margin against swing (races.js, flips.js, swingview.js).
  const races = simData && createRaces({ simData: () => simData, elections, sameOffice, meta, stName,
    houseNowFor: (y) => (houseData.years.includes(String(y)) ? createHouse({ data: houseData, state: { e: 'house' + y, ps: '' }, elections }).now() : null) });
  const P_NAME = { D: 'Democrats', R: 'Republicans' };
  calc.road = new Proxy({}, { get: (o, k) => {
    if (typeof k !== 'string' || !races || !/^y\d{4}$/.test(k)) return undefined;
    return (o[k] ||= Object.fromEntries(['pres', 'sen'].map((b) => [b, (() => {
      const r = races.road(k.slice(1), b); if (!r) return undefined;
      const w = r.control === 'none' ? null : r.control, l = w === 'D' ? 'R' : 'D', pick = (s) => s && { name: s.name, votes: s.votes, points: s.points, flip: s.flip, size: s.size, party: P_NAME[s.win] };
      return { win: w, winName: w ? P_NAME[w] : '', loseName: w ? P_NAME[l] : '', need: r.need, evW: w ? (b === 'pres' ? r[w] : r.counts[w]) : 0, evL: w ? (b === 'pres' ? r[l] : r.counts[l]) : 0,
        tip: pick(r.tip), c1: pick(r.byFlip[0]), c2: pick(r.byFlip[1]), c3: pick(r.byFlip[2]) };
    })()]).filter(([, x]) => x))); } });
  calc.closest = new Proxy({}, { get: (o, k) => {
    if (typeof k !== 'string' || !races || !/^y\d{4}$/.test(k)) return undefined;
    if (o[k]) return o[k];
    const S = races.summary(k.slice(1)); if (!S) return undefined;
    const pick = (r) => r && { place: r.place, office: OFFICES[r.office], votes: r.votes, points: r.points, flip: r.flip, win: P_NAME[r.win] };
    return (o[k] = { n: S.n, compared: S.compared, changed: S.changed, first: pick(S.first), second: pick(S.second), third: pick(S.third) });
  } });
  calc.flips = new Proxy({}, { get: (o, k) => {
    const m = typeof k === 'string' && flips && k.match(/^(\w+)-(\w+)$/);
    if (!m || !elections[m[1]] || !elections[m[2]]) return undefined;
    const F = flips.flipped(m[1], m[2]); return { n: F.n, both: F.both, dToR: F.dToR, rToD: F.rToD, votes: F.votes };
  } });
  calc.bell = flips ? (() => { const B = flips.bell(); return { n: B.n, of: B.of, k: B.ids.length }; })() : undefined;
  calc.ms = new Proxy({}, { get: (o, e) => {
    if (typeof e !== 'string' || !ms || !elections[e] || !sameOffice[e] || !elections[sameOffice[e]]) return undefined;
    if (o[e]) return o[e];
    const mg = (x) => (x && x[0] ? (x[2] - x[1]) / x[0] * 100 : null), now = elections[e].data, base = elections[sameOffice[e]].data;
    const rows = Object.keys(meta).map((f) => { const v = now[f] || null, b = base[f] || null, m1 = mg(v), m0 = mg(b); return { f, v, b, s: m1 == null || m0 == null ? null : m1 - m0 }; });
    return (o[e] = ms.summarize(ms.msRows(rows, mg)));
  } });
  // Turnout drop-off, ticket splitting, one county's history and a preset region (turnout.js, places.js).
  calc.dropoff = new Proxy({}, { get: (o, k) => {
    const y = typeof k === 'string' && /^y(2022|2026)$/.test(k) ? +k.slice(1) : null; if (!y || !turnout) return undefined;
    if (o[k]) return o[k];
    const D = turnout.drop(y), c = turnout.compare(y, 2022);
    return (o[k] = { year: y, base: elections[D.base].year, n: D.rows.length, states: D.per.length, nSen: D.nSen, nGov: D.nGov, all: D.all * 100, noRace: D.noRace, noRaceN: D.noRace.length, cmp: c.n, below: c.below, above: c.above, within: c.within,
      belowPct: c.below / c.n * 100, abovePct: c.above / c.n * 100 });
  } });
  if (turnout) {
    const T = turnout.split(), ds = T.rows.map((r) => r.d).sort((a, b) => a - b), n = ds.length, top = T.per.slice().sort((a, b) => Math.abs(b.med) - Math.abs(a.med))[0];
    const differ = T.rows.filter((r) => Math.sign(r.ms) !== Math.sign(r.mg)).length;
    calc.split = { n, states: T.states.length, differ, differPct: differ / n * 100, big10: T.rows.filter((r) => Math.abs(r.d) >= 10).length,
      med: n % 2 ? ds[(n - 1) / 2] : (ds[n / 2 - 1] + ds[n / 2]) / 2, top: { st: top.st, name: stName(top.st), med: top.med } };
  }
  const byElection = (rows, g) => Object.fromEntries(rows.map((x) => [x.e, g(x)]));
  calc.county = new Proxy({}, { get: (o, f) => {
    if (typeof f !== 'string' || !meta[f] || !places) return undefined;
    if (o[f]) return o[f];
    const C = places.countyOf(f);
    return (o[f] = { name: countyLabelOf(meta, f), st: stName(meta[f].st), m: byElection(C, (x) => x.m), votes: byElection(C, (x) => (x.v ? x.v[0] : null)) });
  } });
  calc.region = new Proxy({}, { get: (o, id) => {
    const r = typeof id === 'string' && regionData && regionData.regions.find((x) => x.id === id); if (!r) return undefined;
    if (o[id]) return o[id];
    const A = places.areaOf(r.counties);
    return (o[id] = { name: r.name, n: r.counties.length, m: byElection(A, (x) => x.m), votes: byElection(A, (x) => x.votes) });
  } });
  // Money (money.js): per cycle, the median dollars per decisive vote, the outside money no race is named for, outspent and lost, the donors, and the
  // smallest change's cost line. Percentages are percent numbers (filter pct); dollars take filter usd or usdw.
  calc.money = new Proxy({}, { get: (o, k) => {
    if (typeof k === 'string' && k in o) return o[k];
    const m = typeof k === 'string' && /^y(20\d\d)$/.exec(k), D = moneyData; if (!m || !D || !D.committees.cycles[m[1]]) return undefined;
    if (o[k]) return o[k];
    const y = +m[1], med = (c, d) => Mn.medianOf(D, y, c, d), C = Mn.committees(D, y), dn = D.donors.cycles[y], top = dn && dn.named[0], L = (c) => Mn.lostRows(D, y, c);
    const day = { 2016: 'pres2016', 2018: 'd2018', 2020: 'pres2020', 2022: 'd2022', 2024: 'pres2024', 2026: 'sen2026' }[y], cost = day && bal.elections[day] && Mn.costLine(D, y, bal.elections[day].smallest);
    return (o[k] = { year: y, races: Mn.races(D, y, 'cand', 'flip').length,
      medFlip: med('cand', 'flip'), medFlipParty: med('party', 'flip'), medFlipOut: med('out', 'flip'), medMoved: med('cand', 'moved'), medMovedParty: med('party', 'moved'), medMovedOut: med('out', 'moved'),
      superNot: C.superPac.notAllocatedToARaceUsd, superAlloc: C.superPac.allocatedToARaceUsd, superDisb: C.superPac.disbursementsUsd, superReceipts: C.superPac.receiptsUsd, hybridNot: C.hybrid.notAllocatedToARaceUsd,
      alloc: C.allocated, notAlloc: C.notAllocated, disb: C.disbursed, notAllocShare: C.disbursed ? C.notAllocated / C.disbursed * 100 : null,
      lostN: L('cand').filter((x) => x.lost).length, lostOutN: L('out').filter((x) => x.lost).length, lostOf: L('cand').length, lostOutOf: L('out').length,
      top10: dn && dn.top10ShareOfReceipts * 100, top100: dn && dn.top100ShareOfReceipts * 100, top10Usd: dn && dn.top10Usd, n1m: dn && dn.donorsAtLeast1M, topName: top && top.name, topUsd: top && top.cashUsd,
      topDate: top && top.largestLines[0] && top.largestLines[0].date, topFiling: top && top.largestLines[0] && top.largestLines[0].filing,
      committeesThrough: D.coverage[y].committeeSummariesThrough, itemizedThrough: D.coverage[y].itemizedLinesThrough, candidatesThrough: D.coverage[y].candidateSummariesThrough,
      cost: cost && { senatePerFlip: cost.senate && cost.senate.spent / cost.senate.flip, senateOutPerFlip: cost.senate && cost.senate.out / cost.senate.flip, senateSpent: cost.senate && cost.senate.spent,
        presPerVote: cost.president && cost.president.spent / cost.president.votes, presSpent: cost.president && cost.president.spent } });
  } });
  if (moneyData) { const A = moneyData.americaPac; calc.money.america = { receipts: A.summary.receiptsUsd, disb: A.summary.disbursementsUsd, schedE: A.summary.scheduleESummaryUsd, schedEFile: A.scheduleEFileUsd, notAlloc: A.notAllocatedToARaceUsd,
    through: A.summary.coverageEnd, schedEThrough: moneyData.coverage['2026'].scheduleEFileThrough, muskCash: A.musk.cashUsd, muskCashShare: A.musk.cashShareOfReceipts * 100, inKind: A.musk.inKindFromUnitedStatesOfAmericaIncUsd, memo: A.musk.memoAttributionToMuskUsd,
    attributed: A.musk.cashPlusAttributedUsd, attributedShare: A.musk.cashPlusAttributedShareOfReceipts * 100 }; }
  const roots = { bal, eff, house: houseData, hist: histData, money: moneyData, elections, calc, sim: simData, ov: overlays && { layers: Object.fromEntries(Object.keys(overlays.sets).map((k) => [k, overlays.layer(k)])) } };
  const FILTERS = {
    ratio: (v) => ratioText(v), n: (v) => fmt(v), raw: (v) => String(v), pt: (v) => Math.abs(v).toFixed(1), lead: (v) => (v >= 0 ? 'D+' : 'R+') + Math.abs(v).toFixed(1), toward: (v) => `${Math.abs(v).toFixed(1)} points toward ${v >= 0 ? 'Democrats' : 'Republicans'}`, swing: (v) => `${Math.abs(v).toFixed(1)} points toward the ${v >= 0 ? 'Democrat' : 'Republican'}`, x: (v) => v.toFixed(1) + '×', x2: (v) => v.toFixed(2) + '×', pct: (v) => v.toFixed(1) + '%', usd: (v) => Mn.usd(v), usdw: (v) => Mn.usdWords(v), pct2: (v) => v.toFixed(2) + '%', et: (v) => etTime(v),
    last: (v) => String(v).split(' ').pop(), states: (v) => list(v.map(stName)),
    perstate: (v) => list(Object.entries(v).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${fmt(n)} in ${stName(st)}`)),
  };
  const resolve = (text) => text.replace(/\{([^}|]+)(?:\|(\w+))?\}/g, (whole, p, f) => {
    let v = roots;
    for (const k of p.split('.')) v = v == null ? undefined : v[k];
    if (v === undefined || (f && !FILTERS[f])) { console.error(`views.json: cannot resolve ${whole}`); return '[?]'; }
    return f ? FILTERS[f](v) : typeof v === 'number' ? (Number.isInteger(v) ? fmt(v) : String(v)) : String(v);
  });
  const view = (slug) => registry.views.find((v) => v.slug === slug);
  const tour = (slug) => registry.tours.find((t) => t.slug === slug);
  // The text of a view, resolved: what the card on the page and the exported card both show.
  const text = (slug, caption) => { const v = view(slug); return { title: resolve(v.title), caption: resolve(caption || v.caption), sources: resolve(v.sources), file: resolve(v.file || v.title) }; };

  // The card on the page: the view's title, caption and sources; on a tour, Back, Next and Skip with the step count.
  const card = $('viewCard');
  let current = null;   // { kind: 'view', slug } or { kind: 'tour', slug, i }
  const draw = () => {
    if (!current) { card.hidden = true; return; }
    const t = current.kind === 'tour' ? tour(current.slug) : null, step = t ? t.steps[current.i] : null;
    const slug = step ? step.view : current.slug, x = text(slug, step && step.caption);
    card.innerHTML = `<header><b>${esc(x.title)}</b>${t ? `<span class="vc-step">${current.i + 1} of ${t.steps.length}</span>` : ''}<button class="vc-close" aria-label="Close">×</button></header>` +
      `<p class="vc-caption">${esc(x.caption)}</p><p class="vc-src">${esc(x.sources)}</p>` +
      (t ? `<div class="vc-nav"><button class="vc-back"${current.i === 0 ? ' disabled' : ''}>Back</button><button class="vc-next">${current.i === t.steps.length - 1 ? 'Done' : 'Next'}</button><button class="vc-skip">Skip</button></div>` : '');
    card.hidden = false;
  };
  const go = (i) => { current.i = i; apply(view(tour(current.slug).steps[i].view).state); draw(); };
  card.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.classList.contains('vc-close') || b.classList.contains('vc-skip')) close();
    else if (b.classList.contains('vc-back')) go(current.i - 1);
    else if (b.classList.contains('vc-next')) { const t = tour(current.slug); if (current.i < t.steps.length - 1) go(current.i + 1); else close(); }
  });
  const close = () => { current = null; draw(); onResize(); };
  let onResize = () => {};
  const open = (spec, { applyState = true } = {}) => {
    if (spec.view && view(spec.view)) { current = { kind: 'view', slug: spec.view }; if (applyState) apply(view(spec.view).state); }
    else if (spec.tour && tour(spec.tour)) { current = { kind: 'tour', slug: spec.tour, i: 0 }; if (applyState) apply(view(tour(spec.tour).steps[0].view).state); }
    else return false;
    draw(); return true;
  };
  return { open, close, draw, text, view, tour, resolve, calc, isOpen: () => !!current, current: () => current, setOnResize: (f) => { onResize = f; } };
}

// Which saved view or tour the address asks for (?view=, ?tour=), checked against the registry's slug format.
export const askedFor = () => {
  const q = new URLSearchParams(location.search), ok = (s) => (s && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) ? s : null);
  return { view: ok(q.get('view')), tour: ok(q.get('tour')), exporting: q.get('export') === '1' };
};
