/* Vote terrain page shell. Views of the same counts:
   Terrain (terrain.js, three.js): a smooth surface where each county's volume equals its votes
     (pycnophylactic interpolation, precomputed by build_terrain.mjs).
   Exact counties (blocks.js): each county extruded flat, height = votes / area.
   Circles, People, Arrows, Swing strips (w=dots) and Scatter (views2d/): flat views, for phones and for questions a map answers badly.
   The House track (house.js, house.json): results by district, drawn only by Districts and Seats and votes.
   Data from build_data.mjs and the other tools/vote-terrain builders; see tools/vote-terrain/README.md.

   The swing simulator (views2d/sim.js, sim.js, simulator.json): one swing for every race on the election day in view.
   Power (views2d/power.js, power.js): weight per vote ranked, the votes/electoral votes/Senate cartogram, concentration.
   Overlays (overlays.js, overlays.json): counties our research marks (DOJ monitors, ICE detention), on every county view,
   with their swing against matched counties in a card in the panel.

   Saved views and tours (views.js, views.json): ?view=<slug> and ?tour=<slug> open a named screen with its caption;
   ?export=1 hides the page's controls for tools/vote-terrain/export.mjs.

   window.__vt exists for the smoke test (tools/vote-terrain/smoke.mjs), the export tool and checks in the console
   only; nothing on the page reads it. */
import { state, TABS, TAB_NAME, LENSES, fromHash, toHash } from './state.js';
import { toward, towardW, buildRamp, GARNET, SAPPHIRE, NEUTRAL, NODATA, SWING_MAX, MARGIN_MAX, WEIGHT_MAX } from './colour.js';
import { reduced, fmt, clamp, countyLabelOf, esc, $ } from './util.js';
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
import { decodePeople, dotCounts } from './people.js';
import { createFunnel, YEARS as FUNNEL_YEARS, RATES as FUNNEL_RATES } from './funnel.js';
import { createSim } from './sim.js';
import { createPower } from './power.js';
import { createOverlays } from './overlays.js';
import { createRaces } from './races.js';
import { createFlips } from './flips.js';
import { createTurnout, DROP_MAX } from './turnout.js';
import { createPlaces } from './places.js';
import { createDrawers } from './drawers.js';
import { SPLIT_MAX } from './views2d/split.js';
import * as ms from './swingview.js';

// Without WebGL the 3D views cannot draw: the page falls back to a flat view (see noGL) and keeps everything else.
const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
const terrainModule = hasGL ? import('./terrain.js') : null;   // three.js loads alongside the data
const [geoHead, geoBytes, el, bal, eff, houseData, histData, ovData, regionData] = await Promise.all([getJSON('geometry.json'), getBin('geometry.bin', Uint8Array), ...['elections.json', 'balance.json', 'effective.json', 'house.json', 'history.json', 'overlays.json', 'regions.json'].map(getJSON)]);
const geo = decodeGeometry(geoHead, geoBytes);
// ?view= or ?tour=: the registry of saved views, loaded only when one is asked for.
const ASK = askedFor();
const registry = ASK.view || ASK.tour ? await fetch('views.json').then((r) => r.json()) : null;
// money.json (860 KB) loads only when something needs it: the Money tab, a saved view that shows money or quotes it in its caption, or the balance box's cost line
// (when the box is open). A snapshot made before the Money tab has no money.json: 'missing', and the tab and the cost line say so.
let moneyData = null, moneyState = 'idle', moneyLoading = null, moneyLoaded = () => {};
// funnel.json (1.4 MB, the voter funnel's EAVS stages by state and county) loads the first time the Funnel tab or its colour is shown, or with a saved view that uses it.
let funnel = null, funnelState = 'idle', funnelLoading = null, funnelLoaded = () => {};
const ensureFunnel = () => {
  if (funnelState === 'idle') {
    funnelState = 'loading';
    funnelLoading = getJSON('funnel.json').then((d) => { funnel = createFunnel({ data: d, eff, elections: el.elections, meta: geo.meta }); funnelState = 'ready'; }, () => { funnelState = 'missing'; }).then(() => funnelLoaded());
  }
  return funnelLoading;
};
let peopleData = null, peopleState = 'idle';   // people.json and people.bin (the dot map's slots): loaded the first time the People tab is shown
const ensureMoney = () => {
  if (moneyState === 'idle') {
    moneyState = 'loading';
    moneyLoading = getJSON('money.json').then((d) => { moneyData = d; moneyState = 'ready'; }, () => { moneyState = 'missing'; }).then(() => moneyLoaded());
  }
  return moneyLoading;
};
if (registry) {
  const askedViews = ASK.view ? [ASK.view] : (registry.tours.find((t) => t.slug === ASK.tour) || { steps: [] }).steps.map((x) => x.view);
  if (askedViews.some((slug) => { const v = registry.views.find((x) => x.slug === slug); return v && /money/.test(JSON.stringify(v)); })) await ensureMoney();
  if (askedViews.some((slug) => { const v = registry.views.find((x) => x.slug === slug); return v && /funnel/.test(JSON.stringify(v)); })) await ensureFunnel();
}
// The simulator's races (simulator.json) load the first time the Simulator is shown, or with the saved views (their captions use it).
let simData = registry ? await getJSON('simulator.json') : null, simLoading = null;
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
let sel = null, selVersion = 0, drawers = null;
const turnout = createTurnout({ elections, meta });
const places = createPlaces({ elections, order: el.order.filter((e) => !house.ids.includes(e)), meta });
const model = createModel({ geo, el, bal, eff, state, selection: () => sel, turnout, funnel: () => funnel });
if (!meta[state.hk]) state.hk = '';
if (state.cu && state.cu !== 'sel' && !regionData.regions.some((r) => r.id === state.cu)) state.cu = '';
const { officeOf, baselineOf, baselineLabel, isWeight, isDrop, isFun, isMargin, weighted, weightsFor, effOf, multFor, effShown } = model;
const tip = createTooltip({ geo, el, bal, state, model, turnout });
const power = createPower({ meta, elections, eff, bal });
const overlays = createOverlays({ data: ovData, meta, elections, sameOffice });
// The overlay in force on a county track (null on the House track, where nothing is drawn by county).
const ovSet = () => (state.ov && !isHouse() ? overlays.sets[state.ov] : null);
tip.setExtra((f) => { const O = ovSet(); return O && O.has(f) ? `<br><span class="ov-sym" style="display:inline-block;margin-right:6px"></span>${overlays.layer(state.ov).short}: ${overlays.detail(state.ov, f)}` : ''; });
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
      initial: { view: state.v, flat: state.d === '2d', side: sideSpace(), scene: blocksScene() }, onLost: () => noGL() });
    render({ animate: false });
    if (framesSel()) blocks.frame(sel.counties);
  }).catch(() => noGL());
};

