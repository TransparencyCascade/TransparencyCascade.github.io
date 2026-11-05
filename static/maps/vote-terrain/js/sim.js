/* The swing simulator's arithmetic (simulator.json from build_simulator.py, and the House from house.json).
   Pure functions: the Simulator view, its table, the saved views' captions and the smoke test all call them.

   A swing s is in points of the two-party margin, positive toward Democrats. Each place holds its actual result
   until the swing carries its margin past zero:
     uniform        every margin moves by s points; a place with margin m flips at s = -m.
     proportional   the side the swing moves away from loses the same fraction of its share everywhere (s/100 of
                    it), so a place where that side is strong loses more points; scaled so a 50-50 place moves by
                    s points, as under uniform swing. A place where the losing side holds share x flips at
                    s = 100 (1 - 1 / 2x).
   Held at the actual result: a race whose top two were not a Democrat against a Republican, one decided some
   other way (ranked choice, a count the two-way figure does not give), and any state the reader locks.
   Control: the Electoral College at 270 (Maine's and Nebraska's district electors held); the Senate at 51, or 50
   with the vice president's party (in a presidential year, the simulated president's); the House at 218. */
export const RANGE = 10;   // the slider runs from 10 points toward Republicans to 10 toward Democrats

// The election day an election belongs to: its year.
export const dayOfYear = (y) => String(y);

