/* Vote terrain page shell. Views of the same counts:
   Terrain (terrain.js, three.js): a smooth surface where each county's volume equals its votes
     (pycnophylactic interpolation, precomputed by build_terrain.mjs).
   Exact counties (blocks.js): each county extruded flat, height = votes / area.
   Circles, Arrows, Dots and Scatter (views2d/): flat views, for phones and for questions a map answers badly.
   The House track (house.js, house.json): results by district, drawn only by Districts and Seats and votes.
   Data from build_data.mjs and the other tools/vote-terrain builders; see tools/vote-terrain/README.md.

   Saved views and tours (views.js, views.json): ?view=<slug> and ?tour=<slug> open a named screen with its caption;
   ?export=1 hides the page's controls for tools/vote-terrain/export.mjs.

   window.__vt exists for the smoke test (tools/vote-terrain/smoke.mjs), the export tool and checks in the console
   only; nothing on the page reads it. */
import { state, TABS, TAB_NAME, LENSES, fromHash, toHash } from './state.js';
import { toward, towardW, buildRamp, GARNET, SAPPHIRE, NEUTRAL, NODATA, SWING_MAX, MARGIN_MAX, WEIGHT_MAX } from './colour.js';
import { reduced, fmt, clamp, countyLabelOf, $ } from './util.js';
import { getJSON, getBin, SNAPSHOT } from './data.js';
import { decodeGeometry } from './geometry.js';
import { createModel } from './model.js';
import { createTooltip } from './tooltip.js';
import { createBalance } from './balance.js';
import { createSelectionCodec } from './selection.js';
import { createFind } from './find.js';
import { createTable } from './table.js';
import { createAbout } from './about.js';
import { createViews2d } from './views2d/index.js';
import { createHouse, PS_MIN, PS_MAX } from './house.js';
import { createSavedViews, askedFor } from './views.js';

// Without WebGL the 3D views cannot draw: the page falls back to a flat view (see noGL) and keeps everything else.
const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
const terrainModule = hasGL ? import('./terrain.js') : null;   // three.js loads alongside the data
const [geoHead, geoBytes, el, bal, eff, houseData, histData] = await Promise.all([getJSON('geometry.json'), getBin('geometry.bin', Uint8Array), ...['elections.json', 'balance.json', 'effective.json', 'house.json', 'history.json'].map(getJSON)]);
const geo = decodeGeometry(geoHead, geoBytes);
// ?view= or ?tour=: the registry of saved views, loaded only when one is asked for.
const ASK = askedFor();
const registry = ASK.view || ASK.tour ? await fetch('views.json').then((r) => r.json()) : null;
if (ASK.exporting) document.body.classList.add('export');
// ?snapshot=<slug>: say so, with the date the data was frozen (snapshot.mjs writes the manifest).
if (SNAPSHOT) getJSON('manifest.json').then((m) => { const n = $('snapNote'); n.textContent = `Frozen data: snapshot ${m.slug}, ${m.created.slice(0, 10)}.`; n.hidden = false; }).catch(() => {});
const { meta, pieces, presets } = geo;
const { order, tracks, sameOffice, elections, notes } = el;
// The House track joins the timeline as its own office; its elections carry no county data.
const house = createHouse({ data: houseData, state, elections });
Object.assign(elections, house.elections); tracks.house = house.ids; order.push(...house.ids);
for (const id of house.ids) sameOffice[id] = null;
const isHouse = house.isHouse;

// A shared link, a saved view or a tour opens still; a first visit spins.
const firstVisit = !location.hash && !ASK.view && !ASK.tour && !ASK.exporting;
// A saved view's state becomes the address hash (keys it leaves out take the defaults), unless the reader's own
// hash is already there (a reload after changing something keeps the change).
const DEFAULTS = { ...state };
const hashFor = (st) => new URLSearchParams({ ...DEFAULTS, ...st }).toString();
const askedView = registry && (ASK.view ? registry.views.find((v) => v.slug === ASK.view)
  : ((t) => t && registry.views.find((v) => v.slug === t.steps[0].view))(registry.tours.find((t) => t.slug === ASK.tour)));
// A view pinned to a snapshot opens on that snapshot's data.
if (askedView && askedView.snapshot && SNAPSHOT !== askedView.snapshot) {
  const q = new URLSearchParams(location.search); q.set('snapshot', askedView.snapshot); location.replace('?' + q + location.hash);
}
if (askedView && !location.hash) history.replaceState(null, '', location.search + '#' + hashFor(askedView.state));
fromHash(order);
let sel = null, selVersion = 0;
const model = createModel({ geo, el, bal, eff, state, selection: () => sel });
const { officeOf, baselineOf, baselineLabel, isWeight, isMargin, weighted, weightsFor, effOf, multFor, effShown } = model;
const tip = createTooltip({ geo, el, bal, state, model });
const { OFFICE_NAME } = tip;