// ---------- terrain view (terrain.js) ----------
const terrainState = () => {
  const w = weighted(), b = baselineOf(), pop = state.h === 'pop';
  let countyValue = null;
  if (isWeight()) { countyValue = {}; for (const f in elections[state.e].data) { const x = effOf(f); if (x) countyValue[f] = Math.log2(x.r); } }
  else if (isDrop()) { countyValue = {}; for (const f in elections[state.e].data) { const x = turnout.value(f, model.dropYear()); if (x != null) countyValue[f] = x; } }
  else if (isFun() && funnel) { countyValue = {}; for (const f in elections[state.e].data) { const x = funnel.colourValue(f, model.funYear(), state.fs); if (x != null) countyValue[f] = x; } }
  return { ...state, kc: model.kcOf(), mode: isWeight() || isDrop() || isFun() ? 'value' : isMargin() ? 'margin' : 'swing', weights: w ? w.factor : null,
    baseWeights: w && b ? weightsFor(b, state.h).factor : null,
    countyMult: pop ? multFor(state.e) : null, baseCountyMult: pop && b ? multFor(b) : null, countyValue, valueMax: isDrop() ? DROP_MAX : isFun() ? FUNNEL_RATES[state.fs].max : WEIGHT_MAX };
};
// Why a tab cannot be used for the election in view ('' when it can).
const HOUSE_TABS = ['strips', 'seats'];
const tabWhy = (w) => (w === 'money' ? (moneyState === 'missing' ? 'needs money.json, which this snapshot does not have' : '')
  : w === 'funnel' && funnelState === 'missing' ? 'needs funnel.json, which this snapshot does not have'
  : w === 'people' && peopleState === 'missing' ? 'needs people.json, which this snapshot does not have'
  : w === 'history' || w === 'sim' || w === 'road' || w === 'closest' || w === 'funnel' ? ''
  : isHouse() && !HOUSE_TABS.includes(w) ? 'needs county results, and House results are by district'
  : !isHouse() && HOUSE_TABS.includes(w) ? 'draws the House by district: choose House above the timeline'
  : w === 'dropoff' && !turnout.DROP[elections[state.e].year] ? 'compares a midterm year with the presidential year before it: choose 2022 or 2026 in the timeline'
  : w === 'split' && elections[state.e].year !== 2026 ? 'compares the 2026 Senate and governor races: choose 2026 in the timeline'
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
    locator: $('locator'), onLost: () => noGL() }))
  .then((t) => { terrain = t; showView(); terrainMarks(); if (!isHouse()) terrain.setState(terrainState(), { animate: false, base: baselineOf() }); terrain.view(state.v, presets, sideSpace(), false);
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
const balance = createBalance({ el, bal, money: () => moneyData, needMoney: ensureMoney, state, house, selection: () => sel, onResize: () => { if (views && ready && effW() !== 'terrain') views.redraw(false); } });
const stName = balance.stName;

// ---------- phone: the key and the balance box fold to one line each ----------
// The flat views start below the lower of the two, so a fold redraws them.
{
  const phone = window.matchMedia('(max-width: 640px)');
  const parts = [[$('keyBox'), $('keyFold')], [$('bop'), $('bopFold')]];
  const setFold = (box, btn, fold) => { box.classList.toggle('fold', fold); btn.textContent = fold ? '▸' : '▾'; btn.setAttribute('aria-expanded', String(!fold)); };
  const relayout = () => { if (views && ready && effW() !== 'terrain') views.redraw(false); };
  const apply = () => { for (const [box, btn] of parts) { btn.hidden = !phone.matches; setFold(box, btn, phone.matches); } relayout(); };
  for (const [box, btn] of parts) btn.addEventListener('click', () => { setFold(box, btn, !box.classList.contains('fold')); relayout(); });
  phone.addEventListener('change', apply);
  for (const [box, btn] of parts) { btn.hidden = !phone.matches; setFold(box, btn, phone.matches); }
}

// ---------- selection: one set of counties shared by every view, kept across elections and tabs ----------
const flips = createFlips({ elections, meta, bal });
const codec = createSelectionCodec({ geo, el, state, model, stName, house, power, overlays, flips, ms, regions: regionData });
// spec: { states } or { counties, rule }; opts.add merges, opts.toggle lets a second click clear it, opts.frame moves the camera to it.
const setSelection = (spec, opts = {}) => {
  sel = codec.next(sel, spec, opts); selVersion++;
  state.sel = codec.encode(sel);
  applySelection(opts);
  toHash();
};
const applySelection = ({ frame = false, fit } = {}) => {
  $('selChip').hidden = !sel;
  if (state.cu === 'sel' && !sel) state.cu = '';
  if (sel) $('selText').textContent = codec.summary(sel);
  const w = effW();
  terrainSel(frame && !!sel && w === 'terrain' && state.s === 'terrain', true, fit);
  if (w === 'terrain' && (state.s !== 'terrain' || !terrain) && blocks) { if (frame && sel) blocks.frame(sel.counties); blocks.draw(blocksScene()); }
  if (views) { views.redraw(false); if (frame && sel) views.frame([...sel.counties]); }
  const key = sel && sel.states ? sel.states.join(',') : null;
  document.querySelectorAll('.flip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.states === key));
  renderFlips();
  table.refresh();
  if (drawers) drawers.render();
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
  if (ASK.exporting) return { left: 16, right: box('.key').left - 16, top: 4, bottom: window.innerHeight - 4 };   // a card: the map takes the whole image box
  const tw = $('tabWhy'), vc = $('viewCard');
  const top = Math.max((tw.hidden ? box('#tabs') : tw.getBoundingClientRect()).bottom + 10, vc.hidden ? 0 : vc.getBoundingClientRect().bottom + 10);
  if (W <= 640) return { left: 10, right: W - 10, top: Math.max(top, box('.key').bottom + 8, box('#bop').bottom + 8), bottom: box('.panel').top - 8 };
  const dl = drawers.width(), right = Math.min(box('.key').left, box('#bop').left, dl == null ? Infinity : dl);
  return { left: box('.panel').right + 16, right: right - 16, top, bottom: box('#offices').top - 12 };
};
// ---------- the swing simulator (views2d/sim.js, sim.js) ----------
const sim = () => (simData ? (sim.o ||= createSim(simData)) : null);
// ---------- the voter funnel (views2d/funnel.js, funnel.js) ----------
const funnelLabel = (spec) => (!spec ? 'The nation' : spec.states ? spec.states.map(stName).join(', ') : codec.summary(spec));
const funnelCols = () => {
  if (!funnel) return null;
  const year = model.funYear(), A = funnel.describe(year, sel, effOf, funnelLabel(sel)), cols = [A];
  const compare = state.fc === 'n' ? { states: null, nation: true } : state.fc ? { states: [state.fc.slice(2)] } : null;
  if (compare) cols.push(funnel.describe(year, compare.nation ? null : compare, effOf, compare.nation ? 'The nation' : funnelLabel(compare)));
  return cols;
};
const funnelCtx = () => {
  if (funnelState === 'missing') return { error: 'needs funnel.json, which this snapshot does not have' };
  if (!funnel) return null;
  const year = model.funYear(), src = funnel.data.meta.sources.find((x) => x.year === year), E = eff.elections[funnel.electionFor(year)];
  return { year, fs: state.fs, cols: funnelCols(), hasSel: !!sel, placeState: sel && sel.states && sel.states.length === 1 ? sel.states[0] : '', compareState: state.fc === 'n' ? 'n' : state.fc.slice(2),
    source: `U.S. Election Assistance Commission, Election Administration and Voting Survey, ${src ? src.version : year} (eac.gov); item codes in each figure. Residents: ${funnel.basisOf(year)} Census; citizens of voting age: ${E && /ACS/.test(E.cvap) ? E.cvap : 'ACS ' + (E ? E.cvap : 'special tabulation')}. Weight of a vote: ${elections[funnel.electionFor(year)].label}, effective.json. Missing codes (-88, -99, blanks) are missing, never zero. Ballots cast is derived (counted plus rejected, a floor).` };
};
const ensurePeople = () => {
  if (peopleState !== 'idle') return;
  peopleState = 'loading';
  Promise.all([getJSON('people.json'), getBin('people.bin', Uint8Array)]).then(([h, b]) => { peopleData = decodePeople(h, b); peopleState = 'ready'; }, () => { peopleState = 'missing'; })
    .then(() => { if (effW() === 'people' || state.w === 'people') render({ animate: false }); });
};
const ensureSim = () => {
  if (simData || simLoading) return;
  simLoading = getJSON('simulator.json').then((d) => { simData = d; if (['sim', 'road', 'closest'].includes(effW())) { views.redraw(false); table.refresh(); } });
};
const houseCache = {};
const houseFor = (y) => { const k = y + '|' + state.ps; return (houseCache[k] ||= createHouse({ data: houseData, state: { e: 'house' + y, ps: state.ps }, elections }).now()); };
const BAL_DAY = { 2016: 'pres2016', 2018: 'd2018', 2020: 'pres2020', 2022: 'd2022', 2024: 'pres2024', 2026: 'sen2026' };
const simCtx = () => {
  const S = sim(); if (!S) return null;
  const year = String(elections[state.e].year), hasHouse = houseData.years.includes(year);
  const P = S.placesFor(year, hasHouse ? houseFor(year) : null); if (!P) return null;
  const bodies = [...(P.pres ? ['pres'] : []), 'sen', ...(P.house ? ['house'] : [])];
  const def = isHouse() && P.house ? 'house' : officeOf(state.e) === 'president' && P.pres ? 'pres' : 'sen';
  const sm = bodies.includes(state.sm) ? state.sm : def;
  const bh = bal.elections[BAL_DAY[year]] && bal.elections[BAL_DAY[year]].house;
  const held = { house: !P.house && bh && bh.D != null ? { D: bh.D, R: bh.R, why: `no district results in the page for ${year}` } : null };
  const H = hasHouse ? houseFor(year) : null, D = P.day;
  const unofficial = year === '2026' ? `2026 results are unofficial (AP via CNN; Senate as of ${new Date(D.senate.unofficial).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} ET, House as of ${H ? H.asof : ''}); leading candidates count as winners.` : '';
  const sources = 'Sources: ' + [D.pres ? `President: ${D.pres.source}. ${D.pres.note}` : '', `Senate: ${D.senate.source}; seats not on the ballot from ${bal.sources.senate}.${D.senate.note ? ' ' + D.senate.note : ''}`, H ? `House: ${houseData.sources[year]}.` : held.house ? `House: ${bal.sources.house} (seats, held).` : ''].filter(Boolean).join(' ');
  // sw=ps or -ps: the plausible swing in force (House years), so a saved view can stand at it.
  const sw = state.sw === 'ps' || state.sw === '-ps' ? (H && H.plausible.value ? (state.sw === 'ps' ? 1 : -1) * H.plausible.value : 0) : +state.sw || 0;
  return { sim: S, P, year, s: sw, rule: state.swr === 'p' ? 'p' : 'u', locked: new Set(state.lock ? state.lock.split(',') : []), sm, bodies, held,
    label: `Election day ${year}`, unofficial, sources, plausible: H ? (H.plausible.mode === 'state' ? 'each state\'s own median' : `${H.plausible.value} points`) : '' };
};
const setSim = (patch, { quick = false } = {}) => {
  Object.assign(state, patch);
  if (quick) { views.redraw(false); table.refresh(); toHash(); } else render({ animate: false });
};
const toggleLock = (sts, on) => {
  const L = new Set(state.lock ? state.lock.split(',') : []);
  for (const st of sts) { if (on === true || !L.has(st)) L.add(st); else L.delete(st); }
  setSim({ lock: [...L].sort().join(',') });
};
// ---------- Road to 270 and Closest races (views2d/road.js, closest.js; arithmetic in races.js) ----------
const races = createRaces({ simData: () => simData, elections, sameOffice, meta, houseNowFor: (y) => (houseData.years.includes(String(y)) ? houseFor(y) : null), stName });
const roadCtx = () => {
  const S = simCtx(); if (!S) return null;
  const d = simData.days[S.year], bodies = [...(d.pres ? ['pres'] : []), 'sen'];
  const body = bodies.includes(state.rb) ? state.rb : officeOf(state.e) === 'president' && d.pres ? 'pres' : 'sen';
  return { label: S.label, year: S.year, body, bodies, road: races.road(S.year, body), unofficial: S.unofficial, sources: S.sources };
};
const closestCache = {};
const closestCtx = () => {
  const S = simCtx(); if (!S) return null;
  const k = S.year + '|' + state.ps, all = (closestCache[k] ||= races.closest(S.year));
  return { label: S.label, year: S.year, races, office: state.ro, rows: all && (state.ro ? all.filter((r) => r.office === state.ro) : all), unofficial: S.unofficial, sources: S.sources };
};
views = createViews2d({
  el: $('v2d'), geo, meta, fmt, region,
  rows: model.rowsNow, mode: () => (baselineOf() ? 'swing' : 'margin'),
  colour: (x, forceMargin) => (x == null ? `rgb(${NODATA})` : toward(x, forceMargin || !baselineOf() ? MARGIN_MAX : SWING_MAX) + ''),
  label: () => elections[state.e].label, baselineLabel,
  hover: tip.hoverCounty, hoverHtml: tip.place,
  // Turnout drop-off and Ticket splitting (turnout.js): the year in view, its rows, the 2022 band, and the colour switch.
  dropoff: () => { const y = turnout.yearOf(state.e), D = turnout.drop(y); return { D, baseYear: elections[D.base].year, band: y === 2026 ? turnout.band(2022) : null, cmp: y === 2026 ? turnout.compare(2026, 2022) : null }; },
  split: () => turnout.split(), sources: () => `${elections.sen2026.source} ${elections.gov2026.source}`,
  colourDrop: (w) => { state.c = 'drop'; state.l = 'custom'; state.w = w; render({ animate: false }); setCamera(state.v, false); },
  countyLabel: (f) => countyLabelOf(meta, f), extraBottom: () => (ASK.exporting ? drawers.bottom() : 0),
  tipHtml: tip.countyHtml,
  select: (spec, o = {}) => setSelection(spec && (spec.kind === 'states' ? { states: spec.states } : { counties: spec.counties, rule: spec.rule }), { add: o.add, toggle: true, frame: o.frame }),
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
  // Money (views2d/money.js, money.js): the file, the reader's settings (state.mc, md, mm, my) and the switches that change them.
  money: () => moneyData,
  moneyState: () => ({ mc: state.mc, md: state.md, mm: state.mm, my: state.my || (state.mc === 'donors' ? '2026' : 'all'), mg: state.mg, mp: state.mp }),
  // People (views2d/people.js, people.js): the slots, loaded the first time the tab is shown; votes per dot (state.pn).
  people: () => peopleData, peopleN: () => state.pn, setPeople: (patch) => { Object.assign(state, patch); render({ animate: false }); }, electionMeta: () => elections[state.e],
  setMoney: (patch) => { Object.assign(state, patch); render({ animate: false }); },
  // Funnel (views2d/funnel.js, funnel.js): the year (state.fy), the stage rate that colours the maps (state.fs), the comparison (state.fc), the selection as the place.
  funnel: () => funnelCtx(), funnelYears: () => FUNNEL_YEARS, funnelStates: () => (funnel ? funnel.stateIds().map((st) => [st, stName(st)]) : []),
  setFunnel: (patch) => { Object.assign(state, patch); render({ animate: false }); }, funnelElectionLabel: (e) => elections[e].label,
  funnelPlace: (st) => { if (st === '_') return; setSelection(st ? { states: [st] } : null); },
  colourFunnel: (w) => { if (!state.fs) return; state.c = 'fun'; state.l = 'custom'; state.w = w; render({ animate: false }); setCamera(state.v, false); },
  // Which History chart is drawn (state.hc), and the switch that changes it.
  historyChart: () => state.hc,
  setHistoryChart: (k) => { state.hc = k; render({ animate: false }); },
  // A History bar: open that election on the map with its smallest-change states selected, as the balance box's line does.
  openRoad: (e) => { state.e = e; state.w = 'road'; state.rb = 'pres'; render({ animate: false }); },
  openElection: (e, states) => { state.e = e; state.w = hasGL ? 'terrain' : 'circles'; render({ animate: false }); setSelection({ states }, { frame: true }); },
  // The states the selection touches: chosen whole, or holding a selected county.
  selectedStates: () => (!sel ? null : new Set(sel.states || [...sel.counties].map((f) => meta[f].st))),
  infoButton: (b, text) => about.infoButton(b, text),
  sim: () => simCtx(), simRules: () => simData.rules, setSim, toggleLock,
  // Power: the chart and its settings (state.pc, pm, pk, pa, pq) with the arithmetic in power.js.
  election: () => state.e, source: () => elections[state.e].source,
  effSource: () => `Census Bureau decennial counts and the ACS citizen voting-age population tabulation (${eff.elections[state.e] ? eff.elections[state.e].cvap : 'ACS'}); electoral votes: National Archives. Votes: ${elections[state.e].source}`,
  power: () => ({ pc: state.pc, pm: state.pm, pk: state.pk, pa: state.pa, pq: state.pq, calc: power }),
  setPower: (patch) => { Object.assign(state, patch); render({ animate: false }); },
  overlay: ovSet,
  // Road to 270 and Closest races (state.rb, state.ro), and Scatter's second chart (state.sx).
  road: roadCtx, closest: closestCtx, setRoad: (patch) => { Object.assign(state, patch); render(); },
  sx: () => state.sx, setSx: (v) => { state.sx = v; render(); },
  ms: { rows: () => ms.msRows(model.rowsNow(), model.margin), running: ms.running, summarize: ms.summarize, QUADS: ms.QUADS },
});
// Each chart is a picture to a screen reader: name it, and say where its numbers are (the table, T).
{ let queued = false;
  const nameCharts = () => { queued = false; const w = effW(), tn = TAB_NAME[w] || 'Chart', e = elections[state.e];
    document.querySelectorAll('#v2d svg, #v2d canvas').forEach((s) => { const r = s.getBoundingClientRect(); if (r.width < 200 || r.height < 100 || s.closest('button')) return;
      s.setAttribute('role', 'img'); s.setAttribute('aria-label', `${tn} chart${e ? ', ' + e.label : ''}. The same figures are in the table: press T or the Table button.`); }); };
  new MutationObserver(() => { if (!queued) { queued = true; requestAnimationFrame(nameCharts); } }).observe($('v2d'), { childList: true, subtree: true }); }
let panelTab = null;
const setPanelMin = (on) => { $('panel').classList.toggle('min', on); $('panelMin').setAttribute('aria-expanded', String(!on)); $('panelMin').textContent = on ? 'Controls' : 'Hide controls'; };
$('panelMin').addEventListener('click', () => { setPanelMin(!$('panel').classList.contains('min')); if (effW() !== 'terrain') views.redraw(false); else window.dispatchEvent(new Event('resize')); });
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

// ---------- the History card, the close-up drawer and the state drawer (drawers.js) ----------
drawers = createDrawers({ meta, elections, state, places, turnout, regions: regionData, selection: () => sel, select: (spec, o) => setSelection(spec, o), stateName: stName, tip,
  exporting: !!ASK.exporting, shapes: () => views.shapes(), refresh: () => render({ animate: false }), split: () => turnout.split(),
  splitSel: () => (effW() === 'split' && sel && sel.states && sel.states.length === 1 && turnout.split().states.includes(sel.states[0]) ? sel.states[0] : null) });
const openHistory = (f) => { if (!meta[f]) return; tip.hide(); state.hk = f; render({ animate: false }); };
// "History" in a tooltip; a double-click on a county; the H key on the county under the pointer or a single selected county.
tip.el.addEventListener('click', (ev) => { const b = ev.target.closest('.tip-hist'); if (b) openHistory(b.dataset.f); });
document.addEventListener('dblclick', (ev) => { if (!ev.target.closest('#terrain, #map, #v2d')) return; const f = tip.lastCounty(); if (f) openHistory(f); });
// The close-up: "Open close-up" on the selection chip, or a preset region (its counties become the selection).
$('selCloseup').addEventListener('click', () => { state.cu = 'sel'; render({ animate: false }); });
document.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
  const r = regionData.regions.find((x) => x.id === b.dataset.preset); if (!r) return;
  state.cu = r.id; setSelection({ counties: r.counties, rule: 'p:' + r.id }, { frame: true }); render({ animate: false });
}));
document.querySelectorAll('[data-preset]').forEach((b) => { const r = regionData.regions.find((x) => x.id === b.dataset.preset); if (r) b.title = r.definition; });

