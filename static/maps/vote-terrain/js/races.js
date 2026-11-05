/* Races on one election day, as the Road to 270 (and 51) and Closest races views, their tables and the saved
   views' captions read them. Pure: no DOM.

   Where the figures come from: simulator.json (build_simulator.py) holds each election day's certified state
   presidential totals (the FEC files and National Archives electoral votes balance.json uses) and each Senate
   race's top Democratic-side and Republican candidates; house.json holds the districts; governors come from the
   page's county results (Alaska reports none). Margins are the two top candidates' votes, Democratic minus
   Republican; points are that margin over the two candidates' votes together, the way the simulator measures it.
   Votes to flip is balance.json's rule: half the margin plus one, voters switching from the winner to the
   runner-up (floor(margin / 2) + 1).
   Changed hands: the seat's winner against the winner of the previous race for the same office and seat in the
   data (the page's own baseline: President against the earlier election day, a Senate or governor's race against
   its state's previous race, a House district against the same district on the same lines). No earlier race in
   the data: no comparison, said so. */
import { createSim } from './sim.js';

const PARTY = { D: 'Democratic', R: 'Republican' };
export const OFFICES = { pres: 'President', sen: 'Senate', house: 'House', gov: 'Governor' };
export const flipVotes = (margin) => Math.floor(margin / 2) + 1;
const twoPartyPoints = (D, R) => (D > 0 && R > 0 ? (D - R) / (D + R) * 100 : null);   // positive Democratic