export function createSim(simData) {
  const share = (p) => p.D / (p.D + p.R);                      // Democratic share of the two-party vote
  const marginOf = (p) => (2 * share(p) - 1) * 100;             // two-party margin, points, positive Democratic

  // The swing at which a place changes hands (null when it is held).
  const flipAt = (p, rule) => {
    if (p.fixed || !(p.D > 0 && p.R > 0)) return null;
    const d = share(p);
    if (rule === 'p') return p.actual === 'R' ? 100 * (1 - 1 / (2 * (1 - d))) : -100 * (1 - 1 / (2 * d));
    return -marginOf(p);
  };
  // Its margin after the swing.
  const marginAt = (p, s, rule) => {
    if (!(p.D > 0 && p.R > 0)) return p.D > 0 ? 100 : p.R > 0 ? -100 : null;
    const d = share(p);
    if (rule !== 'p') return marginOf(p) + s;
    if (s >= 0) { const r = (1 - d) * (1 - s / 100); return (1 - 2 * r) * 100; }
    const dd = d * (1 + s / 100); return (2 * dd - 1) * 100;
  };
  const winnerAt = (p, s, rule, locked) => {
    if (p.fixed || locked.has(p.st)) return p.actual;
    const f = flipAt(p, rule);
    if (f == null) return p.actual;
    if (p.actual === 'R' && s > f) return 'D';
    if (p.actual === 'D' && s < f) return 'R';
    return p.actual;
  };

  // Every place on an election day: president (one per state), Senate races, House districts (from house.json's
  // year, when the page has it). house: the House track's results for that year (house.now() shape) or null.
  const placesFor = (year, houseNow) => {
    const D = simData.days[year]; if (!D) return null;
    const pres = D.pres ? Object.entries(D.pres.states).map(([st, [d, r, ev]]) => ({ id: 'P:' + st, body: 'pres', st, D: d, R: r, ev, actual: d > r ? 'D' : 'R' })) : null;
    const sen = D.senate.races.map((r) => ({ id: 'S:' + r.id, body: 'sen', st: r.st, race: r.id, D: r.D, R: r.R, actual: r.win, fixed: r.fixed ? r.why : null,
      dName: r.dName, rName: r.rName, winner: r.winner }));
    const house = houseNow ? houseNow.districts.map((x) => {
      const byVotes = x.D > x.R ? 'D' : x.R > x.D ? 'R' : null;
      const fixed = x.reason ? `apart: ${x.reason}` : !x.w ? 'no leader yet' : !(x.D > 0 && x.R > 0) ? 'no Democrat against a Republican' : byVotes !== x.w ? 'decided another way (ranked choice or an override)' : null;
      return { id: `H:${x.st}-${x.n}`, body: 'house', st: x.st, n: x.n, D: x.D, R: x.R, actual: x.w || null, fixed, band: x.band, status: x.status };
    }) : null;
    return { year, day: D, pres, sen, house };
  };

  // Seats and control at swing s.
  const tally = (P, s, rule = 'u', locked = new Set()) => {
    const out = { s, rule };
    const win = (p) => winnerAt(p, s, rule, locked);
    if (P.pres) {
      const fx = P.day.pres.fixedDistricts; let D = fx.D, R = fx.R; const flips = [];
      for (const p of P.pres) { const w = win(p); if (w === 'D') D += p.ev; else R += p.ev; if (w !== p.actual) flips.push(p); }
      out.pres = { D, R, control: D >= 270 ? 'D' : R >= 270 ? 'R' : 'tie', flips, actual: P.day.pres.actual };
    }
    {
      const hd = P.day.senate.holdover; let D = hd.D, R = hd.R, other = 0; const flips = [];
      for (const p of P.sen) { const w = win(p); if (w === 'D') D++; else if (w === 'R') R++; else other++; if (w !== p.actual) flips.push(p); }
      const vp = P.day.senate.vp === 'pres' ? (out.pres ? (out.pres.control === 'tie' ? null : out.pres.control) : null) : P.day.senate.vp;
      const control = D >= 51 || (D === 50 && vp === 'D') ? 'D' : R >= 51 || (R === 50 && vp === 'R') ? 'R' : 'none';
      out.sen = { D, R, other, vp, control, flips, actual: P.day.senate.actual };
    }
    if (P.house) {
      let D = 0, R = 0, und = 0; const flips = [];
      for (const p of P.house) { const w = win(p); if (w === 'D') D++; else if (w === 'R') R++; else und++; if (w && w !== p.actual) flips.push(p); }
      out.house = { D, R, undecided: und, control: D >= 218 ? 'D' : R >= 218 ? 'R' : 'none', flips };
    }
    return out;
  };

  // Where control of each body changes within the slider's range: [{ body, at, control }] (at rounded away from
  // zero to the slider's 0.1 step, so setting the slider to it shows the change).
  const thresholds = (P, rule = 'u', locked = new Set()) => {
    const all = [...(P.pres || []), ...P.sen, ...(P.house || [])].filter((p) => !p.fixed && !locked.has(p.st));
    const pts = [...new Set(all.map((p) => flipAt(p, rule)).filter((f) => f != null && Math.abs(f) <= RANGE))];
    const base = tally(P, 0, rule, locked), out = [];
    for (const dir of [1, -1]) {
      const list = pts.filter((f) => f * dir > 0).sort((a, b) => (a - b) * dir);
      const prev = { pres: base.pres && base.pres.control, sen: base.sen.control, house: base.house && base.house.control };
      for (const f of list) {
        const t = tally(P, f + dir * 1e-6, rule, locked);
        for (const b of ['pres', 'sen', 'house']) {
          if (!t[b] || t[b].control === prev[b]) continue;
          out.push({ body: b, raw: f, at: dir * Math.ceil(Math.abs(f) * 10 - 1e-9) / 10, control: t[b].control, from: prev[b] });
          prev[b] = t[b].control;
        }
      }
    }
    return out.sort((a, b) => a.at - b.at);
  };

  // What flipped at s, each with the swing it took, earliest first (smallest swing).
  const flipped = (P, s, rule, locked, body) => {
    const t = tally(P, s, rule, locked);
    return (t[body] ? t[body].flips : []).map((p) => ({ p, at: flipAt(p, rule) })).sort((a, b) => Math.abs(a.at) - Math.abs(b.at));
  };
  // The next places to flip beyond s in the swing's direction (for the list's faint "next" rows).
  const actualFlips = (p, dir) => (dir > 0 ? p.actual === 'R' : p.actual === 'D');
  const next = (P, s, rule, locked, body, n = 3) => {
    const dir = s < 0 ? -1 : 1, list = P[body] || [];
    return list.filter((p) => !p.fixed && !locked.has(p.st)).map((p) => ({ p, at: flipAt(p, rule) }))
      .filter((x) => x.at != null && x.at * dir > s * dir && actualFlips(x.p, dir))
      .sort((a, b) => (a.at - b.at) * dir).slice(0, n);
  };

  return { placesFor, tally, thresholds, flipAt, marginAt, winnerAt, flipped, next, marginOf, rules: simData.rules };
}
