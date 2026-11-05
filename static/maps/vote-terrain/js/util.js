/* Small helpers shared by every module. */
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
// A county or county equivalent as the Census Bureau names it: "Kent County, DE", "Acadia Parish, LA",
// "Richmond city, VA" (Virginia's independent cities, Baltimore, St. Louis and Carson City share names with
// counties, so the suffix tells them apart), "District of Columbia, DC". The names in the data carry no suffix;
// Alaska's boroughs and census areas are not in the data (its results are statewide).
const CITIES = new Set(['24510', '29510', '32510']);
export const countyNameOf = (meta, f) => {
  const { n, st } = meta[f];
  if (st === 'DC') return n;
  if (st === 'LA') return n + ' Parish';
  if (st === 'AK') return n;
  if (CITIES.has(f) || (st === 'VA' && +f.slice(2) >= 500)) return /City$/.test(n) ? n : n + ' city';
  return n + ' County';
};
export const countyLabelOf = (meta, f) => `${countyNameOf(meta, f)}, ${meta[f].st}`;
export const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
export const $ = (id) => document.getElementById(id);