// ---------- find, table, read-once text ----------
const find = createFind({ geo, el, ALL_ST: codec.ALL_ST, stName, choose: (spec) => setSelection(spec, { frame: true }) });
const table = createTable({ geo, el, state, model, house, history: histData, funnelCols: () => funnelCols(), funnelYear: () => model.funYear(), money: () => moneyData, peopleDots: (f) => { const d = elections[state.e].data[f], c = dotCounts(f, d, +state.pn, peopleData && peopleData.at[f] ? peopleData.at[f].n : Infinity); return c.D + c.R + c.O; }, turnout, places, regions: regionData, areaOf: () => (drawers ? drawers.areaOf() : null), splitSel: () => (effW() === 'split' ? turnout.split() : null), selection: () => sel, effW, pctCh: codec.pctCh, OFFICE_NAME, stName, simCtx: () => simCtx(), power, roadCtx: () => roadCtx(), closestCtx: () => closestCtx(),
  overlays, ovSet, ovSummary: () => $('ovText').textContent });
const about = createAbout({ el, eff, state, tip, selection: () => sel, select: setSelection, stName, house });
// The comparison's method, one click away: the matching, then the unmatched medians for reference.
about.infoButton($('ovInfo'), () => {
  const L = overlays.layer(state.ov), c = L && overlays.compare(state.ov, state.e); if (!L) return '';
  return `${L.rule} Swing: each county's Democratic margin minus its margin in ${baselineLabel() || 'the last race for the same office'}. `
    + `Matched counties: each marked county is set beside the unmarked counties in its state with the same lean (${overlays.bands.lean}) and size (${overlays.bands.size}); `
    + `in each such group the unmarked counties are weighted so the group counts as much as its marked counties. Figures are medians of county swings; counties are not weighted by votes. `
    + (c && c.rawInN ? `Unmatched, for reference: all ${fmt(c.rawInN)} marked counties with a result, ${swingText(c.rawIn)}; all ${fmt(c.rawOutN)} others, ${swingText(c.rawOut)}. ` : '')
    + 'The figures describe the two groups. They do not say why the groups differ.';
});