// ---------- camera views shared by both 3D shapes ----------
// The national view is fitted to the space between the panel (left) and the key (right).
const sideSpace = () => {
  if (ASK.exporting) return { left: 16, right: window.innerWidth - document.querySelector('.key').getBoundingClientRect().left + 16, fitHeight: true };
  if (window.innerWidth <= 900) return { left: 0, right: 0 };
  const pr = document.querySelector('.panel').getBoundingClientRect(), kr = document.querySelector('.key').getBoundingClientRect();
  return { left: pr.right + 16, right: window.innerWidth - kr.left + 16 };
};
let glFailed = !hasGL, blocks = null, terrain = null, views = null;
const blocksScene = () => ({ heightOf: model.heightOf, colourOf: model.colourOf, flat: state.d === '2d', key: [state.e, state.h, state.c, state.d, state.n, state.u, selVersion].join('|') });
// Exact counties loads the first time it is shown.
let blocksLoading = null;
const ensureBlocks = () => {
  if (blocks || blocksLoading || glFailed) return;
  blocksLoading = import('./blocks.js').then(({ createBlocks }) => {
    blocks = createBlocks({ container: $('map'), pieces, presets, k: el.k, onHover: tip.hoverCounty,
      initial: { view: state.v, flat: state.d === '2d', side: sideSpace(), scene: blocksScene() } });
    render({ animate: false });
    if (framesSel()) blocks.frame(sel.counties);
  }).catch(() => noGL());
};

// ---------- terrain view (terrain.js) ----------
const terrainState = () => {
  const w = weighted(), b = baselineOf(), pop = state.h === 'pop';
  let countyValue = null;
  if (isWeight()) { countyValue = {}; for (const f in elections[state.e].data) { const x = effOf(f); if (x) countyValue[f] = Math.log2(x.r); } }
  return { ...state, kc: model.kcOf(), mode: isWeight() ? 'value' : isMargin() ? 'margin' : 'swing', weights: w ? w.factor : null,
    baseWeights: w && b ? weightsFor(b, state.h).factor : null,
    countyMult: pop ? multFor(state.e) : null, baseCountyMult: pop && b ? multFor(b) : null, countyValue, valueMax: WEIGHT_MAX };
};
// Why a tab cannot be used for the election in view ('' when it can).
const HOUSE_TABS = ['strips', 'seats'];
const tabWhy = (w) => (w === 'history' ? ''
  : isHouse() && !HOUSE_TABS.includes(w) ? 'needs county results, and House results are by district'
  : !isHouse() && HOUSE_TABS.includes(w) ? 'draws the House by district: choose House above the timeline'
  : w === 'terrain' && glFailed ? 'needs WebGL, which this browser is not providing'
  : (w === 'arrows' || w === 'scatter') && !baselineOf() ? 'needs an earlier race for the same seat, and this election has none in the data' : '');
// The view drawn: the chosen tab, or Circles (Districts on the House track) when that tab cannot draw here.
const effW = () => (!tabWhy(state.w) ? state.w : isHouse() ? 'strips' : 'circles');
const showView = () => {
  const w = effW(), is3d = w === 'terrain', on = is3d && state.s === 'terrain' && terrain;
  if (is3d && state.s !== 'terrain') ensureBlocks();
  $('map').style.display = is3d && !on && blocks ? 'block' : 'none';
  if (terrain) terrain.show(is3d && state.s === 'terrain');
  if (!on) tip.hide();
  document.body.dataset.w = w;   // before drawing: the phone layout gives the flat views more room
  if (views) views.show(is3d ? null : w);
};
// The terrain shows the selection: whole states outlined, selected counties in full colour.
// A saved view frames its selection closer than the Frame button does: the view is about those places.
const terrainSel = (fly, animate = true, fit) => { if (terrain) terrain.highlight(sel && sel.states, { counties: sel && !sel.states ? sel.counties : null, fly, animate, fit, labels: stateLabels() }); };
// Highlighted states are named on the terrain; when they are exactly an election's smallest change (president),
// or a set of its Senate races, each name carries the votes that would have flipped it.
const stateLabels = () => {
  if (!sel || !sel.states) return null;
  const sm = bal.elections[state.e] && bal.elections[state.e].smallest, same = (a) => a && a.length === sel.states.length && a.every((s) => sel.states.includes(s));
  const per = officeOf(state.e) === 'president' && sm && sm.president && same(sm.president.states) ? sm.president.per_state
    : officeOf(state.e) === 'senate' && sm && sm.senate && sm.senate.races && same(sm.senate.races.map((r) => r.state)) ? Object.fromEntries(sm.senate.races.map((r) => [r.state, r.cost])) : null;
  return Object.fromEntries(sel.states.map((st) => [st, balance.stName(st) + (per && per[st] ? `, ${fmt(per[st])} votes` : '')]));
};
// A saved view with a selection opens framed on it (the selected places fully in view at a low angle), not on its camera preset.
const framesSel = () => !!(askedView && askedView.state.sel && sel);
// Metro labels on the terrain: the county that holds each big city, in priority order for crowded views.
const METROS = [['06037', 'Los Angeles'], ['36061', 'New York'], ['17031', 'Chicago'], ['48201', 'Houston'], ['04013', 'Phoenix'],
  ['48113', 'Dallas'], ['53033', 'Seattle'], ['12086', 'Miami'], ['13121', 'Atlanta'], ['42101', 'Philadelphia'], ['08031', 'Denver'],
  ['11001', 'Washington']].map(([f, name]) => ({ f, name }));
