/* Small helpers shared by every module. */
export const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
export const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const list = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
// "Kent County, DE"; Alaska, Louisiana and DC name their county equivalents in full.
export const countyLabelOf = (meta, f) => `${meta[f].n}${/^(AK|LA|DC)$/.test(meta[f].st) ? '' : ' County'}, ${meta[f].st}`;
export const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
export const $ = (id) => document.getElementById(id);
