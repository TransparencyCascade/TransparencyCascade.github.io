/* Flips and bellwethers (pure): which counties changed party between two elections, and which voted with the
   national presidential winner in every presidential election in the data. A county's party in an election is the
   side with more of the Democratic and Republican votes there (no party for an exact tie or no result). The
   selection rules f:<from>:<to> and w use these (selection.js); the panel and the saved views' captions read the counts. */
export function createFlips({ elections, meta, bal }) {
  const side = (v) => (v && v[2] !== v[1] ? (v[2] > v[1] ? 'D' : 'R') : null);
  const cache = {};
  const counties = (e) => (elections[e] && !elections[e].house ? elections[e].data : null);
  // Counties with a party in both elections: those that differ, as { f, from, to }, with the counts.
  const flipped = (a, b) => {
    const k = a + '|' + b; if (cache[k]) return cache[k];
    const A = counties(a), B = counties(b), out = { a, b, list: [], both: 0, dToR: 0, rToD: 0, n: 0, votes: 0 };
    if (A && B) for (const f of Object.keys(meta)) {
      const x = side(A[f]), y = side(B[f]); if (!x || !y) continue;
      out.both++;
      if (x !== y) { out.list.push({ f, from: x, to: y }); out.votes += B[f][0]; if (x === 'D') out.dToR++; else out.rToD++; }
    }
    out.n = out.list.length;
    return (cache[k] = out);
  };
  // The presidential elections in the data, in order, and the party each national winner belongs to (balance.json).
  const presIds = () => Object.keys(elections).filter((e) => elections[e].office === 'President' && !elections[e].house).sort((x, y) => elections[x].year - elections[y].year);
  let bellCache = null;
  const bell = () => {
    if (bellCache) return bellCache;
    const ids = presIds(), win = ids.map((e) => bal.elections[e].president.party), out = { ids, win, list: [], of: 0, n: 0, votes: 0 };
    for (const f of Object.keys(meta)) {
      const sides = ids.map((e) => side(elections[e].data[f]));
      if (sides.some((s) => !s)) continue;
      out.of++;
      if (sides.every((s, i) => s === win[i])) { out.list.push({ f }); out.votes += elections[ids[ids.length - 1]].data[f][0]; }
    }
    out.n = out.list.length;
    return (bellCache = out);
  };
  // Elections a pair can be chosen from: those with county results, in the page's order.
  const choices = (order) => order.filter((e) => counties(e));
  return { flipped, bell, side, choices, presIds };
}
