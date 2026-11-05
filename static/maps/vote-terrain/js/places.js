/* A place's history across every election in the data (pure): one county's margin and votes, its state's line, and the
   totals and margin of an area (a set of counties). Used by the county history card and the regional close-up. Reads only the
   page's county results (the baseline-only prior-race files are left out). Elections run in time order: by year, then
   President, Senate, Governor. */
const OFFICE_RANK = { President: 0, 'U.S. Senate': 1, Governor: 2 };
const KIND = { President: 'pres', 'U.S. Senate': 'sen', Governor: 'gov' };
export const KIND_NAME = { pres: 'President', sen: 'Senate', gov: 'Governor' };
const marginOf = (v) => (v && v[0] > 0 ? (v[2] - v[1]) / v[0] * 100 : null);

export function createPlaces({ elections, order, meta }) {
  const list = order.filter((e) => elections[e] && !elections[e].house && !elections[e].baselineOnly && KIND[elections[e].office])
    .sort((a, b) => elections[a].year - elections[b].year || OFFICE_RANK[elections[a].office] - OFFICE_RANK[elections[b].office])
    .map((e) => ({ e, year: elections[e].year, kind: KIND[elections[e].office], label: elections[e].label, unofficial: !!elections[e].unofficial }));
  const first = list.find((x) => x.kind === 'pres');          // votes are indexed to the first presidential election in the data
  const countyOf = (f) => list.map((x) => { const v = elections[x.e].data[f] || null; return { ...x, v, m: marginOf(v) }; });
  const statesCache = {};
  // A state's line: over the counties with a result in each election, its margin; votes as a share of the same counties' first presidential votes.
  const stateOf = (st) => statesCache[st] ||= list.map((x) => {
    let n = 0, vt = 0, d = 0, r = 0, base = 0;
    for (const f of Object.keys(meta)) { if (meta[f].st !== st) continue; const v = elections[x.e].data[f]; if (!v || !v[0]) continue; const b = elections[first.e].data[f];
      n++; vt += v[0]; d += v[2]; r += v[1]; base += b ? b[0] : 0; }
    return { ...x, n, votes: vt, m: vt ? (d - r) / vt * 100 : null, index: base ? vt / base * 100 : null };
  });
  const indexOf = (f) => { const b = elections[first.e].data[f]; return (v) => (v && b && b[0] ? v[0] / b[0] * 100 : null); };
  // An area: for each election, the counties of the set with a result, their votes and margin.
  const areaOf = (fs) => list.map((x) => { let n = 0, vt = 0, d = 0, r = 0; for (const f of fs) { const v = elections[x.e].data[f]; if (v && v[0]) { n++; vt += v[0]; d += v[2]; r += v[1]; } }
    return { ...x, n, votes: vt, dem: d, rep: r, m: vt ? (d - r) / vt * 100 : null }; });
  return { list, first, countyOf, stateOf, indexOf, areaOf, marginOf };
}