if (!glFailed) terrainModule
  .then((m) => m.initTerrain({ container: $('terrain'), geo, ramp: buildRamp(toward), ramp2: buildRamp(towardW), onHover: tip.hoverCounty, labels: METROS,
    locator: $('locator') }))
  .then((t) => { terrain = t; showView(); if (!isHouse()) terrain.setState(terrainState(), { animate: false, base: baselineOf() }); terrain.view(state.v, presets, sideSpace(), false);
    terrainSel(framesSel(), false, 1.15);
    if (firstVisit && state.s === 'terrain' && effW() === 'terrain') terrain.spin(); })
  .catch(() => noGL());
// WebGL missing or lost: switch to Circles, keep the state, say why in the panel.
let noGLDone = false, ready = false;
function noGL() {
  if (noGLDone) return; noGLDone = glFailed = true;
  if (blocks) { blocks.destroy(); blocks = null; }
  if (ready) render({ animate: false });
}
// Tour: fly low over the big metros, naming each county with its votes and margin in the election in view.
const TOUR = ['06037', '04013', '08031', '48113', '48201', '17031', '13121', '11001', '36061'];
const tourBtn = $('tour');
const caption = document.createElement('div'); caption.className = 'tour-caption'; caption.hidden = true; document.body.appendChild(caption);
const endTour = () => { tourBtn.setAttribute('aria-pressed', 'false'); tourBtn.textContent = 'Tour'; caption.hidden = true; if (terrain) terrain.pin(null); };
const startTour = () => {
  if (!terrain || state.s !== 'terrain' || effW() !== 'terrain') return;
  tourBtn.setAttribute('aria-pressed', 'true'); tourBtn.textContent = 'Stop tour';
  terrain.tour(TOUR.map((f) => ({ f })), {
    onStop: (f) => {
      const m = meta[f], v = elections[state.e].data[f];
      if (!m) return;
      terrain.pin(f);
      const lead = v ? (() => { const x = model.margin(v); return (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1); })() : '';
      caption.textContent = countyLabelOf(meta, f) + (v ? `: ${fmt(v[0])} votes, ${lead} (${elections[state.e].label})` : ': no race in this election');
      caption.hidden = false;
    },
    onEnd: endTour,
  });
};
const setCamera = (name, animate = true) => {
  if (effW() !== 'terrain') return;
  if (state.s === 'terrain' && terrain) terrain.view(name, presets, sideSpace(), animate);
  else if (blocks) blocks.view(name, sideSpace(), animate);
};

// ---------- timeline and offices ----------
const timeline = $('timeline');
const parts = (o) => { const w = elections[o].label.split(' '); return { year: w.pop(), office: w.join(' ') }; };
const offices = $('offices');
offices.innerHTML = Object.keys(tracks).map((o) => `<button data-office="${o}">${OFFICE_NAME[o]}</button>`).join('');
let builtTrack = null;
const buildTimeline = () => {
  const o = officeOf(state.e); if (o === builtTrack) return; builtTrack = o;
  timeline.innerHTML = '<button class="nav" id="prev" aria-label="Previous election">‹</button>' +
    tracks[o].map((e) => { const p = parts(e); return `<button class="step" data-e="${e}"><b>${p.year}</b><span>${p.office}</span></button>`; }).join('') +
    '<button class="nav" id="next" aria-label="Next election">›</button>' +
    '<button class="nav" id="play" aria-label="Play through the elections">▶</button>';
};
buildTimeline();
const trk = () => tracks[officeOf(state.e)];
let timer = null;
const go = (i) => { state.e = trk()[clamp(i, 0, trk().length - 1)]; render(); };
offices.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-office]'); if (!b || officeOf(state.e) === b.dataset.office) return;
  if (terrain) terrain.stopMotion();
  stop();
  // Same year where the office had a race; otherwise its latest election.
  const t = tracks[b.dataset.office], yr = elections[state.e].year;
  state.e = t.find((e) => elections[e].year === yr) || t[t.length - 1];
  if (state.c === 'swing' && !sameOffice[state.e]) state.e = t.slice().reverse().find((e) => sameOffice[e]) || state.e;
  render();
});
const stop = () => { clearInterval(timer); timer = null; $('play').textContent = '▶'; };

// ---------- balance of power ----------
const balance = createBalance({ el, bal, state, house, selection: () => sel, onResize: () => { if (views && ready && effW() !== 'terrain') views.redraw(false); } });
const stName = balance.stName;

