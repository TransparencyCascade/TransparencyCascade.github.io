/* Money (pure arithmetic; money.json from tools/vote-terrain/build_money.py). The Money tab, the table, the balance box's cost line and the caption
   tokens all read their figures through here, so the figures cannot drift apart.
   Counting (md, mm in the link): the decisive votes are the votes to flip (half the margin plus one) or the votes moved since the previous race for the
   seat; the money counted is the candidates' spending alone (cand), plus party coordinated expenditures (party), plus the independent expenditures that
   name the race's candidates (out, "race-allocated outside money"). Money no race can be named for is shown beside, never folded in or dropped. */

export const CYCLES = [2008, 2010, 2012, 2014, 2016, 2018, 2020, 2022, 2024, 2026];
export const DEFS = { flip: 'votes to flip', moved: 'votes moved' };
export const COUNTS = { cand: 'candidates', party: 'candidates and parties', out: 'candidates, parties and race-allocated outside money' };
const FIG = { spent: 'candidate total disbursements', coord: 'party coordinated expenditures', ieFor: 'independent expenditures supporting', ieAgainst: 'independent expenditures opposing' };

const find = (r, k) => { const x = r.money && r.money.find((f) => f.what.startsWith(FIG[k])); return x ? x.usd : 0; };
/** The race's figures: spent (candidates), coord (parties), ie (independent expenditures for and against its candidates). Null when no dollars are assigned. */
export const figures = (r) => (r.money ? { spent: find(r, 'spent'), coord: find(r, 'coord'), ie: find(r, 'ieFor') + find(r, 'ieAgainst') } : null);
/** Dollars in the race under a counting. */
export const dollars = (r, count) => { const f = figures(r); return f ? f.spent + (count !== 'cand' ? f.coord : 0) + (count === 'out' ? f.ie : 0) : null; };
/** Dollars per decisive vote: null without dollars or without that definition's votes. */
export const perVote = (r, count, def) => { const d = dollars(r, count), v = r.decisive && r.decisive[def]; return d != null && v ? d / v : null; };
/** The races of a cycle that have dollars and that definition's votes. */
export const races = (M, cycle, count, def) => M.senate.filter((r) => (cycle == null || r.cycle === cycle) && perVote(r, count, def) != null && dollars(r, count) > 0);
export const median = (xs) => { const s = xs.slice().sort((a, b) => a - b), n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
export const medianOf = (M, cycle, count, def) => median(races(M, cycle, count, def).map((r) => perVote(r, count, def)));
export const unofficial = (r) => !!(r.votes && /unofficial/.test(r.votes.src));

/** Outside money as committee totals, per cycle: the groups the page shows, and the split between what a race can be named for and what it cannot. */
export const committees = (M, cycle) => {
  const C = M.committees.cycles[cycle]; if (!C) return null;
  const sp = C.superPac, hy = C.hybrid, pa = C.party;
  return { superPac: sp, hybrid: hy, party: pa, conduit: C.conduit,
    // Super PACs and hybrid PACs together: Schedule E (named for a race) and the rest.
    allocated: sp.allocatedToARaceUsd + hy.allocatedToARaceUsd, notAllocated: sp.notAllocatedToARaceUsd + hy.notAllocatedToARaceUsd,
    disbursed: sp.disbursementsUsd + hy.disbursementsUsd, received: sp.receiptsUsd + hy.receiptsUsd };
};

/** Super PACs and hybrid PACs together, net of transfers between committees or gross, through the pre-general report (pre) or the whole cycle: the figures the committee bars,
    the table and the caption tokens share. Null when the cycle has no such figures (pre: only 2022, 2024 and 2026 have them). */
export const outside = (M, cycle, net, pre) => {
  const C = M.committees.cycles[cycle], src = C && (pre ? C.preGeneral : C); if (!src) return null;
  const sp = src.superPac, hy = src.hybrid, D = (g) => (net ? g.netDisbursementsUsd : g.disbursementsUsd), N = (g) => (net ? g.netNotAllocatedToARaceUsd : g.notAllocatedToARaceUsd), R = (g) => (net ? g.netReceiptsUsd : g.receiptsUsd);
  return { superPac: sp, hybrid: hy, disbursed: D(sp) + D(hy), allocated: sp.allocatedToARaceUsd + hy.allocatedToARaceUsd, notAllocated: N(sp) + N(hy), received: R(sp) + R(hy),
    through: pre ? src.through : null, filingsBy: pre ? src.filingsOnRecordBy : null };
};
export const PRE_CYCLES = [2022, 2024, 2026];
/** The same point in each cycle (the pre-general report), super PACs and hybrid PACs together: the figures for each cycle, and 2026 against 2024 and 2022, net and gross. */
export const sameDate = (M) => {
  const out = {};
  for (const y of PRE_CYCLES) {
    const n = outside(M, y, true, true), g = outside(M, y, false, true); if (!n || !g) return null;
    out['y' + y] = { through: n.through, filingsBy: n.filingsBy, netDisb: n.disbursed, grossDisb: g.disbursed, netReceipts: n.received, grossReceipts: g.received, netNot: n.notAllocated, grossNot: g.notAllocated, alloc: n.allocated };
  }
  const cmp = (a, b, k) => { const d = out['y' + a][k] - out['y' + b][k], base = out['y' + b][k]; return { diff: Math.abs(d), pct: Math.abs(d) / base * 100, word: d > 0 ? 'more' : d < 0 ? 'less' : 'the same', verb: d > 0 ? 'exceeded' : d < 0 ? 'fell short of' : 'matched' }; };
  for (const b of [2024, 2022]) out['vs' + b] = { net: cmp(2026, b, 'netDisb'), gross: cmp(2026, b, 'grossDisb'), netNot: cmp(2026, b, 'netNot'), netReceipts: cmp(2026, b, 'netReceipts') };
  return out;
};

/** Outspent and lost: each race's two-party vote share against the two named candidates' spending share. Dem side is the Democratic-side candidate in the vote record. */
export const sideMoney = (s, o, count) => s.spentUsd + (count !== 'cand' ? s.coordUsd : 0) + (count === 'out' ? s.ieForUsd + o.ieAgainstUsd : 0);
export const lostRows = (M, cycle, count) => {
  const rows = [];
  for (const r of M.senate) {
    if (cycle != null && r.cycle !== cycle) continue;
    if (!r.votes || !r.sides) continue;
    const d = sideMoney(r.sides.D, r.sides.R, count), rr = sideMoney(r.sides.R, r.sides.D, count);
    if (d + rr <= 0) continue;
    const vd = r.votes.D / (r.votes.D + r.votes.R), sd = d / (d + rr);
    const winner = r.votes.D > r.votes.R ? 'D' : 'R', bigger = sd > 0.5 ? 'D' : sd < 0.5 ? 'R' : null;
    rows.push({ r, cycle: r.cycle, st: r.st, vd, sd, dUsd: d, rUsd: rr, winner, bigger, lost: bigger != null && bigger !== winner });
  }
  return rows;
};

/** Donor concentration per cycle (itemized individual gifts to super PACs). */
export const donorCycles = (M) => Object.keys(M.donors.cycles).map(Number).sort((a, b) => a - b);

/** The balance box's cost line for one election day: the money in the races of its smallest change per decisive vote, with its type stated.
    smallest.senate: { votes, races: [{ state }] } (balance.json); the cycle is the election year. Races with no dollars assigned are named and left out of both sides of the ratio. */
export const costLine = (M, year, smallest) => {
  const out = {};
  if (smallest && smallest.senate) {
    const want = smallest.senate.races.map((x) => x.state), rs = [], missing = [];
    for (const st of want) {
      const r = M.senate.find((x) => x.cycle === year && x.st === st && !x.special && x.money && x.decisive);
      if (r) rs.push(r); else missing.push(st);
    }
    if (rs.length || missing.length) {
      const flip = rs.reduce((a, r) => a + r.decisive.flip, 0);
      out.senate = { year, races: rs.map((r) => r.st), missing, flip, spent: rs.reduce((a, r) => a + dollars(r, 'cand'), 0), party: rs.reduce((a, r) => a + dollars(r, 'party'), 0),
        out: rs.reduce((a, r) => a + dollars(r, 'out'), 0) };
    }
  }
  if (smallest && smallest.president) {
    const P = M.president.find((x) => x.cycle === year);
    if (P) { const f = (k) => P.money.find((x) => x.what.startsWith(k)).usd;
      out.president = { year, votes: smallest.president.votes, spent: f('candidate total disbursements'), outside: f('independent expenditures supporting') + f('independent expenditures opposing') + f('party coordinated') }; }
  }
  return out;
};

export const usd = (v) => (v == null ? '' : '$' + Math.round(v).toLocaleString('en-US'));
/** Dollars compactly: $4.2 million, $1.6 billion, $850,000. */
export const usdWords = (v) => (v == null ? '' : Math.abs(v) >= 1e9 ? '$' + (v / 1e9).toFixed(2).replace(/\.?0+$/, '') + ' billion' : Math.abs(v) >= 1e6 ? '$' + (v / 1e6).toFixed(1).replace(/\.0$/, '') + ' million' : usd(v));
export const pct = (v, d = 1) => (v == null ? '' : (v * 100).toFixed(d) + '%');
