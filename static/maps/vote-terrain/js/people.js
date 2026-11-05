/* People (pure): the dot map's slots and counts. people.json + people.bin (tools/vote-terrain/build_people.mjs) hold, for every county, slots placed where
   people live (2020 census tracts); an election's county totals say how many of a county's slots are drawn, and in which party's colour.
   One dot per N votes (500, 1,000 or 5,000). A county's dots for each party are its votes over N, rounded up or down at random with a fixed
   seed per county and party, so the total over many counties is not biased toward the big counties (a county with 400 votes has a dot at N = 1,000
   in 4 builds out of 10, never always or never). The first slots are Democratic, then Republican, then other: slots are in random order, so which
   slots they are says nothing about neighbourhoods; the dots show how many people a county's votes stand for and where in the county people live,
   not where each party's voters live. */
export const PER = [500, 1000, 5000];
export const PARTIES = ['D', 'R', 'O'];

/** The slots as one array of x, y pairs (unsigned 16-bit) with each county's first slot and slot count. head: people.json; bytes: people.bin as Uint8Array. */
export function decodePeople(head, bytes) {
  if (head.format !== 'vt-people-1') throw new Error('people.json: unknown format ' + head.format);
  if (bytes.length !== head.slots * 4) throw new Error(`people.bin: ${bytes.length} bytes, expected ${head.slots * 4}`);
  const xy = new Uint16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length)), at = {};
  let s = 0;
  head.counties.forEach((f, i) => { at[f] = { first: s, n: head.counts[i] }; s += head.counts[i]; });
  const [x0, y0, x1, y1] = head.bounds;
  return { head, xy, at, bounds: head.bounds, x: (q) => x0 + (q / head.q) * (x1 - x0), y: (q) => y0 + (q / head.q) * (y1 - y0) };
}

// A fixed number in [0, 1) for a county and party (seeded by their codes, the same in every browser).
const unit = (f, i) => { let h = (Math.imul(+f, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0; h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0; h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** Dots for a county: v = [votes, Republican, Democratic] as in elections.json; returns { D, R, O } counts for one dot per N votes, never more than the slots allow. */
export const dotCounts = (f, v, N, slots = Infinity) => {
  if (!v || !v[0]) return { D: 0, R: 0, O: 0 };
  const vote = { D: v[2], R: v[1], O: Math.max(0, v[0] - v[1] - v[2]) }, out = {};
  let left = slots;
  PARTIES.forEach((p, i) => { const c = Math.min(left, Math.floor(vote[p] / N + unit(f, i))); out[p] = c; left -= c; });
  return out;
};

/** All of an election's dots for one dot per N votes: counts by party, the total and the votes they stand for. */
export const totals = (data, N) => {
  const t = { per: N, D: 0, R: 0, O: 0, dots: 0, votes: 0, counties: 0 };
  for (const [f, v] of Object.entries(data)) { const c = dotCounts(f, v, N); t.D += c.D; t.R += c.R; t.O += c.O; t.votes += v[0]; t.counties++; }
  t.dots = t.D + t.R + t.O;
  return t;
};
