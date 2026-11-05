/* Colour: one lightness, neutral grey at zero, garnet and sapphire at the ends. Height (and the shading
   the light puts on it) carries votes; colour carries swing or margin through hue and saturation only,
   every colour at one lightness, so the two never compete. d3 is the page's global. */
const L = 54;                              // deep enough for saturated garnet and sapphire
export const NEUTRAL = d3.lab(L, 0, -1.5);
// The most saturated colour at this lightness that the screen can show, for a hue.
const end = (hue, cmax) => { let c = cmax; while (c > 8 && !d3.hcl(hue, c, L).displayable()) c -= 1; return d3.hcl(hue, c, L); };
export const GARNET = end(24, 90), SAPPHIRE = end(264, 90);
export const toward = (x, max) => {        // x > 0 toward the Democrat
  // Square-root easing: a few points of swing already show colour; only true zero stays grey.
  const t = Math.sqrt(Math.min(1, Math.abs(x) / max));
  return d3.interpolateLab(NEUTRAL, x >= 0 ? SAPPHIRE : GARNET)(t);
};
export const SWING_MAX = 26, MARGIN_MAX = 70;
// Weight per vote is not a party measure: its own hue pair, ochre above the national average and teal
// below, at the same lightness, on a doubling scale (log2 of the ratio; WEIGHT_MAX 2 = four times).
const OCHRE = end(72, 90), TEAL = end(196, 90);
export const WEIGHT_MAX = 2;
export const towardW = (x, max) => d3.interpolateLab(NEUTRAL, x >= 0 ? OCHRE : TEAL)(Math.sqrt(Math.min(1, Math.abs(x) / max)));
export const rgb = (c) => { const x = d3.rgb(c); return [x.r, x.g, x.b]; };
export const NODATA = [238, 241, 241];     // close to the ground: no race here, not a value
export const PAGE = [232, 236, 236];       // the ground colour, #E8ECEC
// A colour ramp for the terrain shader: position 0..1 maps to -max..+max of fn.
export const buildRamp = (fn, size = 512) => {
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) { const c = d3.rgb(fn(i / (size - 1) * 2 - 1, 1)); data.set([c.r, c.g, c.b, 255], i * 4); }
  return { data, size };
};
