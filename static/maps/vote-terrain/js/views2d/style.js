/* Ink, rules and the fade for counties outside the selection, shared by the flat views. */
export const INK = '#23306B', GRAPHITE = '#5B6168', RULE = 'rgba(35,48,107,0.28)', DIM = 0.35;
// The reference glyph in a map's head keeps one size: its label says what it stands for at the current
// zoom. The largest 1, 2 or 5 times a power of ten not above x.
export const niceBelow = (x) => { const p = 10 ** Math.floor(Math.log10(x)); return [5, 2, 1].map((m) => m * p).find((v) => v <= x) || p; };