// ---------- selection: one set of counties shared by every view, kept across elections and tabs ----------
const codec = createSelectionCodec({ geo, el, state, model, stName, house });
// spec: { states } or { counties, rule }; opts.add merges, opts.toggle lets a second click clear it, opts.frame moves the camera to it.
const setSelection = (spec, opts = {}) => {
  sel = codec.next(sel, spec, opts); selVersion++;
  state.sel = codec.encode(sel);
  applySelection(opts);
  toHash();
};
const applySelection = ({ frame = false, fit } = {}) => {
  $('selChip').hidden = !sel;
  if (sel) $('selText').textContent = codec.summary(sel);
  const w = effW();
  terrainSel(frame && !!sel && w === 'terrain' && state.s === 'terrain', true, fit);
  if (w === 'terrain' && (state.s !== 'terrain' || !terrain) && blocks) { if (frame && sel) blocks.frame(sel.counties); blocks.draw(blocksScene()); }
  if (views) { views.redraw(false); if (frame && sel) views.frame([...sel.counties]); }
  const key = sel && sel.states ? sel.states.join(',') : null;
  document.querySelectorAll('.flip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.states === key));
  table.refresh();
};
$('bopBody').addEventListener('click', (ev) => {
  const b = ev.target.closest('.flip'); if (!b) return;
  setSelection({ states: b.dataset.states.split(',') }, { toggle: true, frame: true });
});
$('selClose').addEventListener('click', () => setSelection(null));
$('selFrame').addEventListener('click', () => applySelection({ frame: true }));
// On the 3D maps a click (not a drag) selects the county under the pointer, or clears on empty ground;
// shift-click or a long press adds.
for (const id of ['terrain', 'map']) {
  const el3 = $(id); let down = null, lp = null;
  const pickAt = (x, y) => (id === 'terrain' ? (terrain ? terrain.pick(x, y) : null) : blocks ? blocks.pick(x, y) : null);
  el3.addEventListener('pointerdown', (ev) => {
    down = [ev.clientX, ev.clientY];
    if (ev.pointerType === 'touch') lp = setTimeout(() => { lp = 'fired'; const f = pickAt(down[0], down[1]); if (f) setSelection({ counties: [f] }, { add: true }); }, 550);
  });
  el3.addEventListener('pointermove', (ev) => { if (lp && lp !== 'fired' && down && Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) > 8) { clearTimeout(lp); lp = null; } });
  el3.addEventListener('pointerup', () => { if (lp && lp !== 'fired') { clearTimeout(lp); lp = null; } });
  el3.addEventListener('click', (ev) => {
    if (lp === 'fired') { lp = null; return; }
    if (!down || Math.hypot(ev.clientX - down[0], ev.clientY - down[1]) >= 5) return;
    const f = pickAt(ev.clientX, ev.clientY);
    if (f) setSelection({ counties: [f] }, { add: ev.shiftKey || ev.metaKey || ev.ctrlKey, toggle: true });
    else if (sel) setSelection(null);
  });
}

// ---------- flat views (views2d/): the space between the panel, the key and the timeline ----------
// Circles layouts are loaded per election (or per census, for represented population) the first time they are needed.
const circleCache = {}; let lastCircles = null;
const circlesFor = () => {
  const E = eff.elections[state.e], name = state.h === 'pop' && E ? 'rep' + E.basis : state.e, c = circleCache[name];
  if (c && c.p) return (lastCircles = c);
  if (!c) circleCache[name] = getJSON(`circles-${name}.json`)
    .then((d) => { circleCache[name] = d; if (effW() === 'circles') views.redraw(true); }).catch(() => { delete circleCache[name]; });
  return lastCircles;
};
const region = () => {
  const W = window.innerWidth, box = (q) => document.querySelector(q).getBoundingClientRect();
  // Export: the controls are hidden, so the view takes the window, beside the key.
  if (ASK.exporting) return { left: 16, right: box('.key').left - 16, top: 16, bottom: window.innerHeight - 16 };
  const tw = $('tabWhy'), vc = $('viewCard');
  const top = Math.max((tw.hidden ? box('#tabs') : tw.getBoundingClientRect()).bottom + 10, vc.hidden ? 0 : vc.getBoundingClientRect().bottom + 10);
  if (W <= 640) return { left: 10, right: W - 10, top: Math.max(top, box('.key').bottom + 8, box('#bop').bottom + 8), bottom: box('.panel').top - 8 };
  const right = Math.min(box('.key').left, box('#bop').left);
  return { left: box('.panel').right + 16, right: right - 16, top, bottom: box('#offices').top - 12 };
};
views = createViews2d({
  el: $('v2d'), geo, meta, fmt, region,
  rows: model.rowsNow, mode: () => (baselineOf() ? 'swing' : 'margin'),
  colour: (x, forceMargin) => (x == null ? `rgb(${NODATA})` : toward(x, forceMargin || !baselineOf() ? MARGIN_MAX : SWING_MAX) + ''),
  label: () => elections[state.e].label, baselineLabel,
  hover: tip.hoverCounty, hoverHtml: tip.place,
  tipHtml: tip.countyHtml,
  select: (spec, o = {}) => setSelection(spec && (spec.kind === 'states' ? { states: spec.states } : { counties: spec.counties, rule: spec.rule }), { add: o.add, toggle: true }),
  selection: () => sel,
  viewNote: (t) => { const n = $('viewNote'); n.textContent = t; n.hidden = !t; },
  stateName: stName, key: () => state.e + '|' + baselineOf(),
  circles: () => circlesFor(),
  size: (f) => { const v = elections[state.e].data[f]; return !v ? 0 : state.h === 'pop' ? model.repVotesOf(f) : v[0]; },
  sizeUnit: () => { const E = eff.elections[state.e];
    return state.h === 'pop' && E ? { ref: model.V24 / eff.rep[E.basis].E, label: (n) => `residents apportioned ${n === 1 ? 'one electoral vote' : `${n} electoral votes`}` }
      : { ref: 1, label: (n) => `${fmt(n)} votes` }; },
  fill: (f) => `rgb(${model.colourRaw(f).join(',')})`,
  house: () => house.now(),
  history: () => histData,
  // A History bar: open that election on the map with its smallest-change states selected, as the balance box's line does.
  openElection: (e, states) => { state.e = e; state.w = hasGL ? 'terrain' : 'circles'; render({ animate: false }); setSelection({ states }, { frame: true }); },
  // The states the selection touches: chosen whole, or holding a selected county.
  selectedStates: () => (!sel ? null : new Set(sel.states || [...sel.counties].map((f) => meta[f].st))),
  infoButton: (b, text) => about.infoButton(b, text),
});
window.addEventListener('resize', () => { if (effW() !== 'terrain') views.redraw(false); });
$('tabs').addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-w]'); if (!b || b.disabled) return;
  switchTab(b.dataset.w);
});
const switchTab = (w) => {
  if (terrain) terrain.stopMotion();
  if (tourBtn.getAttribute('aria-pressed') === 'true') endTour();
  state.w = w; render({ animate: false });
  if (effW() === 'terrain') setCamera(state.v, false);
};

