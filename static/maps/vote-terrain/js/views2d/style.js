/* Ink, rules and the fade for counties outside the selection, shared by the flat views. */
export const INK = '#23306B', GRAPHITE = '#5B6168', RULE = 'rgba(35,48,107,0.28)', DIM = 0.35;
// The reference glyph in a map's head keeps one size: its label says what it stands for at the current
// zoom. The largest 1, 2 or 5 times a power of ten not above x.
export const niceBelow = (x) => { const p = 10 ** Math.floor(Math.log10(x)); return [5, 2, 1].map((m) => m * p).find((v) => v <= x) || p; };

// A state tile grid (column, row).
export const TILES = { AK: [0, 0], ME: [11, 0], VT: [10, 1], NH: [11, 1], WA: [1, 2], ID: [2, 2], MT: [3, 2], ND: [4, 2], MN: [5, 2], IL: [6, 2], WI: [7, 2], MI: [8, 2],
  NY: [9, 2], RI: [10, 2], MA: [11, 2], OR: [1, 3], NV: [2, 3], WY: [3, 3], SD: [4, 3], IA: [5, 3], IN: [6, 3], OH: [7, 3], PA: [8, 3], NJ: [9, 3], CT: [10, 3],
  CA: [1, 4], UT: [2, 4], CO: [3, 4], NE: [4, 4], MO: [5, 4], KY: [6, 4], WV: [7, 4], VA: [8, 4], MD: [9, 4], DE: [10, 4], AZ: [2, 5], NM: [3, 5], KS: [4, 5],
  AR: [5, 5], TN: [6, 5], NC: [7, 5], SC: [8, 5], DC: [9, 5], OK: [4, 6], LA: [5, 6], MS: [6, 6], AL: [7, 6], GA: [8, 6], HI: [0, 7], TX: [4, 7], FL: [9, 7] };
