/* The reader's state, mirrored in the URL hash.
   e election, h height measure, c colour, s shape (terrain | blocks), m smoothing, v camera view,
   d 3d | 2d, u which party is up (net margin), n height scale (area | county), l lens, g ghost of the
   previous race, w view tab, sel the selection: states (s:CA,NV), a rule from a drag (r:, q:, b:) or a
   list of counties (c:). ps: the plausible swing behind the House bands (points, 'state', or empty for the
   default). hc: which History chart (seats: residents per House seat; small: the smallest change; bias: tipping state against the nation; weight: weight
   per vote over time). Simulator: sw the swing (points of margin, positive toward Democrats;
   empty for none; ps or -ps: the plausible swing in force, toward Democrats or Republicans), swr the rule
   (u uniform, p proportional), lock the states held at their actual result (CA,PA), sm which body its map shows.
   Power: pc the chart (rank, tiles, conc), pm what the cartogram's squares are sized by (votes, ev, sen), pk the
   party the concentration marker follows (d, r), pa its horizontal axis (land, counties), pq the marker (1-99).
   ov: the overlay from our research marked on the county views (monitors, detention; empty for none; overlays.js).
   sx: Scatter's chart (empty: change in votes; ms: margin against swing). rb: which Road to 270 bar (pres, sen; empty for
   the office in view). ro: Closest races' office filter (pres, sen, house, gov; empty for all). hk: the county whose History card is pinned to the
   panel (five-digit code; empty for none). mc: the Money chart (time: dollars per decisive vote; lost: outspent and lost; donors: where it came from), md: its decisive votes
   (flip, moved), mm: the money counted (cand, party, out), my: the cycle (all, or a year; empty: all for lost, 2026 for donors). cu: the regional close-up drawer ('sel': the selection; a preset's id from regions.json; empty for none). */
import { parsePs } from './house.js';
export const state = { e: 'pres2024', h: 'total', c: 'margin', s: 'terrain', m: '1', v: 'west', d: '3d', u: 'd', n: 'area', l: 'votes', g: '0', w: 'terrain', sel: '', ps: '', hc: 'seats', sw: '', swr: 'u', lock: '', sm: '', pc: 'rank', pm: 'votes', pk: 'd', pa: 'land', pq: '50', ov: '', sx: '', rb: '', ro: '', hk: '', cu: '', mc: 'time', md: 'flip', mm: 'cand', my: '' };
// Districts and Seats and votes draw the House track (results by district); History draws the long view on any track;
// the others need county results.
export const TABS = ['terrain', 'circles', 'arrows', 'dots', 'scatter', 'strips', 'seats', 'history', 'sim', 'power', 'road', 'closest', 'dropoff', 'split', 'money'];
export const TAB_NAME = { terrain: 'Terrain', circles: 'Circles', arrows: 'Arrows', dots: 'Dots', scatter: 'Scatter', strips: 'Districts', seats: 'Seats and votes', history: 'History', sim: 'Simulator', power: 'Power', road: 'Road to 270', closest: 'Closest races', dropoff: 'Turnout drop-off', split: 'Ticket splitting', money: 'Money' };
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
  if (!['margin', 'swing', 'weight', 'drop'].includes(state.c)) state.c = 'margin';
  state.sel = q.get('sel') || '';
  state.ps = parsePs(q.get('ps') || '');
  if (!['seats', 'small', 'weight', 'bias'].includes(state.hc)) state.hc = 'seats';
  state.sw = q.get('sw') || ''; state.sm = q.get('sm') || '';
  if (!['ps', '-ps'].includes(state.sw)) state.sw = state.sw !== '' && isFinite(+state.sw) && Math.abs(+state.sw) <= 10 && +state.sw !== 0 ? String(+(+state.sw).toFixed(1)) : '';
  if (!['u', 'p'].includes(state.swr)) state.swr = 'u';
  state.lock = (q.get('lock') || '').split(',').filter((x) => /^[A-Z]{2}$/.test(x)).join(',');
  if (!['', 'pres', 'sen', 'house'].includes(state.sm)) state.sm = '';
  if (!['rank', 'tiles', 'conc'].includes(state.pc)) state.pc = 'rank';
  if (!['votes', 'ev', 'sen'].includes(state.pm)) state.pm = 'votes';
  if (!['d', 'r'].includes(state.pk)) state.pk = 'd';
  if (!['land', 'counties'].includes(state.pa)) state.pa = 'land';
  state.pq = String(Math.max(1, Math.min(99, Math.round(+state.pq) || 50)));
  state.sx = q.get('sx') === 'ms' ? 'ms' : '';
  state.rb = ['pres', 'sen'].includes(q.get('rb')) ? q.get('rb') : '';
  state.ro = ['pres', 'sen', 'house', 'gov'].includes(q.get('ro')) ? q.get('ro') : '';
  state.hk = /^\d{5}$/.test(q.get('hk') || '') ? q.get('hk') : '';
  state.cu = /^(sel|[a-z][a-z0-9-]{0,30})$/.test(q.get('cu') || '') ? q.get('cu') : '';
  state.mc = ['time', 'lost', 'donors'].includes(q.get('mc')) ? q.get('mc') : 'time';
  state.md = q.get('md') === 'moved' ? 'moved' : 'flip';
  state.mm = ['party', 'out'].includes(q.get('mm')) ? q.get('mm') : 'cand';
  state.my = /^(all|20(08|10|12|14|16|18|20|22|24|26))$/.test(q.get('my') || '') ? q.get('my') : '';
  state.ov = ['monitors', 'detention'].includes(q.get('ov')) ? q.get('ov') : '';
};
export const toHash = () => history.replaceState(null, '', '#' + new URLSearchParams(state).toString());