// ---------- find, table, read-once text ----------
const find = createFind({ geo, el, ALL_ST: codec.ALL_ST, stName, choose: (spec) => setSelection(spec, { frame: true }) });
const table = createTable({ geo, el, state, model, house, history: histData, selection: () => sel, effW, pctCh: codec.pctCh, OFFICE_NAME, stName });
const about = createAbout({ el, eff, state, tip, selection: () => sel, select: setSelection, stName, house });

function render(opts = {}) {
  buildTimeline();
  document.body.classList.toggle('house', isHouse());
  if (isHouse()) $('lensHow').hidden = true;
  $('psGroup').hidden = !isHouse();
  if (isHouse()) {
    const P = house.plausible();
    $('psRange').value = P.value ?? houseData.plausible.value; $('psRange').disabled = P.mode === 'state';
    $('psOut').textContent = P.mode === 'state' ? 'by state' : `${P.value} pts`;
    document.querySelectorAll('[data-ps]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ps === (P.mode === 'state' ? 'state' : P.mode === 'default' ? 'default' : '')));
    $('psHow').textContent = `${P.mode === 'state' ? 'Each state\'s own median observed swing.' : P.mode === 'default' ? `Default: national median observed swing, ${P.value} points.` : `Set to ${P.value} points; default ${houseData.plausible.value}.`} ${house.howPs()} Moves the at-risk and captured lines in Districts and Seats and votes.`;
  }
  const i = trk().indexOf(state.e);
  offices.querySelectorAll('[data-office]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.office === officeOf(state.e)));
  timeline.querySelectorAll('.step').forEach((s) => s.setAttribute('aria-pressed', s.dataset.e === state.e));
  $('prev').disabled = i === 0;
  $('next').disabled = i === trk().length - 1;
  document.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === state.s));
  document.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === state.m));
  $('smoothGroup').hidden = state.s !== 'terrain';
  $('keyBlocks').hidden = state.s === 'terrain';
  document.querySelectorAll('[data-h]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.h === state.h));
  document.querySelectorAll('[data-u]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.u === state.u));
  $('upRow').hidden = state.h !== 'net';
  document.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.n === state.n));
  $('scaleHow').hidden = state.n !== 'county';
  $('keyTerrain').hidden = state.n === 'county' || state.s !== 'terrain';   // contours and the volume note are per square mile
  if (effW() !== 'terrain') $('keyTerrain').hidden = $('keyBlocks').hidden = true;
  document.querySelectorAll('[data-c]').forEach((b) => {
    b.setAttribute('aria-pressed', b.dataset.c === (isWeight() ? 'weight' : isMargin() ? 'margin' : 'swing'));
    if (b.dataset.c === 'swing') b.disabled = !baselineOf();
  });
  const bo = baselineOf();
  $('swingBtn').textContent = !bo ? 'Swing' : bo === 'senprior' ? 'Swing since last Senate race' : bo === 'govprior' ? 'Swing since last governor\'s race' : `Swing since ${elections[bo].year}`;
  $('swingHow').textContent = !bo ? 'No earlier race for the same seat in the data, so only margin is available.'
    : `Swing compares each county with ${bo === 'senprior' ? 'its state\'s previous race for the same Senate seat (2020 in most states)'
      : bo === 'govprior' ? 'its state\'s previous governor\'s race (2022, or 2024 in New Hampshire and Vermont)'
      : officeOf(state.e) === 'senate' ? 'the 2018 race for the same Senate seats' : officeOf(state.e) === 'governor' ? 'the 2018 governor\'s race in the same states' : 'the previous presidential election'}.`;
  $('flat').setAttribute('aria-pressed', state.d === '2d');
  $('ghost').setAttribute('aria-pressed', state.g === '1');
  $('ghost').disabled = !baselineOf();
  document.querySelectorAll('[data-l]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.l === state.l));
  $('worthRow').hidden = state.l !== 'worth';
  document.querySelectorAll('[data-wh]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.wh === state.h));
  const per = state.n === 'county' ? 'per county' : 'per sq mi', vw = effW();
  $('keyHeight').textContent = vw === 'history' ? 'Dots: each state; line: the national average' : vw === 'strips' ? 'Tick: one district; shading: at risk and contestable' : vw === 'seats' ? 'Point area: districts in the state' : vw === 'dots' ? 'Dot area: votes' : vw === 'scatter' ? 'Circle area: votes' : vw === 'arrows' ? 'Arrow length: swing'
    : vw === 'circles' ? (state.h === 'pop' ? 'Area: represented people' : 'Circle area: votes')
    : state.d === '2d' ? 'Flat map: colour only' : state.h === 'pop' ? 'Height: represented people'
    : state.h === 'net' ? `Height: net margin ${per}` : state.h === 'ev' || state.h === 'sen' ? `Height: votes × ${state.h === 'ev' ? 'electoral' : 'Senate'} weight`
    : `Height: ${{ total: 'votes', dem: 'Democratic votes', rep: 'Republican votes' }[state.h]} ${per}`;
  $('lensState').textContent = state.l === 'custom' ? '(custom view)' : '';
  $('play').classList.toggle('hint', state.l === 'changed');
  document.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.v));

  // Weighted views: one plain sentence in the panel, the extremes in the key.
  const w = weighted(), wh = $('weightHow'), kw = $('keyWeight'), aw = $('aboutWeight');
  wh.hidden = !w && state.h !== 'net' && state.h !== 'pop'; kw.hidden = !w; aw.textContent = '';
  if (isHouse()) wh.hidden = true;
  else if (state.h === 'pop') {
    const E = eff.elections[state.e];
    wh.textContent = `Height is the population each county is apportioned electoral votes for (${E ? E.basis : ''} Census), so a county's volume is its share of the Electoral College whatever its turnout.`;
  } else if (state.h === 'net') {
    // Volume above ground minus volume below is the margin in votes across every county in the map.
    let dem = 0, rep = 0;
    for (const v of Object.values(elections[state.e].data)) { dem += v[2]; rep += v[1]; }
    const up = state.u === 'r' ? 'Republicans' : 'Democrats', down = state.u === 'r' ? 'Democrats' : 'Republicans';
    const net = dem - rep, ahead = net >= 0 ? 'Democrats' : 'Republicans', e = elections[state.e];
    wh.textContent = state.n === 'county'
      ? `Height is each county's net margin in votes: mountains where ${up} won more votes, valleys where ${down} did.`
      : `Height is net votes per square mile: mountains where ${up} won more votes, valleys where ${down} did. Each county's volume is its margin in votes.`;
    aw.textContent = state.n === 'county' ? `Net margin across the counties in this map: ${ahead} +${fmt(Math.abs(net))} votes (${e.label}${e.unofficial ? ', unofficial' : ''}).` : `Mountains minus valleys: ${ahead} +${fmt(Math.abs(net))} votes across the counties in this map (${e.label}${e.unofficial ? ', unofficial' : ''}).`;
  } else if (w) {
    const yr = elections[state.e].year;
    wh.textContent = state.h === 'ev'
      ? 'Height is votes scaled by each state\'s electoral votes per vote cast, against the national average, so a county\'s volume is its share of the Electoral College.'
      : 'Height is votes scaled by each state\'s two Senate seats per vote cast, against the national average, so a county\'s volume is its share of the Senate.';
    kw.textContent = `${w.hi} vote: ${(w.factor[w.hi] / w.factor[w.lo]).toFixed(1)}× ${w.lo}'s`;
    kw.title = aw.textContent = `A vote in ${stName(w.hi)} carries ${(w.factor[w.hi] / w.factor[w.lo]).toFixed(1)} times the ${state.h === 'ev' ? 'electoral' : 'Senate'} weight of one in ${stName(w.lo)} (${yr}, votes cast in this election).`;
  }
  balance.render();

  // Key: it follows the view drawn. Dots and Arrows colour by swing when there is a baseline, Scatter by margin.
  const panelColour = vw === 'terrain' || vw === 'circles', wt = panelColour && isWeight();
  const m = panelColour ? isMargin() : vw === 'scatter' || !baselineOf(), max = m ? MARGIN_MAX : SWING_MAX;
  $('keyTitle').textContent = wt ? 'Weight per vote' : m ? `Margin, ${elections[state.e].label}` : `Swing since ${baselineLabel()}`;
  $('ramp').innerHTML = wt ? d3.range(-WEIGHT_MAX, WEIGHT_MAX + 0.001, WEIGHT_MAX / 6).map((x) => `<i style="background:${towardW(x, WEIGHT_MAX)}"></i>`).join('')
    : d3.range(-max, max + 0.001, max / 6).map((x) => `<i style="background:${toward(x, max)}"></i>`).join('');
  $('rampLabels').innerHTML = wt ? '<span>¼×</span><span>average</span><span>4×</span>' : m
    ? `<span>R+${max}</span><span>even</span><span>D+${max}</span>`
    : `<span>${max} R</span><span>no change</span><span>${max} D</span>`;
  if (vw === 'history') {   // the bars' colour is the winning party, not a margin
    $('keyTitle').textContent = 'Bars: the winner\'s party';
    $('ramp').innerHTML = `<i style="background:${toward(-40, MARGIN_MAX)}"></i><i style="background:${toward(40, MARGIN_MAX)}"></i>`;
    $('rampLabels').innerHTML = '<span>Republican</span><span>Democratic</span>';
  }
  $('rankBtn').hidden = !effShown() || !eff.elections[state.e];
  if (about.isRankOpen()) about.renderRank();

  const e = elections[state.e];
  const n = isHouse() ? [...e.notes] : [notes.AK, notes.CT, notes.KC, notes.VA, ...(officeOf(state.e) === 'president' ? [notes.CERT] : [])];
  if (isHouse()) { /* the House notes stand alone */ } else if (officeOf(state.e) !== 'president') n.unshift(`Pale grey: no ${OFFICE_NAME[officeOf(state.e)].toLowerCase()} race with Democrat-vs-Republican county results in ${e.year}.`, ...(e.notes || []));
  $('notes').textContent = n.map((x) => (/[.)]$/.test(x) ? x : x + '.')).join(' ');
  $('source').textContent = 'Source: ' + e.source + (m ? '' : ` Swing: the Democratic margin minus the margin in ${baselineLabel()}. ` + (baselineOf() === 'senprior' ? elections.senprior.source : ''));
  balance.fit();
  // Tabs: the one drawn is pressed; one that cannot draw is disabled, with its reason on hover and, when chosen, under the tabs.
  document.querySelectorAll('#tabs [data-w]').forEach((b) => { const why = tabWhy(b.dataset.w); b.disabled = !!why; b.title = why ? `${TAB_NAME[b.dataset.w]} ${why}.` : ''; b.setAttribute('aria-pressed', b.dataset.w === vw); });
  const tw = $('tabWhy');
  tw.textContent = vw !== state.w ? `${TAB_NAME[state.w]} ${tabWhy(state.w)}; showing ${TAB_NAME[vw]}.` : ''; tw.hidden = vw === state.w;
  const nt = $('notice');
  nt.hidden = !glFailed;
  if (glFailed) $('locator').style.display = 'none';   // the locator is drawn by the terrain
  nt.textContent = 'This browser is not drawing 3D (WebGL is off or unavailable), so the map is shown as Circles. Everything else works.';
  tourBtn.disabled = vw !== 'terrain';
  $('flat').disabled = vw !== 'terrain';
  $('reset').disabled = vw === 'dots' || vw === 'scatter' || vw === 'history' || HOUSE_TABS.includes(vw);
  if (sel) $('selText').textContent = codec.summary(sel);
  showView();
  if (vw === 'terrain') {
    if (state.s === 'terrain' && terrain) terrain.setState(terrainState(), { animate: opts.animate !== false, base: baselineOf() });
    else if (blocks) blocks.draw(blocksScene());
  } else if (views) views.redraw(opts.animate !== false);
  table.refresh();
  toHash();
}

