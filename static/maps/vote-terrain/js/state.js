/* The reader's state, mirrored in the URL hash.
   e election, h height measure, c colour, s shape (terrain | blocks), m smoothing, v camera view,
   d 3d | 2d, u which party is up (net margin), n height scale (area | county), l lens, g ghost of the
   previous race, w view tab, sel the selection: states (s:CA,NV), a rule from a drag (r:, q:, b:) or a
   list of counties (c:). ps: the plausible swing behind the House bands (points, 'state', or empty for the
   default). */
import { parsePs } from './house.js';
export const state = { e: 'pres2024', h: 'total', c: 'margin', s: 'terrain', m: '1', v: 'west', d: '3d', u: 'd', n: 'area', l: 'votes', g: '0', w: 'terrain', sel: '', ps: '' };
// Districts and Seats and votes draw the House track (results by district); History draws the long view on any track;
// the others need county results.
export const TABS = ['terrain', 'circles', 'arrows', 'dots', 'scatter', 'strips', 'seats', 'history'];
export const TAB_NAME = { terrain: 'Terrain', circles: 'Circles', arrows: 'Arrows', dots: 'Dots', scatter: 'Scatter', strips: 'Districts', seats: 'Seats and votes', history: 'History' };
// Lenses: one question each, setting several controls at once. Changing any control in Adjust makes the view "custom".
export const LENSES = {
  votes: { set: { n: 'area', h: 'total', c: 'margin', g: '0', d: '3d' }, v: 'national',
    how: 'Height is votes per square mile and colour is the margin. Each county holds exactly its votes, so big empty counties lie flat and dense ones rise.' },
  won: { set: { n: 'area', h: 'net', u: 'd', c: 'margin', g: '0', d: '3d' }, v: 'west',
    how: 'Mountains are where Democrats won more votes than Republicans, valleys where Republicans did. Their volumes net to the margin across the map.' },
  changed: { set: { n: 'area', h: 'total', c: 'swing', g: '1', d: '3d' }, v: 'west',
    how: 'Colour is the swing since the last race for the same office. The faint grid is that race\'s land: where it shows above the surface, fewer votes were cast this time. Press play to step through the elections.' },
  worth: { set: { n: 'area', h: 'ev', c: 'weight', g: '0', d: '3d' }, v: 'national',
    how: 'Height is votes scaled by each state\'s share of the Electoral College (or of the Senate) per vote cast, or the population each county is apportioned for. Colour is the electoral weight of one vote cast there, against the national average.' },
};

export const fromHash = (order) => {
  const q = new URLSearchParams(location.hash.slice(1));
  for (const key of Object.keys(state)) if (q.get(key)) state[key] = q.get(key);
  if (!order.includes(state.e)) state.e = 'pres2024';
  if (!['terrain', 'blocks'].includes(state.s)) state.s = 'terrain';
  if (!['1', '8'].includes(state.m)) state.m = '1';
  if (!LENSES[state.l] && state.l !== 'custom') state.l = 'votes';
  if (!['0', '1'].includes(state.g)) state.g = '0';
  // Phones open on Circles: the flat view that reads at that width.
  if (!q.get('w') && window.innerWidth <= 640) state.w = 'circles';
  if (!TABS.includes(state.w)) state.w = 'terrain';
  if (!['margin', 'swing', 'weight'].includes(state.c)) state.c = 'margin';
  state.sel = q.get('sel') || '';
  state.ps = parsePs(q.get('ps') || '');
};
export const toHash = () => history.replaceState(null, '', '#' + new URLSearchParams(state).toString());
