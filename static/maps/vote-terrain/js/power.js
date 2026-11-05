/* The system lens's arithmetic, for the Power tab (views2d/power.js), its table, the saved views' captions and
   the selection rule k: (selection.js). Pure functions over the page's data; owns no DOM.

   Weight per vote (effective.json): each state's electoral weight per vote cast against the national average,
   and its three parts, which multiply back to it (see the About drawer).
   Power cartogram: each state's share of the votes cast in the election in view, of the electoral votes in force,
   and of the Senate's seats. Alaska has no county votes in the page, so it is left out of all three, as it is
   of every national total here.
   Concentration: one party's counties ordered from most of its votes to fewest; how many counties, and how much
   land, it takes to reach a share of that party's votes. */
export const PARTIES = { d: { key: 2, name: 'Democratic', party: 'Democrats' }, r: { key: 1, name: 'Republican', party: 'Republicans' } };

export function createPower({ meta, elections, eff, bal }) {
  const cache = {};
  const memo = (k, f) => (k in cache ? cache[k] : (cache[k] = f()));

  // Weight per vote by state, highest first: [{ st, r, B, N, T }] (null when the election has no effective-vote data).
  const rank = (e) => memo('rank' + e, () => {
    const E = eff.elections[e]; if (!E) return null;
    return Object.entries(E.states).map(([st, [r, B, N, T]]) => ({ st, r, B, N, T })).sort((a, b) => b.r - a.r);
  });

  // Votes cast, the two parties' votes and the electoral votes in force, by state.
  const states = (e) => memo('st' + e, () => {
    const V = {};
    for (const [f, v] of Object.entries(elections[e].data)) {
      const st = meta[f] && meta[f].st; if (!st) continue;
      const x = (V[st] ||= { st, votes: 0, R: 0, D: 0 }); x.votes += v[0]; x.R += v[1]; x.D += v[2];
    }
    const ev = bal.ev[e] || (elections[e].year >= 2022 ? bal.ev.pres2024 : bal.ev.pres2016);
    const rows = Object.values(V).filter((x) => x.votes > 0);
    for (const x of rows) { x.ev = ev[x.st] || 0; x.sen = x.st === 'DC' ? 0 : 2; x.margin = (x.D - x.R) / x.votes * 100; }
    const tot = { votes: 0, ev: 0, sen: 0 };
    for (const x of rows) for (const k in tot) tot[k] += x[k];
    for (const x of rows) {
      x.share = { votes: x.votes / tot.votes, ev: x.ev / tot.ev, sen: x.sen / tot.sen };
      // Each vote's weight in the Electoral College and the Senate, against the average across these states.
      x.evPerVote = x.share.ev / x.share.votes; x.senPerVote = x.share.sen / x.share.votes;
    }
    return { rows, tot, maxShare: Math.max(...rows.flatMap((x) => [x.share.votes, x.share.ev, x.share.sen])) };
  });

  // One party's concentration curve: counties ordered by that party's votes, most first, with cumulative shares
  // of the party's votes, of the counties with results, and of their land. [{ f, cv, cn, ca }]
  const curve = (e, pk) => memo('cv' + e + pk, () => {
    const k = PARTIES[pk].key, d = elections[e].data;
    const fs = Object.keys(d).filter((f) => meta[f] && d[f][0] > 0).sort((a, b) => d[b][k] - d[a][k] || (a < b ? -1 : 1));
    const V = fs.reduce((a, f) => a + d[f][k], 0), A = fs.reduce((a, f) => a + meta[f].sqmi, 0);
    let cv = 0, ca = 0;
    return fs.map((f, i) => { cv += d[f][k]; ca += meta[f].sqmi; return { f, cv: cv / V, cn: (i + 1) / fs.length, ca: ca / A }; });
  });
  // The counties it takes to reach q percent of the party's votes: { n, land (share), counties (share), list }.
  const reach = (e, pk, q) => {
    const C = curve(e, pk); if (!C.length) return null;
    let i = C.findIndex((p) => p.cv >= q / 100 - 1e-12); if (i < 0) i = C.length - 1;
    return { n: i + 1, land: C[i].ca, counties: C[i].cn, of: C.length, list: C.slice(0, i + 1).map((p) => p.f) };
  };
  return { rank, states, curve, reach };
}