timeline.addEventListener('click', (ev) => {
  const b = ev.target.closest('button'); if (!b) return;
  if (b.id === 'play') {
    if (timer) return stop();
    if (trk().indexOf(state.e) === trk().length - 1) go(0);
    b.textContent = '❚❚';
    timer = setInterval(() => { const i = trk().indexOf(state.e); if (i >= trk().length - 1) stop(); else go(i + 1); }, reduced ? 2500 : 2000);
    return;
  }
  stop();
  if (b.id === 'prev') go(trk().indexOf(state.e) - 1);
  else if (b.id === 'next') go(trk().indexOf(state.e) + 1);
  else if (b.dataset.e) go(trk().indexOf(b.dataset.e));
});
// Keyboard: ← → elections, 1–4 lenses, V next view, Space play, Esc clear, / find, T table.
document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('select, input, textarea') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  if (k === 'Escape') { if (about.isRankOpen()) about.closeRank(); else if (about.isAboutOpen()) about.closeAbout(); else if (find.isOpen()) find.close(); else if (table.isOpen()) table.close(); else if (sel) setSelection(null); }
  else if (k === 'ArrowLeft') { stop(); go(trk().indexOf(state.e) - 1); }
  else if (k === 'ArrowRight') { stop(); go(trk().indexOf(state.e) + 1); }
  else if (k >= '1' && k <= '4') { if (terrain) terrain.stopMotion(); applyLens(['votes', 'won', 'changed', 'worth'][+k - 1]); }
  else if (k === 'v' || k === 'V') { const ok = TABS.filter((w) => !tabWhy(w)); switchTab(ok[(ok.indexOf(effW()) + 1) % ok.length]); }
  else if (k === ' ' && !ev.target.closest('button, a, summary')) { ev.preventDefault(); $('play').click(); }
  else if (k === '/') { ev.preventDefault(); find.open(); }
  else if (k === 't' || k === 'T') table.toggle();
});
const applyLens = (key) => {
  const L2 = LENSES[key]; if (!L2) return;
  about.lensHint(key);
  Object.assign(state, L2.set, { l: key, v: L2.v });
  // Swing needs an earlier race for the same seat: the latest election on this office's track that has one.
  if (key === 'changed' && !sameOffice[state.e]) state.e = trk().slice().reverse().find((e) => sameOffice[e]) || 'pres2024';
  render(); setCamera(state.v);
};
document.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { if (terrain) terrain.stopMotion(); applyLens(b.dataset.l); }));
document.querySelectorAll('[data-wh]').forEach((b) => b.addEventListener('click', () => { state.h = b.dataset.wh; render(); }));
$('ghost').addEventListener('click', () => { state.g = state.g === '1' ? '0' : '1'; render(); });
// Any control inside Adjust turns the lens into a custom view (the capture runs before the control's own handler).
$('adjust').addEventListener('click', (ev) => { if (ev.target.closest('button')) state.l = 'custom'; }, true);
document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
  state.s = b.dataset.s; render({ animate: false }); setCamera(state.v, false);
}));
document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { state.m = b.dataset.m; render(); }));
document.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { state.h = b.dataset.h; render(); }));
document.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => { state.u = b.dataset.u; render(); }));
document.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { state.n = b.dataset.n; render(); }));
document.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { state.c = b.dataset.c; render(); }));
// The plausible swing: the slider sets points; Default clears it; State observed uses each state's own median.
$('psRange').min = PS_MIN; $('psRange').max = PS_MAX;
$('psRange').addEventListener('input', (ev) => { state.ps = String(+ev.target.value); render({ animate: false }); });
document.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', () => { state.ps = b.dataset.ps === 'state' ? 'state' : ''; render(); }));
document.querySelectorAll('button[data-view]').forEach((b) => b.addEventListener('click', () => {
  state.v = b.dataset.view; render(); setCamera(state.v);
}));
tourBtn.addEventListener('click', () => {
  if (tourBtn.getAttribute('aria-pressed') === 'true') { if (terrain) terrain.stopMotion(); endTour(); } else startTour();
});
// Any control stops the spin or tour, so the reader is never fighting the camera.
document.querySelector('.panel').addEventListener('click', (ev) => { if (terrain && ev.target.id !== 'tour') terrain.stopMotion(); }, true);
timeline.addEventListener('click', () => { if (terrain) terrain.stopMotion(); }, true);
// Reset returns to the lens's own view (From the west for a custom view).
$('reset').addEventListener('click', () => {
  if (effW() === 'arrows' || effW() === 'circles') { views.frame(null); return; }
  state.v = LENSES[state.l] ? LENSES[state.l].v : 'west'; state.d = '3d'; render(); setCamera(state.v);
});
$('flat').addEventListener('click', () => {
  state.d = state.d === '2d' ? '3d' : '2d';
  if ((state.s === 'terrain' && terrain) || !blocks) { render(); setCamera(state.v); return; }
  blocks.tip(state.d === '2d'); render();
});
// A shared link or the back button changes the hash: follow it. A tour step always moves the camera to its view.
const followHash = (forceCamera = false) => {
  const prev = state.v + state.d, prevSel = state.sel; fromHash(order);
  if (state.sel !== prevSel) { sel = codec.decode(state.sel); selVersion++; state.sel = codec.encode(sel); applySelection(); }
  render();
  if (forceCamera || state.v + state.d !== prev) setCamera(state.v);
};
window.addEventListener('hashchange', () => followHash());
// Saved views and tours: the card with the caption; a tour step sets the whole state, as a link would.
const savedViews = registry ? createSavedViews({ registry, bal, eff, houseData, histData, elections, stName,
  apply: (st) => { if (terrain) terrain.stopMotion(); history.replaceState(null, '', location.search + '#' + hashFor(st)); followHash(true); if (st.sel && sel) applySelection({ frame: true, fit: 1.15 }); } }) : null;