// ---------- overlays: the card in the panel, the key line and the terrain's marks ----------
let marksKey = null;
const terrainMarks = () => { const O = ovSet(), key = O ? state.ov : ''; if (!terrain || key === marksKey) return; marksKey = key; terrain.marks(O ? [...O] : null); };
const swingText = (x) => `${Math.abs(x).toFixed(1)} points toward the ${x >= 0 ? 'Democrat' : 'Republican'}`;
const renderOverlay = () => {
  document.querySelectorAll('[data-ov]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.ov === state.ov));
  const O = ovSet(), L = O ? overlays.layer(state.ov) : null;
  // Marks are drawn on the Terrain (its smooth shape), Circles, Arrows and Swing strips (the Dots tab, key w=dots); the key names them only there.
  const vw = effW(), marked = vw === 'circles' || vw === 'arrows' || vw === 'dots' || (vw === 'terrain' && state.s === 'terrain');
  $('ovCard').hidden = !O; $('keyOv').hidden = !O || !marked;
  terrainMarks();
  if (!O) return;
  $('keyOvText').textContent = `${L.short}: ${fmt(O.size)} counties`;
  $('ovTitle').textContent = L.name;
  const e = elections[state.e], c = overlays.compare(state.ov, state.e);
  $('ovText').textContent = !c ? `${fmt(O.size)} counties marked. Comparing swing needs an earlier race for the same seat, and ${e.label} has none in the data.`
    : !c.inN ? `${fmt(O.size)} counties marked; ${c.rawInN ? `none of the ${fmt(c.rawInN)} with a result in ${e.label} has a county in the same state, lean and size that is not marked` : `none has a result in ${e.label}`}.`
    : `Median swing since ${baselineLabel()}, ${e.label}${e.unofficial ? ', unofficial' : ''}: marked counties (${fmt(c.inN)}), ${swingText(c.inMed)}; `
      + `unmarked counties of the same state, lean and size (${fmt(c.outN)}), ${swingText(c.outMed)}. Difference ${Math.abs(c.diff).toFixed(1)} points.`
      + (c.unmatched ? ` ${fmt(c.unmatched)} marked ${c.unmatched === 1 ? 'county has' : 'counties have'} no unmarked match.` : '');
  $('ovSource').innerHTML = `<summary>${fmt(O.size)} counties marked; source</summary>${esc(L.rule)} Marked on Terrain (smooth shape), Circles, Arrows and Swing strips. ${esc(L.source)}${L.offMap.length ? ` Not on the county map: ${esc(L.offMap.join('; '))}.` : ''}`;
  $('ovSelect').disabled = false;
};
function render(opts = {}) {
  buildTimeline();
  renderOverlay();
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
    b.setAttribute('aria-pressed', b.dataset.c === (isWeight() ? 'weight' : isDrop() ? 'drop' : isMargin() ? 'margin' : 'swing'));
    if (b.dataset.c === 'swing') b.disabled = !baselineOf();
  });
  const bo = baselineOf();
  $('swingBtn').textContent = !bo ? 'Swing' : bo === 'senprior' ? 'Swing since last Senate race' : bo === 'govprior' ? 'Swing since last governor\'s race' : `Swing since ${elections[bo].year}`;
  const dY = model.dropYear(), dD = turnout.drop(dY), pctF = (x) => (x * 100).toFixed(0) + '%';
  $('dropHow').hidden = !(isDrop() || isFun()) || isHouse();
  if (isFun() && !isHouse()) $('dropHow').textContent = `Colour: ${FUNNEL_RATES[state.fs].label}, EAVS ${model.funYear()}, by county, in percentage points above (ochre) or below (teal) the national rate. A county with a jurisdiction that did not report a figure has none and is pale. A removal or a rejection is not a count of eligible voters turned away. Choose Margin or Swing to leave this colour.`;
  else if (isDrop() && !isHouse()) $('dropHow').textContent = `Colour: ${dY} votes in the top race on the ballot (the Senate, else the governor) as a share of the ${elections[dD.base].year} presidential votes, against the share across all counties shown (${pctF(dD.all)}). Counties show where the election in view has a result; states with no statewide race that year are pale. Choose Governor above the timeline to see the states whose top race was the governor's.`;
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
  if (vw === 'sim' || vw === 'road' || vw === 'closest') ensureSim();
  if (vw === 'money') ensureMoney();
  if (vw === 'people') ensurePeople();
  if (vw === 'funnel' || isFun()) ensureFunnel();
  $('keyHeight').textContent = vw === 'funnel' ? 'Bars: share of residents' : vw === 'people' ? `One dot per ${fmt(+state.pn)} votes` : vw === 'money' ? { time: 'Dots: one Senate race; bars: the median; money and votes side by side', lost: 'Dots: one Senate race; shaded: the bigger spender lost', donors: 'Bars: share of super PAC receipts' }[state.mc] : vw === 'power' ? { rank: 'Bars: three parts on a doubling scale; black tick: their product', tiles: 'Square area: share of ' + { votes: 'votes cast', ev: 'electoral votes', sen: 'Senate seats' }[state.pm], conc: 'Lines: each party\'s votes, biggest counties first' }[state.pc] : vw === 'sim' ? 'Tiles: margin after the swing; outlined: flipped; dashed: locked' : vw === 'road' ? ((r0) => (r0 && r0.body === 'sen' ? 'Segment width: one seat per race; the wide blocks are seats not on the ballot' : 'Segment width: electoral votes'))(roadCtx()) : vw === 'closest' ? 'Rows: races; click a heading to sort' : vw === 'dropoff' ? 'Circle area: votes in the midterm race; band: the 2022 pattern' : vw === 'split' ? 'Tick: one county; dark bar: the state\'s median' : vw === 'history' ? { seats: 'Dots: each state; line: the national average', small: 'Dots: each election, on a log scale', weight: 'Lines: largest against smallest, as a ratio', bias: 'Bars: the tipping state\'s margin minus the nation\'s, in points' }[state.hc] : vw === 'strips' ? 'Tick: one district; shading: at risk and contestable' : vw === 'seats' ? 'Point area: districts in the state' : vw === 'dots' ? 'Dot area: votes' : vw === 'scatter' ? 'Circle area: votes' : vw === 'arrows' ? 'Arrow length: swing'
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
  renderFlips();

  // Key: it follows the view drawn. Dots and Arrows colour by swing when there is a baseline, Scatter by margin.
  const panelColour = vw === 'terrain' || vw === 'circles', wt = panelColour && isWeight();
  const m = panelColour ? isMargin() : vw === 'scatter' || vw === 'sim' || vw === 'power' || vw === 'road' || vw === 'closest' || vw === 'dropoff' || vw === 'split' || !baselineOf(), max = m ? MARGIN_MAX : SWING_MAX;
  $('keyTitle').textContent = wt ? 'Weight per vote' : m ? `Margin, ${elections[state.e].label}` : `Swing since ${baselineLabel()}`;
  $('ramp').innerHTML = wt ? d3.range(-WEIGHT_MAX, WEIGHT_MAX + 0.001, WEIGHT_MAX / 6).map((x) => `<i style="background:${towardW(x, WEIGHT_MAX)}"></i>`).join('')
    : d3.range(-max, max + 0.001, max / 6).map((x) => `<i style="background:${toward(x, max)}"></i>`).join('');
  $('rampLabels').innerHTML = wt ? '<span>¼×</span><span>average</span><span>4×</span>' : m
    ? `<span>R+${max}</span><span>even</span><span>D+${max}</span>`
    : `<span>${max} R</span><span>no change</span><span>${max} D</span>`;
  if (vw === 'sim') $('keyTitle').textContent = 'Margin after the swing';
  if (vw === 'road' || vw === 'closest') $('keyTitle').textContent = 'Two-party margin';
  if (vw === 'history' && (state.hc === 'small' || state.hc === 'bias')) {   // the dots' colour is a party, not a margin
    $('keyTitle').textContent = state.hc === 'bias' ? 'Marks: the party the tipping state leaned toward more than the nation' : 'Dots: the winner\'s party';
    $('ramp').innerHTML = `<i style="background:${toward(-40, MARGIN_MAX)}"></i><i style="background:${toward(40, MARGIN_MAX)}"></i>`;
    $('rampLabels').innerHTML = '<span>Republican</span><span>Democratic</span>';
  } else if (vw === 'history') {   // no colour scale: one ink for the national line or the two ratios
    $('keyTitle').textContent = state.hc === 'seats' ? 'Residents per House seat' : 'Weight per vote';
    $('ramp').innerHTML = ''; $('rampLabels').innerHTML = '';
  }
  if (vw === 'funnel') { $('keyTitle').textContent = `Voter funnel, EAVS ${model.funYear()}`; $('ramp').innerHTML = ''; $('rampLabels').innerHTML = ''; }
  if (vw === 'people') {   // one dot per N votes, coloured by party
    $('keyTitle').textContent = `Dots: ${elections[state.e].label}, one per ${fmt(+state.pn)} votes`;
    $('ramp').innerHTML = `<i style="background:${toward(-40, MARGIN_MAX)}"></i><i style="background:#8C9296"></i><i style="background:${toward(40, MARGIN_MAX)}"></i>`;
    $('rampLabels').innerHTML = '<span>Rep.</span><span>Other</span><span>Dem.</span>';
  }
  if (vw === 'money' && state.mc !== 'donors') {   // dots: the winner's party
    $('keyTitle').textContent = 'Dots: the winner\'s party';
    $('ramp').innerHTML = `<i style="background:${toward(-40, MARGIN_MAX)}"></i><i style="background:${toward(40, MARGIN_MAX)}"></i>`;
    $('rampLabels').innerHTML = '<span>Republican</span><span>Democratic</span>';
  } else if (vw === 'money') { $('keyTitle').textContent = 'Dollars from individual donors'; $('ramp').innerHTML = ''; $('rampLabels').innerHTML = ''; }
  if (vw === 'power' && state.pc === 'conc') {   // the two lines are the two parties
    $('keyTitle').textContent = 'Lines: each party';
    $('ramp').innerHTML = `<i style="background:${toward(-40, MARGIN_MAX)}"></i><i style="background:${toward(40, MARGIN_MAX)}"></i>`;
    $('rampLabels').innerHTML = '<span>Republican</span><span>Democratic</span>';
  } else if (vw === 'power' && state.pc === 'rank') { $('keyTitle').textContent = 'Weight per vote'; $('ramp').innerHTML = ''; $('rampLabels').innerHTML = ''; }
  if (panelColour && isDrop() && !isHouse()) {   // colour: a share against the all-county share, on a doubling scale
    $('keyTitle').textContent = `${dY} votes as a share of ${elections[dD.base].year}'s`;
    $('ramp').innerHTML = d3.range(-DROP_MAX, DROP_MAX + 0.001, DROP_MAX / 6).map((x) => `<i style="background:${towardW(x, DROP_MAX)}"></i>`).join('');
    $('rampLabels').innerHTML = `<span>${pctF(dD.all * 2 ** -DROP_MAX)}</span><span>all: ${pctF(dD.all)}</span><span>${pctF(dD.all * 2 ** DROP_MAX)}</span>`;
  }  if (panelColour && isFun() && !isHouse()) {   // colour: a stage's rate against the national rate, in points
    const R = FUNNEL_RATES[state.fs], F = funnel, nat = F ? F.rateOf(F.aggregate(model.funYear(), null), state.fs) : null, pts = (x) => `${x >= 0 ? '+' : '−'}${Math.abs(x)}`;
    $('keyTitle').textContent = `${R.label}, ${model.funYear()}`;
    $('ramp').innerHTML = d3.range(-R.max, R.max + 0.001, R.max / 6).map((x) => `<i style="background:${towardW(x, R.max)}"></i>`).join('');
    $('rampLabels').innerHTML = `<span>${pts(-R.max)} pts</span><span>national${nat ? ': ' + (nat.rate * 100).toFixed(1) + '%' : ''}</span><span>${pts(R.max)} pts</span>`;
  }

  if (vw === 'split') {   // Senate margin minus governor margin
    $('keyTitle').textContent = 'Senate margin minus governor margin';
    $('ramp').innerHTML = d3.range(-SPLIT_MAX, SPLIT_MAX + 0.001, SPLIT_MAX / 6).map((x) => `<i style="background:${toward(x, SPLIT_MAX)}"></i>`).join('');
    $('rampLabels').innerHTML = `<span>${SPLIT_MAX} R</span><span>agree</span><span>${SPLIT_MAX} D</span>`;
  }
  $('ramp').hidden = $('rampLabels').hidden = (vw === 'money' && state.mc === 'donors') || (vw === 'history' && state.hc !== 'small' && state.hc !== 'bias') || (vw === 'power' && state.pc === 'rank') || vw === 'funnel';
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
  // Phone: the controls panel folds to its title in the flat views, which need the room (the reader's own choice stands until the tab changes).
  if (panelTab !== vw) { panelTab = vw; setPanelMin(window.innerWidth <= 640 && vw !== 'terrain'); }
  const pressed = document.querySelector('#tabs [aria-pressed=true]'); if (pressed && pressed.scrollIntoView && window.innerWidth <= 640) pressed.scrollIntoView({ inline: 'center', block: 'nearest' });
  const tw = $('tabWhy');
  tw.textContent = vw !== state.w ? `${TAB_NAME[state.w]} ${tabWhy(state.w)}; showing ${TAB_NAME[vw]}.` : ''; tw.hidden = vw === state.w;
  const nt = $('notice');
  nt.hidden = !glFailed;
  if (glFailed) $('locator').style.display = 'none';   // the locator is drawn by the terrain
  nt.textContent = 'This browser is not drawing 3D (WebGL is off or unavailable), so the map is shown as Circles. Everything else works.';
  tourBtn.disabled = vw !== 'terrain';
  $('flat').disabled = vw !== 'terrain';
  $('reset').disabled = vw === 'dropoff' || vw === 'split' || vw === 'dots' || vw === 'people' || vw === 'funnel' || vw === 'scatter' || vw === 'road' || vw === 'closest' || vw === 'history' || vw === 'money' || vw === 'sim' || vw === 'power' || HOUSE_TABS.includes(vw);
  if (sel) $('selText').textContent = codec.summary(sel);
  if (drawers) drawers.render();
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
// ---------- flips and bellwethers: the panel's filter over the selection (flips.js; rules f: and w:) ----------
const flipPick = { a: 'pres2020', b: 'pres2024' };
const flipChoices = flips.choices(order);
for (const id of ['flipA', 'flipB']) $(id).innerHTML = flipChoices.map((e) => `<option value="${e}">${elections[e].label}</option>`).join('');
$('flipA').addEventListener('change', (ev) => { flipPick.a = ev.target.value; renderFlips(); });
$('flipB').addEventListener('change', (ev) => { flipPick.b = ev.target.value; renderFlips(); });
// The counties a flips result covers: inside the selection when there is one (the filter turns the selection into its flips).
const within = (list) => (sel ? list.filter((x) => sel.counties.has(x.f)) : list);
const pcn = (n) => `${fmt(n)} ${n === 1 ? 'county' : 'counties'}`;
function renderFlips() {
  if (!$('flipText')) return;
  $('flipA').value = flipPick.a; $('flipB').value = flipPick.b;
  const F = flips.flipped(flipPick.a, flipPick.b), L = within(F.list), same = flipPick.a === flipPick.b;
  const dR = L.filter((x) => x.from === 'D').length, rD = L.length - dR, votes = L.reduce((a, x) => a + elections[flipPick.b].data[x.f][0], 0);
  $('flipText').textContent = same ? 'Choose two different elections.'
    : `${sel ? `Among the ${fmt(sel.counties.size)} selected counties, ${pcn(L.length)}` : `${fmt(L.length)} of ${fmt(F.both)} counties with a Democratic or Republican winner in both elections`} voted for a different party in ${elections[flipPick.b].label} than in ${elections[flipPick.a].label}: ${fmt(rD)} from Republican to Democratic, ${fmt(dR)} from Democratic to Republican; ${fmt(votes)} votes cast in them in ${elections[flipPick.b].label}.`;
  $('flipGo').disabled = same || !L.length;
  const B = flips.bell(), BL = within(B.list);
  $('bellText').textContent = `${sel ? `Among the selected counties, ${pcn(BL.length)}` : `${fmt(BL.length)} of ${fmt(B.of)} counties`} voted with the national presidential winner in every presidential election in the data (${B.ids.map((e, i) => `${elections[e].year} ${B.win[i] === 'D' ? 'Democratic' : 'Republican'}`).join(', ')}).`;
  $('bellGo').disabled = !BL.length;
}
const chooseRule = (kind, list) => {
  const scope = sel ? codec.encode(sel) : '', rule = !sel ? kind : scope ? kind + '/' + scope : null;   // a selection too big to write down leaves the result a plain county list
  setSelection({ counties: list.map((x) => x.f), rule }, { frame: true });
};
$('flipGo').addEventListener('click', () => chooseRule(`f:${flipPick.a}:${flipPick.b}`, within(flips.flipped(flipPick.a, flipPick.b).list)));
$('bellGo').addEventListener('click', () => chooseRule('w', within(flips.bell().list)));
// Keyboard: ← → elections, 1–4 lenses, V next view, Space play, Esc clear, / find, T table.
document.addEventListener('keydown', (ev) => {
  if (ev.target.closest('select, input, textarea') || ev.metaKey || ev.ctrlKey || ev.altKey) return;
  const k = ev.key;
  if (k === 'Escape') { if (about.isRankOpen()) about.closeRank(); else if (about.isAboutOpen()) about.closeAbout(); else if (find.isOpen()) find.close(); else if (table.isOpen()) table.close(); else if (state.cu) { state.cu = ''; render({ animate: false }); } else if (state.hk) { state.hk = ''; render({ animate: false }); } else if (sel) setSelection(null); }
  else if (k === 'ArrowLeft') { stop(); go(trk().indexOf(state.e) - 1); }
  else if (k === 'ArrowRight') { stop(); go(trk().indexOf(state.e) + 1); }
  else if (k >= '1' && k <= '4') { if (terrain) terrain.stopMotion(); applyLens(['votes', 'won', 'changed', 'worth'][+k - 1]); }
  else if (k === 'v' || k === 'V') { const ok = TABS.filter((w) => !tabWhy(w)); switchTab(ok[(ok.indexOf(effW()) + 1) % ok.length]); }
  else if (k === ' ' && !ev.target.closest('button, a, summary')) { ev.preventDefault(); $('play').click(); }
  else if (k === '/') { ev.preventDefault(); find.open(); }
  else if (k === 't' || k === 'T') table.toggle();
  else if (k === 'h' || k === 'H') { const f = tip.lastCounty() || (sel && sel.counties.size === 1 ? [...sel.counties][0] : null); if (f) openHistory(f); }
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
$('adjust').addEventListener('click', (ev) => { if (ev.target.closest('button') && !ev.target.closest('[data-ov]')) state.l = 'custom'; }, true);
// Overlays: one layer at a time; the card's button makes its counties the selection.
document.querySelectorAll('[data-ov]').forEach((b) => b.addEventListener('click', () => { state.ov = b.dataset.ov; render({ animate: false }); }));
$('ovOff').addEventListener('click', () => { state.ov = ''; render({ animate: false }); });
$('ovSelect').addEventListener('click', () => { const O = ovSet(); if (O) setSelection({ counties: [...O], rule: 'o:' + state.ov }, { frame: true }); });
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
const savedViews = registry ? createSavedViews({ registry, bal, eff, houseData, histData, funnel: () => funnel, effOf, money: () => moneyData, simData, elections, stName, power, overlays, flips, meta, ms, sameOffice, turnout, places, regionData,
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
window.__vt = { funnel: () => funnel, funnelCols, ensureFunnel, ensureMoney, state, elections, turnout, places, drawers: () => drawers, openHistory, power, overlays, flips, races, ms, road: () => roadCtx(), closest: () => closestCtx(), sim: () => simCtx(), fitHeights, saved: () => savedViews, meta, house: () => house.now(), terrain: () => terrain, blocks: () => blocks, views: () => views, sel: () => sel, setSelection, effW, tipHtml: tip.countyHtml,
  colours: { GARNET: GARNET + '', SAPPHIRE: SAPPHIRE + '', NEUTRAL: NEUTRAL + '' } };
sel = codec.decode(state.sel); state.sel = codec.encode(sel);
moneyLoaded = () => { if (ready) render({ animate: false }); };
funnelLoaded = () => { if (ready) { render({ animate: false }); table.refresh(); } };
ready = true;
render({ animate: false });
applySelection({ frame: framesSel() });