export function createRaces({ simData, elections, sameOffice, meta, houseNowFor, stName }) {
  let S = null;
  const sim = () => { const d = simData(); return d ? (S ||= createSim(d)) : null; };

  // ---------- Road to 270 (and 51) ----------
  // body 'pres': 538 electoral votes; 'sen': 100 seats. Segments run from the safest Democratic result to the
  // safest Republican one, with the seats held at their result (Maine's and Nebraska's district electors, the
  // Senate seats not on the ballot, races that were not a Democrat against a Republican) at their party's end.
  const road = (year, body) => {
    const S2 = sim(), d = simData(); if (!S2 || !d || !d.days[year]) return null;
    const day = d.days[year];
    if (body === 'pres') {
      if (!day.pres) return null;
      const fx = day.pres.fixedDistricts;
      const states = Object.entries(day.pres.states).map(([st, [D, R, ev]]) => {
        const m = Math.abs(D - R);
        return { id: st, st, label: st, name: stName(st), size: ev, D, R, win: D > R ? 'D' : 'R', votes: m, points: twoPartyPoints(D, R), flip: flipVotes(m), kind: 'state' };
      }).sort((a, b) => b.points - a.points);
      const held = (win, n) => ({ id: 'held-' + win, label: '', name: `Maine and Nebraska district electors, ${PARTY[win]}`, size: n, win, kind: 'held', points: win === 'D' ? 1e9 : -1e9 });
      const segs = [...(fx.D ? [held('D', fx.D)] : []), ...states, ...(fx.R ? [held('R', fx.R)] : [])];
      return finish({ body, year, need: 270, segs, unit: 'electoral votes', word: 'state' });
    }
    const sen = day.senate, hd = sen.holdover;
    const races = sen.races.map((r) => {
      const special = /special/.test(r.id), fixed = !!r.fixed || !(r.D > 0 && r.R > 0), m = Math.abs(r.D - r.R);
      return { id: r.id, st: r.st, label: r.st + (special ? '*' : ''), name: stName(r.st) + (special ? ' (special election)' : ''), size: 1, D: r.D, R: r.R, win: r.win,
        votes: fixed ? null : m, points: fixed ? null : twoPartyPoints(r.D, r.R), flip: fixed ? null : flipVotes(m), kind: 'race', fixed, called: r.called !== false,
        why: r.fixed || (r.D > 0 && r.R > 0 ? null : 'top two were not a Democrat against a Republican'),
        key: fixed ? (r.win === 'D' ? 1e8 : -1e8) : twoPartyPoints(r.D, r.R) };
    }).sort((a, b) => b.key - a.key);
    const block = (win, n) => ({ id: 'held-' + win, label: '', name: `Seats not on the ballot, ${PARTY[win]}`, size: n, win, kind: 'held' });
    const segs = [block('D', hd.D), ...races, block('R', hd.R)];
    return finish({ body, year, need: 51, segs, unit: 'seats', word: 'race', day });
  };
  // Positions, totals, the winning side's line and the tipping segment.
  const finish = (r) => {
    let x = 0; for (const s of r.segs) { s.x0 = x; x += s.size; s.x1 = x; }
    r.total = x;
    r.D = r.segs.filter((s) => s.win === 'D').reduce((a, s) => a + s.size, 0);
    r.R = r.segs.filter((s) => s.win === 'R').reduce((a, s) => a + s.size, 0);
    let control;
    if (r.body === 'pres') control = r.D >= r.need ? 'D' : r.R >= r.need ? 'R' : 'none';
    else {
      const t = sim().tally(sim().placesFor(r.year, null), 0, 'u').sen;
      control = t.control; r.vp = t.vp; r.counts = { D: t.D, R: t.R };
    }
    r.control = control;
    // The line: the winning side's need, counted from its own end. A chamber held at 50 with the vice president needs 50.
    r.mine = control === 'none' ? null : r.body === 'pres' || (control === 'D' ? r.D : r.R) >= r.need ? r.need : r.need - 1;
    r.lineAt = control === 'D' ? r.mine : control === 'R' ? r.total - r.mine : null;
    // Tipping: the segment holding the winning side's last needed vote (held blocks cannot be it).
    r.tip = null;
    if (control !== 'none') {
      const order = control === 'D' ? r.segs : r.segs.slice().reverse();
      let c = 0;
      for (const s of order) { if (s.win === control) c += s.size; if (c >= r.mine) { if (s.kind !== 'held' && !s.fixed) r.tip = s; break; } }
    }
    // Segments nearest the line by margin (for captions): the tipping one and its neighbours by votes to flip.
    r.byFlip = r.segs.filter((s) => s.flip != null).slice().sort((a, b) => a.flip - b.flip);
    return r;
  };

  // ---------- Closest races ----------
  const prevWinner = (() => {
    const cache = {};
    const sums = (e) => {
      if (cache[e]) return cache[e];
      const out = {}, el = elections[e];
      if (el && !el.house) for (const [f, v] of Object.entries(el.data)) { const st = meta[f] && meta[f].st; if (st) { const o = (out[st] ||= { D: 0, R: 0 }); o.D += v[2]; o.R += v[1]; } }
      return (cache[e] = out);
    };
    return { sums, win: (e, st) => { const o = sums(e)[st]; return o && o.D !== o.R ? (o.D > o.R ? 'D' : 'R') : null; } };
  })();
  const control = (prev, now) => (!now || !prev ? { changed: null, from: prev || null, to: now || null } : { changed: prev !== now, from: prev, to: now });
  const closest = (year) => {
    const d = simData(); if (!d || !d.days[year]) return null;
    const day = d.days[year], rows = [];
    const push = (o) => rows.push(o);
    const mk = (office, st, place, D, R, win, prev, extra = {}) => {
      const two = D > 0 && R > 0, m = Math.abs(D - R);
      push({ office, body: office, st, place, D, R, win, votes: two ? m : null, points: two ? twoPartyPoints(D, R) : null, flip: two ? flipVotes(m) : null, ctl: control(prev, win), ...extra });
    };
    if (day.pres) {
      const earlier = d.days[String(+year - 4)];
      for (const [st, [D, R]] of Object.entries(day.pres.states)) {
        const pe = earlier && earlier.pres && earlier.pres.states[st];
        mk('pres', st, stName(st), D, R, D > R ? 'D' : 'R', pe ? (pe[0] > pe[1] ? 'D' : 'R') : null);
      }
    }
    for (const r of day.senate.races) {
      const special = /special/.test(r.id), be = sameOffice['sen' + year], prev = !special && be ? prevWinner.win(be, r.st) : null;
      mk('sen', r.st, stName(r.st) + (special ? ' (special election)' : ''), r.D, r.R, r.win, prev, { note: r.fixed ? 'held at its result: top two were not a Democrat against a Republican' : r.called === false ? 'leading, not called' : '' });
    }
    const hn = houseNowFor && d.days[year] && houseNowFor(year);
    if (hn) {
      const prevY = String(+year - 2), raw = Object.fromEntries(hn.data.districts.map((x) => [x.st + '-' + x.n, x]));
      for (const x of hn.districts) {
        const rd = raw[x.st + '-' + x.n], samelines = rd && rd.sw && rd.sw.some((v) => v != null) && hn.data.years.includes(prevY) && rd.y[prevY];
        const prev = samelines && rd.y[prevY][4] ? rd.y[prevY][4] : null;
        const why = x.reason ? `apart: ${x.reason}` : !x.w ? 'no leader yet' : '';
        mk('house', x.st, `${x.st}-${x.n}`, x.D, x.R, x.w || null, x.reason ? null : prev, { note: why || (x.status && x.status !== 'final' && x.status !== 'called' ? 'leading, not called' : '') });
      }
    }
    const ge = 'gov' + year;
    if (elections[ge]) {
      const sums = prevWinner.sums(ge), bg = sameOffice[ge];
      for (const [st, o] of Object.entries(sums)) mk('gov', st, stName(st), o.D, o.R, o.D !== o.R ? (o.D > o.R ? 'D' : 'R') : null, bg ? prevWinner.win(bg, st) : null, { note: 'sum of the county results' });
    }
    return rows;
  };

  // Rows as the view and the table show them (filter by office, sorted by votes to flip unless asked).
  const label = (r) => (r.ctl.changed == null ? '' : r.ctl.changed ? `${PARTY[r.ctl.from]} to ${PARTY[r.ctl.to]}` : `held, ${PARTY[r.ctl.to]}`);
  const summary = (year) => {
    const rows = closest(year); if (!rows) return null;
    const ranked = rows.filter((r) => r.flip != null).sort((a, b) => a.flip - b.flip);
    const cmp = rows.filter((r) => r.ctl.changed != null);
    return { n: rows.length, ranked, first: ranked[0], second: ranked[1], third: ranked[2], compared: cmp.length, changed: cmp.filter((r) => r.ctl.changed).length };
  };
  return { road, closest, summary, label, PARTY, OFFICES };
}