if (savedViews) {
  savedViews.setOnResize(() => { if (views && effW() !== 'terrain') views.redraw(false); });
  if (!ASK.exporting) savedViews.open({ view: ASK.view, tour: ASK.tour }, { applyState: false });
}
// Cards: scale the terrain's heights so the tallest peak in view fits the frame, and say so in the key.
const fitHeights = () => {
  if (!terrain || effW() !== 'terrain' || state.s !== 'terrain') return 1;
  const f = terrain.fitHeights();
  const kh = $('keyHeight'); kh.textContent = kh.textContent.replace(/; heights drawn at .*$/, '');
  if (f < 1) kh.textContent += `; heights drawn at ${Math.round(f * 100)}% to fit the card`;
  return f;
};
window.__vt = { state, elections, fitHeights, saved: () => savedViews, meta, house: () => house.now(), terrain: () => terrain, blocks: () => blocks, views: () => views, sel: () => sel, setSelection, effW, tipHtml: tip.countyHtml,
  colours: { GARNET: GARNET + '', SAPPHIRE: SAPPHIRE + '', NEUTRAL: NEUTRAL + '' } };
sel = codec.decode(state.sel); state.sel = codec.encode(sel);
ready = true;
render({ animate: false });
applySelection({ frame: framesSel() });
