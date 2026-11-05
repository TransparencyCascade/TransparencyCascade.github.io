/* Vote terrain page shell. Two views of the same counts:
   Terrain (terrain.js, three.js): a smooth surface where each county's volume equals its votes
     (pycnophylactic interpolation, precomputed by build_terrain.mjs).
   Exact counties (here, deck.gl): each county extruded flat, height = votes / area.
   Data from build_data.mjs: geometry.json (pre-projected, equal-area) and elections.json.

   Encoding: height (and the shading the light puts on it) carries votes; colour carries swing or margin
   through hue and saturation only, every colour at one lightness, so the two never compete. */
(async function () {
  const [geo, el, bal] = await Promise.all(['geometry.json', 'elections.json', 'balance.json'].map((u) => fetch(u).then((r) => r.json())));
  const { meta, pieces, presets } = geo;
  const { order, tracks, sameOffice, k, elections, notes } = el;
  // Office tracks: the timeline shows the elections of the office in view.
  const officeOf = (e) => Object.keys(tracks).find((o) => tracks[o].includes(e)) || 'president';
  const OFFICE_NAME = { president: 'President', senate: 'Senate', governor: 'Governor' };
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');
  const countyLabel = (f) => `${meta[f].n}${/^(AK|LA|DC)$/.test(meta[f].st) ? '' : ' County'}, ${meta[f].st}`;
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- state, mirrored in the URL hash ----------
  // w: the view tab; sel: the selection, as states (s:CA,NV), a rule from a drag (r:, q:, b:) or a list of counties (c:).
  const state = { e: 'pres2024', h: 'total', c: 'margin', s: 'terrain', m: '1', v: 'west', d: '3d', u: 'd', n: 'area', l: 'votes', g: '0', w: 'terrain', sel: '' };
  const TABS = ['terrain', 'arrows', 'dots', 'scatter'], TAB_NAME = { terrain: 'Terrain', arrows: 'Arrows', dots: 'Dots', scatter: 'Scatter' };
  // Lenses: one question each, setting several controls at once. Changing any control in Adjust makes the view "custom".
  const LENSES = {
    votes: { set: { n: 'area', h: 'total', c: 'margin', g: '0', d: '3d' }, v: 'national',
      how: 'Height is votes per square mile and colour is the margin. Each county holds exactly its votes, so big empty counties lie flat and dense ones rise.' },
    won: { set: { n: 'area', h: 'net', u: 'd', c: 'margin', g: '0', d: '3d' }, v: 'west',
      how: 'Mountains are where Democrats won more votes than Republicans, valleys where Republicans did. Their volumes net to the margin across the map.' },
    changed: { set: { n: 'area', h: 'total', c: 'swing', g: '1', d: '3d' }, v: 'west',
      how: 'Colour is the swing since the last race for the same office. The faint grid is that race\'s land: where it shows above the surface, fewer votes were cast this time. Press play to step through the elections.' },
    worth: { set: { n: 'area', h: 'ev', c: 'margin', g: '0', d: '3d' }, v: 'national',
      how: 'Height is votes scaled by each state\'s share of the Electoral College (or of the Senate) per vote cast. Small states rise; large ones sink.' },
  };
  let sel = null, selVersion = 0;                      // the reader's selection: { states: [..] | null, counties: Set, rule }
  const firstVisit = !location.hash;                    // a shared link opens still; a first visit spins
  const fromHash = () => {
    const q = new URLSearchParams(location.hash.slice(1));
    for (const key of Object.keys(state)) if (q.get(key)) state[key] = q.get(key);
    if (!order.includes(state.e)) state.e = 'pres2024';
    if (!['terrain', 'blocks'].includes(state.s)) state.s = 'terrain';
    if (!['1', '8'].includes(state.m)) state.m = '1';
    if (!LENSES[state.l] && state.l !== 'custom') state.l = 'votes';
    if (!['0', '1'].includes(state.g)) state.g = '0';
    if (!TABS.includes(state.w)) state.w = 'terrain';
    state.sel = q.get('sel') || '';
  };
  const toHash = () => history.replaceState(null, '', '#' + new URLSearchParams(state).toString());
  fromHash();

  // ---------- colour: one lightness, neutral grey at zero, garnet and sapphire at the ends ----------
  const L = 54;                              // deep enough for saturated garnet and sapphire
  const NEUTRAL = d3.lab(L, 0, -1.5);
  // The most saturated colour at this lightness that the screen can show, for a hue.
  const end = (hue, cmax) => { let c = cmax; while (c > 8 && !d3.hcl(hue, c, L).displayable()) c -= 1; return d3.hcl(hue, c, L); };
  const GARNET = end(24, 90), SAPPHIRE = end(264, 90);
  const toward = (x, max) => {               // x > 0 toward the Democrat
    // Square-root easing: a few points of swing already show colour; only true zero stays grey.
    const t = Math.sqrt(Math.min(1, Math.abs(x) / max));
    return d3.interpolateLab(NEUTRAL, x >= 0 ? SAPPHIRE : GARNET)(t);
  };
  const SWING_MAX = 26, MARGIN_MAX = 70;
  const rgb = (c) => { const x = d3.rgb(c); return [x.r, x.g, x.b]; };
  const NODATA = [238, 241, 241];          // close to the ground: no race here, not a value

  const margin = (v) => (v && v[0] ? (v[2] - v[1]) / v[0] * 100 : null);   // Democratic minus Republican, points
  // Swing is always against the last race for the same office: president against president, each 2026
  // Senate seat against its own previous race.
  const baselineOf = () => sameOffice[state.e] || null;
  const isMargin = () => state.c === 'margin' || !baselineOf();
  const swingOf = (f) => {
    const b = baselineOf(); if (!b) return null;
    const m1 = margin(elections[state.e].data[f]), m0 = margin(elections[b].data[f]);
    return m1 == null || m0 == null ? null : m1 - m0;
  };
  // Exact counties: outside a highlight, colours fade toward the page.
  const colourOf = (f) => {
    const c = colourRaw(f);
    if (!sel || sel.counties.has(f)) return c;
    return c.map((x, i) => Math.round(x + ([232, 236, 236][i] - x) * 0.65));   // outside the selection: 35% of the colour
  };
  const colourRaw = (f) => {
    const v = elections[state.e].data[f];
    if (!v) return NODATA;
    if (isMargin()) return rgb(toward(margin(v), MARGIN_MAX));
    const s = swingOf(f); return s == null ? NODATA : rgb(toward(s, SWING_MAX));
  };
  // ---------- power weights: a state's electoral votes (or two Senate seats) per vote cast, against the average ----------
  // Average over the states with results in the election in view (Alaska has no county data and is left out).
  const weightCache = {};
  const weightsFor = (e, kind) => {
    const key = e + kind; if (weightCache[key]) return weightCache[key];
    const V = {};
    for (const [f, v] of Object.entries(elections[e].data)) { const st = meta[f] && meta[f].st; if (st) V[st] = (V[st] || 0) + v[0]; }
    // Electoral votes in force: the 2010 apportionment through the 2020 elections, the 2020 one from 2022.
    const ev = bal.ev[e] || (elections[e].year >= 2022 ? bal.ev.pres2024 : bal.ev.pres2016);
    const S = Object.keys(V).filter((st) => V[st] > 0 && (kind === 'ev' ? ev[st] > 0 : st !== 'DC'));
    const sumV = S.reduce((a, st) => a + V[st], 0), sumP = kind === 'ev' ? S.reduce((a, st) => a + ev[st], 0) : 2 * S.length;
    const factor = {};
    for (const st of S) factor[st] = ((kind === 'ev' ? ev[st] : 2) / V[st]) / (sumP / sumV);
    const ranked = S.slice().sort((a, b) => factor[b] - factor[a]);
    return (weightCache[key] = { factor, hi: ranked[0], lo: ranked[ranked.length - 1], n: S.length });
  };
  const weighted = () => (state.h === 'ev' || state.h === 'sen' ? weightsFor(state.e, state.h) : null);
  const votesOf = (f) => {
    const v = elections[state.e].data[f]; if (!v) return 0;
    const w = weighted(); if (w) return v[0] * (w.factor[meta[f].st] || 0);
    // Net margin: Democratic minus Republican votes, signed so the chosen party's wins stand up.
    if (state.h === 'net') return (v[2] - v[1]) * (state.u === 'r' ? -1 : 1);
    return state.h === 'dem' ? v[2] : state.h === 'rep' ? v[1] : v[0];
  };
  // Per-county scale: height proportional to the county's own total, the largest county in any election
  // standing as tall as the densest county does per square mile.
  const KC = (() => { let mx = 0; for (const o of order) for (const v of Object.values(elections[o].data)) mx = Math.max(mx, v[0]); return el.maxHeight / mx; })();
  // Net margin per county is scaled to the largest county margin of either party, so both sides fill the height.
  const KCN = (() => { let mx = 0; for (const o of order) for (const v of Object.values(elections[o].data)) mx = Math.max(mx, Math.abs(v[2] - v[1])); return el.maxHeight / mx; })();
  const kcOf = () => (state.h === 'net' ? KCN : KC);
  const heightOf = (f) => (state.d === '2d' ? 0 : state.n === 'county' ? kcOf() * votesOf(f) : k * votesOf(f) / meta[f].a);
  // ---------- reference blocks: 1,000,000 votes on two footprints ----------
  const REF = 1000000, [rx, ry] = presets.ref.target;
  const square = (cx, cy, s) => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]];
  const refs = [{ s: 9, x: rx - 34 }, { s: 22, x: rx + 12 }].map((r) => ({ p: square(r.x, ry, r.s), h: k * REF / (r.s * r.s), x: r.x }));

  // ---------- camera: drag pans; shift-drag tilts and turns, inside limits so the map cannot flip ----------
  const view = new deck.OrbitView({ orbitAxis: 'Z', fovy: 40 });
  const Z0 = presets.national.zoom;
  const LIMITS = { minZoom: Z0 - 1.2, maxZoom: Z0 + 5, minTilt: 8, maxTilt: 88, maxTurn: 180 };
  const EDGE_ZOOM = Z0 + 1.1;               // county edges appear once zoomed in past the national view
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const constrain = (vs) => ({
    ...vs,
    zoom: clamp(vs.zoom, LIMITS.minZoom, LIMITS.maxZoom),
    rotationX: state.d === '2d' ? 90 : clamp(vs.rotationX, LIMITS.minTilt, LIMITS.maxTilt),
    rotationOrbit: clamp(vs.rotationOrbit, -LIMITS.maxTurn, LIMITS.maxTurn),
  });
  // The national view is fitted to the space between the panel (left) and the key (right); the
  // projection is 975 units wide. Other presets keep their zoom and are nudged to the same centre.
  const sideSpace = () => {
    if (window.innerWidth <= 900) return { left: 0, right: 0 };
    const pr = document.querySelector('.panel').getBoundingClientRect(), kr = document.querySelector('.key').getBoundingClientRect();
    return { left: pr.right + 16, right: window.innerWidth - kr.left + 16 };
  };
  // Close-ups look in at a lower, more oblique angle, so their blocks stand against the horizon.
  // rotationX: 90 looks straight down; lower is more oblique.
  // West and east look across the country from low on the horizon, so heights read as a skyline.
  const LOOK = { national: { tilt: 42 }, west: { tilt: 14, orbit: 90, across: true }, east: { tilt: 14, orbit: -90, across: true },   // deck's orbit sign is opposite three.js's
                 texas: { tilt: 30, zoom: 1.45 }, maine: { tilt: 34, zoom: 1.9 } };
  const camera = (name, animate = true) => {
    const look = LOOK[name] || { tilt: 42 }, p = presets[name] || presets.national, { left, right } = sideSpace();
    const avail = Math.max(320, window.innerWidth - left - right);
    const zoom = name === 'national' ? Math.log2(avail * 1.08 / 975) : look.across ? Math.log2(avail * 0.95 / 610) : look.zoom ?? p.zoom;
    const shift = (left - right) / 2 / 2 ** zoom;
    return { target: [p.target[0] - shift, p.target[1] - (state.d === '2d' ? 0 : 18 / 2 ** zoom), 0], zoom, rotationX: state.d === '2d' ? 90 : look.tilt, rotationOrbit: state.d === '2d' ? 0 : look.orbit || 0,
      transitionDuration: reduced || !animate ? 0 : 900, transitionInterpolator: new deck.LinearInterpolator(['target', 'zoom', 'rotationX', 'rotationOrbit']) };
  };
  let viewState = camera(state.v, false);
  const transitions = reduced ? {} : { getElevation: { duration: 800 }, getFillColor: { duration: 800 } };

  // Matte paper lit from the north-west: each side of a block takes a different shade.
  const lighting = new deck.LightingEffect({
    ambient: new deck.AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
    key: new deck.DirectionalLight({ color: [255, 252, 246], intensity: 0.75, direction: [1, 1.6, -2.2] }),
  });
  const PAPER = { ambient: 0.82, diffuse: 0.42, shininess: 2, specularColor: [8, 8, 8] };   // tops near true colour, sides shaded

  const sunk = (p, h) => (Array.isArray(p[0][0]) ? p.map((ring) => ring.map((q) => [q[0], q[1], h])) : p.map((q) => [q[0], q[1], h]));
  function layers() {
    const trig = [state.e, state.h, state.c, state.d, selVersion];
    const terrainOn = state.s === 'terrain';
    return [
      new deck.PolygonLayer({
        // A county that sinks (net margin) is drawn with its base below ground, extruded up to ground level.
        id: 'counties', visible: !terrainOn, data: pieces, extruded: true, wireframe: viewState.zoom > EDGE_ZOOM, pickable: true,
        getPolygon: (d) => { const h = heightOf(d.f); return h < 0 ? sunk(d.p, h) : d.p; },
        getElevation: (d) => Math.abs(heightOf(d.f)), getFillColor: (d) => colourOf(d.f),
        getLineColor: [35, 48, 107, 34], material: PAPER,
        updateTriggers: { getPolygon: trig, getElevation: trig, getFillColor: trig }, transitions,
      }),
      new deck.SolidPolygonLayer({
        id: 'refs', data: refs, visible: !terrainOn && state.d !== '2d', getPolygon: (d) => d.p, extruded: true,
        getElevation: (d) => d.h, getFillColor: rgb(NEUTRAL), material: PAPER,
      }),
      new deck.TextLayer({
        id: 'ref-labels', data: [{ x: rx - 12, y: ry - 26, t: '1,000,000 votes each' }], visible: !terrainOn && state.d !== '2d',
        getPosition: (d) => [d.x, d.y, 0], getText: (d) => d.t, getSize: 14, getColor: [35, 48, 107],
        fontFamily: 'Courier Prime, monospace', billboard: true,
      }),
    ];
  }
  // Without WebGL the 3D views cannot draw: the page falls back to a flat view (see noGL) and keeps everything else.
  const hasGL = (() => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } })();
  let glFailed = !hasGL, deckgl = null;
  if (hasGL) try { deckgl = new deck.Deck({
    parent: document.getElementById('map'), views: view, effects: [lighting], onError: () => noGL(),
    controller: { dragMode: 'pan', inertia: 250, keyboard: false, scrollZoom: { speed: 0.01, smooth: true } },
    onViewStateChange: ({ viewState: vs }) => {
      const edges = viewState.zoom > EDGE_ZOOM;
      viewState = constrain(vs);
      deckgl.setProps(edges !== viewState.zoom > EDGE_ZOOM ? { viewState, layers: layers() } : { viewState });
      return viewState;
    },
    viewState, layers: layers(), getTooltip: tooltip,
    parameters: { clearColor: [232 / 255, 236 / 255, 236 / 255, 1] },
  }); } catch (e) { glFailed = true; deckgl = null; }
  const dk = (props) => { if (deckgl) deckgl.setProps(props); };

  // ---------- terrain view (terrain.js) ----------
  const tip = document.createElement('div');
  tip.className = 'deck-tooltip vt-tip'; tip.hidden = true; document.body.appendChild(tip);
  const onHover = (f, x, y) => {
    if (!f) { tip.hidden = true; return; }
    placeTip(tooltip({ object: { f }, layer: { id: 'counties' } }).html, x, y);
  };
  const placeTip = (html, x, y) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    // Below-right of the pointer, flipping above or left when it would run off screen or over the timeline.
    const tl = document.getElementById('timeline').getBoundingClientRect();
    const floor = Math.min(window.innerHeight, tl.top) - 8;
    tip.style.left = (x + 14 + w > window.innerWidth - 8 ? Math.max(8, x - 14 - w) : x + 14) + 'px';
    tip.style.top = (y + 14 + h > floor ? Math.max(8, y - 14 - h) : y + 14) + 'px';
  };
  // The colour ramp the terrain shader samples: position 0..1 maps to -max..+max.
  const buildRamp = (size = 512) => {
    const data = new Uint8Array(size * 4);
    for (let i = 0; i < size; i++) { const c = d3.rgb(toward(i / (size - 1) * 2 - 1, 1)); data.set([c.r, c.g, c.b, 255], i * 4); }
    return { data, size };
  };
  let terrain = null, views = null;
  const terrainState = () => {
    const w = weighted(), b = baselineOf();
    return { ...state, kc: kcOf(), mode: isMargin() ? 'margin' : 'swing', weights: w ? w.factor : null,
      baseWeights: w && b ? weightsFor(b, state.h).factor : null };
  };
  // Why a tab cannot be used for the election in view ('' when it can).
  const tabWhy = (w) => (w === 'terrain' && glFailed ? 'needs WebGL, which this browser is not providing'
    : (w === 'arrows' || w === 'scatter') && !baselineOf() ? 'needs an earlier race for the same seat, and this election has none in the data' : '');
  // The view drawn: the chosen tab, or a flat view when that tab cannot draw here.
  const effW = () => (!tabWhy(state.w) ? state.w : state.w === 'terrain' && baselineOf() ? 'arrows' : 'dots');
  const showView = () => {
    const w = effW(), is3d = w === 'terrain', on = is3d && state.s === 'terrain' && terrain;
    document.getElementById('map').style.display = is3d && !on && deckgl ? 'block' : 'none';
    if (terrain) terrain.show(is3d && state.s === 'terrain');
    if (!on) tip.hidden = true;
    document.body.dataset.w = w;   // before drawing: the phone layout gives the flat views more room
    if (views) views.show(is3d ? null : w);
  };
  // The terrain shows the selection: whole states outlined, selected counties in full colour.
  const terrainSel = (fly) => { if (terrain) terrain.highlight(sel && sel.states, { counties: sel && !sel.states ? sel.counties : null, fly }); };
  if (!glFailed) (window.VTTerrain ? Promise.resolve() : new Promise((r) => window.addEventListener('vt-terrain-ready', r, { once: true })))
    .then(() => window.VTTerrain.init({ container: document.getElementById('terrain'), geo, ramp: buildRamp(), onHover, labels: METROS,
      locator: document.getElementById('locator') }))
    .then((t) => { terrain = t; showView(); terrain.setState(terrainState(), { animate: false, base: baselineOf() }); terrain.view(state.v, presets, sideSpace(), false);
      terrainSel(false);
      if (firstVisit && state.s === 'terrain' && effW() === 'terrain') terrain.spin(); })
    .catch(() => noGL());
  // WebGL missing or lost: switch to Dots (or Arrows when there is a baseline), keep the state, say why in the panel.
  function noGL() {
    if (noGL.done) return; noGL.done = glFailed = true;
    if (deckgl) { try { deckgl.finalize(); } catch (e) { /* already gone */ } deckgl = null; }
    if (render.ready) render({ animate: false });
  }
  // Metro labels on the terrain: the county that holds each big city, in priority order for crowded views.
  const METROS = [['06037', 'Los Angeles'], ['36061', 'New York'], ['17031', 'Chicago'], ['48201', 'Houston'], ['04013', 'Phoenix'],
    ['48113', 'Dallas'], ['53033', 'Seattle'], ['12086', 'Miami'], ['13121', 'Atlanta'], ['42101', 'Philadelphia'], ['08031', 'Denver'],
    ['11001', 'Washington']].map(([f, name]) => ({ f, name }));
  // Tour: fly low over the big metros, naming each county with its votes and margin in the election in view.
  const TOUR = ['06037', '04013', '08031', '48113', '48201', '17031', '13121', '11001', '36061'];
  const tourBtn = () => document.getElementById('tour');
  const caption = document.createElement('div'); caption.className = 'tour-caption'; caption.hidden = true; document.body.appendChild(caption);
  const endTour = () => { tourBtn().setAttribute('aria-pressed', 'false'); tourBtn().textContent = 'Tour'; caption.hidden = true; if (terrain) terrain.pin(null); };
  const startTour = () => {
    if (!terrain || state.s !== 'terrain' || effW() !== 'terrain') return;
    tourBtn().setAttribute('aria-pressed', 'true'); tourBtn().textContent = 'Stop tour';
    terrain.tour(TOUR.map((f) => ({ f })), {
      onStop: (f) => {
        const m = meta[f], v = elections[state.e].data[f];
        if (!m) return;
        terrain.pin(f);
        const lead = v ? (() => { const x = margin(v); return (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1); })() : '';
        caption.textContent = `${m.n}${/^(AK|LA|DC)$/.test(m.st) ? '' : ' County'}, ${m.st}` + (v ? `: ${fmt(v[0])} votes, ${lead} (${elections[state.e].label})` : ': no race in this election');
        caption.hidden = false;
      },
      onEnd: endTour,
    });
  };
  const setCamera = (name, animate = true) => {
    if (effW() !== 'terrain') return;
    if (state.s === 'terrain' && terrain) terrain.view(name, presets, sideSpace(), animate);
    else { viewState = camera(name, animate); dk({ viewState }); }
  };

  function tooltip({ object, layer }) {
    if (!object || layer.id !== 'counties') return null;
    const f = object.f, m = meta[f], e = elections[state.e], v = e.data[f];
    const head = `<b>${m.n}${/^(AK|LA)$/.test(m.st) ? '' : ' County'}, ${m.st}</b><br>`;
    if (!v) {
      const why = m.st === 'AK' ? notes.AK : officeOf(state.e) === 'president' ? 'No result in the source for this county.'
        : `No Democrat-vs-Republican ${OFFICE_NAME[officeOf(state.e)].toLowerCase()} race with county results here in ${elections[state.e].year} (see the notes in the panel).`;
      return { html: head + why };
    }
    const mg = margin(v), s = swingOf(f), b = baselineOf();
    const lead = (x) => (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1);
    return { html: head + `${e.label}${e.unofficial ? ' (unofficial)' : ''}<br>` +
      `${fmt(v[0])} votes, ${fmt(v[0] / m.sqmi)} per square mile<br>` +
      `Republican ${fmt(v[1])}, Democratic ${fmt(v[2])}<br>Margin ${lead(mg)}` +
      (s != null ? `<br>Swing since ${baselineLabel(m.st)}: ${Math.abs(s).toFixed(1)} points toward the ${s >= 0 ? 'Democrat' : 'Republican'}` : '') +
      (weighted() ? `<br>${state.h === 'ev' ? 'Electoral' : 'Senate'} weight of a vote in ${bal.stateNames[m.st] || m.st}: ${(weighted().factor[m.st] || 0).toFixed(2)} times the average` : '') +
      `<br><span style="color:#5B6168">${e.source}</span>` };
  }

  // ---------- controls ----------
  const timeline = document.getElementById('timeline');
  const parts = (o) => { const w = elections[o].label.split(' '); return { year: w.pop(), office: w.join(' ') }; };
  const offices = document.getElementById('offices');
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
  // "the 2020 Senate race" for a state, or "President 2020".
  const baselineLabel = (st) => {
    const b = baselineOf(); if (!b) return '';
    if (b === 'senprior') return st && elections.senprior.priorYears[st] ? `the ${elections.senprior.priorYears[st]} Senate race` : 'the previous Senate race';
    if (b === 'govprior') return st && elections.govprior.priorYears[st] ? `the ${elections.govprior.priorYears[st]} governor's race` : 'the previous governor\'s race';
    return elections[b].label;
  };

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
  const stop = () => { clearInterval(timer); timer = null; document.getElementById('play').textContent = '▶'; };

  // ---------- balance of power ----------
  const D_COL = d3.rgb(SAPPHIRE) + '', R_COL = d3.rgb(GARNET) + '';
  const pct = (n, total) => (n / total * 100).toFixed(2) + '%';
  const bar = (d, r, total, unc = 0) => `<div class="bar" role="img" aria-label="Democrats ${d}, Republicans ${r}${unc ? `, ${unc} not called` : ''}, of ${total}">` +
    `<i style="width:${pct(d, total)};background:${D_COL}"></i>${unc ? `<i class="u" style="width:${pct(unc, total)}"></i>` : ''}<i style="width:${pct(r, total)};background:${R_COL}"></i><b></b></div>`;
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const list = (xs) => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
  const stName = (st) => bal.stateNames[st] || st;
  const etTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' });
  // Each election maps to its election day's entry in balance.json.
  const BALKEY = { pres2016: 'pres2016', pres2020: 'pres2020', pres2024: 'pres2024', sen2018: 'd2018', gov2018: 'd2018',
    sen2020: 'pres2020', sen2022: 'd2022', gov2022: 'd2022', sen2024: 'pres2024', sen2026: 'sen2026', gov2026: 'sen2026' };
  // A smallest-change line is a button: it highlights its states on the map.
  const flip = (states, text) => `<button class="flip" data-states="${states.join(',')}" aria-pressed="${!!(sel && sel.states && sel.states.join(',') === states.join(','))}">${text}</button>`;
  function renderBalance() {
    const b = bal.elections[BALKEY[state.e]], el2 = document.getElementById('bopBody'), lines = document.getElementById('bopLines');
    if (!b) { el2.innerHTML = lines.innerHTML = ''; return; }
    lines.innerHTML = compactBalance(b);
    const yr = elections[state.e].year;
    document.getElementById('bopTitle').textContent = `Balance of power, ${yr}`;   // the election day, whatever the office in view
    let h = '';
    if (b.president) {
      const p = b.president, other = 538 - p.ev - p.runnerEv;
      h += `<h3>President</h3><p>${p.winner} (${p.party}) ${p.ev}, ${p.runner} ${p.runnerEv} electoral votes${other ? `; ${other} cast for others` : ''}.</p>`;
    }
    if (b.senate && b.senate.caucusD != null) {
      const s = b.senate, dR = s.R - s.prev.R;
      h += `<h3>Senate after the election</h3>${bar(s.caucusD, s.R, 100)}` +
        `<p>Democrats ${s.caucusD}${s.I ? ` (incl. ${s.I} independents)` : ''}, Republicans ${s.R}${s.tiebreak ? `; ${s.tiebreak} breaks ties` : ''}. Republicans ${signed(dR)} seats.</p>`;
    }
    if (b.senate && b.senate.holdover) {
      const s = b.senate, d = s.holdover.D + s.called.D, r = s.holdover.R + s.called.R, unc = s.uncalled.length;
      h += `<h3>Senate, called so far</h3>${bar(d, r, 100, unc)}` +
        `<p>Democrats ${d}, Republicans ${r}${unc ? `; not called: ${list(s.uncalled.map(stName))}` : ''}. ${d >= 51 ? 'Democrats hold a majority.' : r >= 51 ? 'Republicans hold a majority.' : ''}</p>` +
        `<p class="muted">Includes the ${s.holdover.D + s.holdover.R} seats not up this year. Before the election: Republicans ${s.before.R}, Democrats ${s.before.D + s.before.I} (with ${s.before.I} independents).</p>`;
    }
    if (b.house && b.house.R != null) {
      const ho = b.house;
      h += `<h3>House after the election</h3>${bar(ho.D, ho.R, 435, 435 - ho.D - ho.R)}` +
        `<p>Republicans ${ho.R}, Democrats ${ho.D}${435 - ho.D - ho.R ? `, ${435 - ho.D - ho.R} vacant` : ''}. Republicans ${signed(ho.R - ho.prev.R)} seats.</p>`;
    }
    if (b.house && b.house.called) {
      const ho = b.house, d = ho.called.D, r = ho.called.R;
      h += `<h3>House, called so far</h3>${bar(d, r, 435, ho.uncalled)}` +
        `<p>Democrats ${d}, Republicans ${r}, ${ho.uncalled} not called. ${d >= 218 ? 'Democrats have a majority.' : r >= 218 ? 'Republicans have a majority.' : ''}</p>` +
        `<p class="muted">Before the election: Republicans ${ho.before.R}, Democrats ${ho.before.D}.</p>`;
    }
    if (b.unofficial_asof) h += `<p class="muted">Unofficial, as of ${etTime(b.unofficial_asof)} ET (AP via CNN).</p>`;
    if (b.smallest) {
      const sm = b.smallest; h += `<div class="small"><h3>The smallest change</h3>`;
      if (sm.president) h += `<p>${flip(sm.president.states, `${fmt(sm.president.votes)} voters switching from ${b.president.winner.split(' ').slice(-1)[0] === 'Jr.' ? 'Biden' : b.president.winner.split(' ').slice(-1)[0]} to ${b.president.runner.split(' ').slice(-1)[0]} in ${list(sm.president.states.map(stName))} would have changed the presidency.`)}</p>`;
      if (sm.senate) {
        const other = b.senate.caucusD > b.senate.R || b.senate.tiebreak && b.senate.tiebreak.includes('(D)') ? 'Republicans' : 'Democrats';
        const where = sm.senate.races.map((r) => stName(r.state)), runoff = BALKEY[state.e] === 'pres2020' && where.includes('Georgia') ? ' (the Jan. 5 runoff)' : '';
        h += `<p>${flip(sm.senate.races.map((r) => r.state), `${fmt(sm.senate.votes)} in ${list(where)}${runoff} would have given ${other} the Senate.`)}</p>`;
      }
      if (sm.house) h += `<p>${flip([...new Set(sm.house.districts.map((d) => d.district.split('-')[0]))], `${fmt(sm.house.votes)} in ${list(sm.house.districts.map((d) => d.district))} would have given Democrats the House.`)}</p>`;
      h += `<p class="muted">Voters moving from winner to runner-up: half the margin plus one, closest races first.${sm.president ? ' 270 needed; Maine and Nebraska district electors held as cast.' : ''} Click a line to select its states.</p></div>`;
    }
    const S = bal.sources;
    const first = b.president ? `<a href="${b.president.source}">National Archives</a>, ` : BALKEY[state.e] === 'sen2026' ? `<a href="${S.cnn_sen}">AP via CNN</a>, ` : '';
    h += `<p class="src">Sources: ${first}<a href="${S.senate}">U.S. Senate</a>, <a href="${S.house}">House history office</a>` +
      (b.smallest && b.smallest.president ? `, <a href="${S.countypres}">MIT Election Lab</a>` : '') +
      (b.smallest && b.smallest.senate ? `, <a href="${b.smallest.senate.source.split(' ')[0]}">${/medsl|MEDSL|github/.test(b.smallest.senate.source) ? 'MIT Election Lab Senate file' : 'FEC'}</a>` : '') +
      (b.president ? '' : '. Governors by party are not shown: no single official source was at hand') + `. Every figure and its source: <a href="balance.json">balance.json</a>.</p>`;
    el2.innerHTML = h;
    fitBalance();
  }
  // One line per office for the collapsed box: the same figures as the full box.
  function compactBalance(b) {
    const last = (n) => n.replace(/,? Jr\.$/, '').split(' ').pop();
    let h = '';
    if (b.president) h += `<p class="line" title="Electoral votes">${last(b.president.winner)} ${b.president.ev} · ${last(b.president.runner)} ${b.president.runnerEv}</p>`;
    if (b.senate && b.senate.caucusD != null) h += `<p class="line">Senate R ${b.senate.R} · D ${b.senate.caucusD}${bar(b.senate.caucusD, b.senate.R, 100)}</p>`;
    if (b.senate && b.senate.holdover) { const s = b.senate, d = s.holdover.D + s.called.D, r = s.holdover.R + s.called.R;
      h += `<p class="line">Senate, called: D ${d} · R ${r}${s.uncalled.length ? ` · ${s.uncalled.length} open` : ''}${bar(d, r, 100, s.uncalled.length)}</p>`; }
    if (b.house && b.house.R != null) h += `<p class="line">House R ${b.house.R} · D ${b.house.D}${bar(b.house.D, b.house.R, 435, 435 - b.house.D - b.house.R)}</p>`;
    if (b.house && b.house.called) h += `<p class="line">House, called: D ${b.house.called.D} · R ${b.house.called.R} · ${b.house.uncalled} open${bar(b.house.called.D, b.house.called.R, 435, b.house.uncalled)}</p>`;
    return h;
  }
  const bopBox = document.getElementById('bop'), bopToggle = document.getElementById('bopToggle');
  const setBop = (open) => {
    bopBox.classList.toggle('open', open); bopToggle.setAttribute('aria-expanded', open); bopToggle.textContent = open ? '−' : '+'; bopToggle.setAttribute('aria-label', open ? 'Show less' : 'Show the full balance of power');
    document.getElementById('bopBody').hidden = !open; document.getElementById('bopLines').hidden = open;
    try { localStorage.setItem('vt-bop-open', open ? '1' : '0'); } catch (e) { /* storage off: the choice lasts this visit */ }
    fitBalance();
    if (views && render.ready && effW() !== 'terrain') views.redraw(false);
  };
  bopToggle.addEventListener('click', () => setBop(!bopBox.classList.contains('open')));
  // Keep the box below the key: its height is capped to the space between the key and the bottom edge.
  const fitBalance = () => {
    const box = document.getElementById('bop'); if (window.innerWidth <= 900) { box.style.maxHeight = ''; return; }
    const kb = document.querySelector('.key').getBoundingClientRect().bottom;
    box.style.maxHeight = Math.max(140, window.innerHeight - kb - 12 - 22) + 'px';
  };
  window.addEventListener('resize', fitBalance);
  setBop((() => { try { return localStorage.getItem('vt-bop-open') === '1'; } catch (e) { return false; } })());

  // ---------- selection: one set of counties shared by every view, kept across elections and tabs ----------
  const ALL_ST = new Set(Object.values(meta).map((m) => m.st));
  const countiesOf = (states) => { const S = new Set(states); return Object.keys(meta).filter((f) => S.has(meta[f].st)); };
  // One row per county for the flat views and the table: votes [T, R, D], margin, swing and the baseline's votes.
  let rowsCache = null;
  const rowsNow = () => {
    const key = state.e + '|' + baselineOf();
    if (rowsCache && rowsCache.key === key) return rowsCache.rows;
    const d = elections[state.e].data, b = baselineOf(), bd = b ? elections[b].data : null;
    const rows = Object.keys(meta).map((f) => { const v = d[f] || null; return { f, st: meta[f].st, v, m: margin(v), s: swingOf(f), b: bd ? bd[f] || null : null }; });
    rowsCache = { key, rows };
    return rows;
  };
  // A drag is kept in the link as its rule, re-read against the election in the link.
  const pctCh = (a, b) => (a - b) / b * 100;
  const QUAD = { ne: (x, y) => x > 0 && y > 0, sw: (x, y) => x < 0 && y < 0, nw: (x, y) => x <= 0 && y > 0, se: (x, y) => x > 0 && y <= 0 };
  const changeRows = () => rowsNow().filter((r) => r.v && r.b && r.b[1] > 0 && r.b[2] > 0);
  const RULES = {
    r: ([k, lo, hi]) => rowsNow().filter((r) => { const x = k === 's' ? r.s : r.m; return r.v && x != null && x >= +lo && x <= +hi; }),
    q: ([k]) => (QUAD[k] ? changeRows().filter((r) => QUAD[k](pctCh(r.v[1], r.b[1]), pctCh(r.v[2], r.b[2]))) : []),
    b: ([box]) => { const [x0, x1, y0, y1] = (box || '').split(',').map(Number);
      return changeRows().filter((r) => { const x = pctCh(r.v[1], r.b[1]), y = pctCh(r.v[2], r.b[2]); return x >= x0 && x <= x1 && y >= y0 && y <= y1; }); },
  };
  const encodeSel = () => (!sel ? '' : sel.states ? 's:' + sel.states.join(',') : sel.rule ? sel.rule
    : sel.counties.size <= 300 ? 'c:' + [...sel.counties].join(',') : '');
  const decodeSel = (text) => {
    if (!text) return null;
    const [kind, ...p] = text.split(':');
    let states = null, cs = [];
    if (kind === 's') { states = p.join(':').split(',').filter((st) => ALL_ST.has(st)); cs = countiesOf(states); }
    else if (kind === 'c') cs = p.join(':').split(',').filter((f) => meta[f]);
    else if (RULES[kind]) cs = RULES[kind](p).map((r) => r.f);
    return cs.length ? { states: states && states.length ? states : null, counties: new Set(cs), rule: RULES[kind] ? text : null } : null;
  };
  // spec: { states } or { counties, rule }; opts.add merges (shift-click, long press), opts.toggle lets a second
  // click on the same thing clear it, opts.frame moves the camera to it.
  const setSelection = (spec, opts = {}) => {
    let next = null;
    if (spec) {
      const states = spec.states ? spec.states.slice() : null, cs = states ? countiesOf(states) : spec.counties || [];
      const same = sel && (states ? sel.states && sel.states.join(',') === states.join(',') : !sel.states && cs.length === 1 && sel.counties.size === 1 && sel.counties.has(cs[0]));
      if (opts.add && sel) {
        const merged = new Set(sel.counties);
        if (!states && cs.length === 1 && merged.has(cs[0])) merged.delete(cs[0]); else cs.forEach((f) => merged.add(f));
        next = { states: states && sel.states ? [...new Set([...sel.states, ...states])] : null, counties: merged, rule: null };
      } else if (!(opts.toggle && same)) next = { states, counties: new Set(cs), rule: spec.rule || null };
      if (next && !next.counties.size) next = null;
    }
    sel = next; selVersion++;
    state.sel = encodeSel();
    applySelection(opts);
    toHash();
  };
  const selSummary = () => {
    const d = elections[state.e].data, sts = new Set(); let votes = 0, none = 0;
    for (const f of sel.counties) { sts.add(meta[f].st); if (d[f]) votes += d[f][0]; else none++; }
    const n = sel.counties.size, first = sel.counties.values().next().value;
    const where = sel.states ? `${sel.states.length <= 3 ? list(sel.states.map(stName)) : `${sel.states.length} states`}, ${fmt(n)} counties`
      : n === 1 ? countyLabel(first) : `${fmt(n)} counties in ${sts.size} state${sts.size > 1 ? 's' : ''}`;
    return `${where}: ${fmt(votes)} votes in ${elections[state.e].label}${none ? ` (${fmt(none)} with no race)` : ''}`;
  };
  // Exact counties: frame the selection from a low angle.
  const frameBlocks = () => {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const pc of pieces) if (sel.counties.has(pc.f)) for (const q of (Array.isArray(pc.p[0][0]) ? pc.p[0] : pc.p)) {
      x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
    }
    if (!isFinite(x0)) return;
    const zoom = Math.log2(Math.min(window.innerWidth * 0.55 / (x1 - x0 + 30), window.innerHeight * 0.6 / (y1 - y0 + 30)));
    viewState = { ...viewState, target: [(x0 + x1) / 2, (y0 + y1) / 2, 0], zoom: clamp(zoom, LIMITS.minZoom, LIMITS.maxZoom), rotationX: 34, rotationOrbit: 0,
      transitionDuration: reduced ? 0 : 900, transitionInterpolator: new deck.LinearInterpolator(['target', 'zoom', 'rotationX', 'rotationOrbit']) };
    dk({ viewState });
  };
  const applySelection = ({ frame = false } = {}) => {
    document.getElementById('selChip').hidden = !sel;
    if (sel) document.getElementById('selText').textContent = selSummary();
    const w = effW();
    terrainSel(frame && !!sel && w === 'terrain' && state.s === 'terrain');
    if (w === 'terrain' && (state.s !== 'terrain' || !terrain)) { if (frame && sel) frameBlocks(); dk({ layers: layers() }); }
    if (views) { views.redraw(false); if (frame && sel) views.frame([...sel.counties]); }
    const key = sel && sel.states ? sel.states.join(',') : null;
    document.querySelectorAll('.flip').forEach((b) => b.setAttribute('aria-pressed', b.dataset.states === key));
    if (!tableWrap.hidden) renderTable();
  };
  document.getElementById('bopBody').addEventListener('click', (ev) => {
    const b = ev.target.closest('.flip'); if (!b) return;
    setSelection({ states: b.dataset.states.split(',') }, { toggle: true, frame: true });
  });
  document.getElementById('selClose').addEventListener('click', () => setSelection(null));
  document.getElementById('selFrame').addEventListener('click', () => applySelection({ frame: true }));
  // On the 3D maps a click (not a drag) selects the county under the pointer, or clears on empty ground;
  // shift-click or a long press adds.
  for (const id of ['terrain', 'map']) {
    const el3 = document.getElementById(id); let down = null, lp = null;
    const pickAt = (x, y) => {
      if (id === 'terrain') return terrain ? terrain.pick(x, y) : null;
      if (!deckgl) return null;
      const r = el3.getBoundingClientRect(), o = deckgl.pickObject({ x: x - r.left, y: y - r.top, layerIds: ['counties'] });
      return o && o.object ? o.object.f : null;
    };
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

  // ---------- flat views (views2d.js): the space between the panel, the key and the timeline ----------
  const region = () => {
    const W = window.innerWidth, box = (q) => document.querySelector(q).getBoundingClientRect();
    const tw = document.getElementById('tabWhy'), top = (tw.hidden ? box('#tabs') : tw.getBoundingClientRect()).bottom + 10;
    if (W <= 640) return { left: 10, right: W - 10, top: Math.max(top, box('.key').bottom + 8, box('#bop').bottom + 8), bottom: box('.panel').top - 8 };
    const right = Math.min(box('.key').left, box('#bop').left);
    return { left: box('.panel').right + 16, right: right - 16, top, bottom: box('#offices').top - 12 };
  };
  views = window.VT2D.create({
    el: document.getElementById('v2d'), geo, meta, fmt, region,
    rows: rowsNow, mode: () => (baselineOf() ? 'swing' : 'margin'),
    colour: (x, forceMargin) => (x == null ? `rgb(${NODATA})` : toward(x, forceMargin || !baselineOf() ? MARGIN_MAX : SWING_MAX) + ''),
    label: () => elections[state.e].label, baselineLabel,
    hover: onHover, hoverHtml: placeTip,
    tipHtml: (f) => tooltip({ object: { f }, layer: { id: 'counties' } }).html,
    select: (spec, o = {}) => setSelection(spec && (spec.kind === 'states' ? { states: spec.states } : { counties: spec.counties, rule: spec.rule }), { add: o.add, toggle: true }),
    selection: () => sel,
    viewNote: (t) => { const n = document.getElementById('viewNote'); n.textContent = t; n.hidden = !t; },
    stateName: stName, key: () => state.e + '|' + baselineOf(),
  });
  window.addEventListener('resize', () => { if (effW() !== 'terrain') views.redraw(false); });
  document.getElementById('tabs').addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-w]'); if (!b || b.disabled) return;
    switchTab(b.dataset.w);
  });
  const switchTab = (w) => {
    if (terrain) terrain.stopMotion();
    if (tourBtn().getAttribute('aria-pressed') === 'true') endTour();
    state.w = w; render({ animate: false });
    if (effW() === 'terrain') setCamera(state.v, false);
  };

  // ---------- find: type-ahead over counties and states; choosing one selects and frames it ----------
  const findBox = document.getElementById('find'), findInput = document.getElementById('findInput'), findList = document.getElementById('findList');
  const findIndex = [...[...ALL_ST].map((st) => ({ st, label: stName(st), key: (stName(st) + ' ' + st).toLowerCase() })),
    ...Object.keys(meta).map((f) => ({ f, label: countyLabel(f), key: countyLabel(f).replace(/,/g, '').toLowerCase(), v: (elections.pres2024.data[f] || [0])[0] }))
      .sort((a, b) => b.v - a.v)];
  let findHits = [], findAt = 0;
  const renderFind = () => {
    const q = findInput.value.trim().replace(/,/g, '').toLowerCase();
    // Name matches first, then matches inside a name; states before counties, bigger counties first.
    findHits = !q ? [] : [...findIndex.filter((x) => x.key.startsWith(q)), ...findIndex.filter((x) => !x.key.startsWith(q) && x.key.includes(q))].slice(0, 12);
    findAt = Math.min(findAt, Math.max(0, findHits.length - 1));
    findList.innerHTML = findHits.map((x, i) => `<li role="option" id="fh${i}" data-i="${i}" aria-selected="${i === findAt}">${esc(x.label)}${x.st ? ' (state)' : ''}</li>`).join('')
      || (q ? '<li aria-disabled="true">No county or state by that name</li>' : '');
    findInput.setAttribute('aria-activedescendant', findHits.length ? 'fh' + findAt : '');
  };
  const openFind = () => { findBox.hidden = false; findInput.value = ''; findAt = 0; renderFind(); findInput.focus(); };
  const closeFind = () => { findBox.hidden = true; findInput.blur(); };
  const pickFind = (i) => { const x = findHits[i]; if (!x) return; closeFind(); setSelection(x.st ? { states: [x.st] } : { counties: [x.f] }, { frame: true }); };
  findInput.addEventListener('input', () => { findAt = 0; renderFind(); });
  findInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); closeFind(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); findAt = clamp(findAt + (ev.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, findHits.length - 1)); renderFind(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pickFind(findAt); }
  });
  findList.addEventListener('mousedown', (ev) => { const li = ev.target.closest('[data-i]'); if (li) { ev.preventDefault(); pickFind(+li.dataset.i); } });
  findInput.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== findInput) findBox.hidden = true; }, 120));
  document.getElementById('findBtn').addEventListener('click', openFind);

  // ---------- table: the numbers behind the view in use, as in the tooltip ----------
  const tableWrap = document.getElementById('tableWrap'), table = document.getElementById('table');
  let tableSort = { k: 2, dir: -1 };
  const lead = (x) => (x == null ? '' : (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1));
  const signedPct = (p) => (p == null ? '' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%');
  const renderTable = () => {
    const b = baselineOf(), w = effW();
    let rs = rowsNow().filter((r) => r.v);
    if (sel) rs = rs.filter((r) => sel.counties.has(r.f));
    const cols = [
      ['County', (r) => countyLabel(r.f).replace(/, \w\w$/, ''), String], ['State', (r) => r.st, String],
      ['Votes', (r) => r.v[0], fmt], ['Republican', (r) => r.v[1], fmt], ['Democratic', (r) => r.v[2], fmt],
      ['Margin', (r) => r.m, lead],
      ...(b ? [['Swing', (r) => r.s, (s) => (s == null ? '' : `${Math.abs(s).toFixed(1)} to ${s >= 0 ? 'D' : 'R'}`)]] : []),
      ...(b && w === 'scatter' ? [['Rep. votes', (r) => (r.b && r.b[1] > 0 ? pctCh(r.v[1], r.b[1]) : null), signedPct],
        ['Dem. votes', (r) => (r.b && r.b[2] > 0 ? pctCh(r.v[2], r.b[2]) : null), signedPct]] : []),
    ];
    if (tableSort.k >= cols.length) tableSort = { k: 2, dir: -1 };
    const get = cols[tableSort.k][1];
    rs = rs.slice().sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * tableSort.dir; });
    document.getElementById('tableTitle').textContent = `${sel ? 'Selected counties' : 'Every county'}, ${elections[state.e].label}`;
    document.getElementById('tableNote').textContent = `${fmt(rs.length)} ${rs.length === 1 ? 'county' : 'counties'}` + (b ? `. Swing in points since ${baselineLabel()}` : '') +
      (b && w === 'scatter' ? '; vote changes in percent since the same race' : '') + '. Click a heading to sort.';
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === tableSort.k ? ` aria-sort="${tableSort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      (rs.length ? rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('')
        : `<tr><td colspan="${cols.length}">No ${OFFICE_NAME[officeOf(state.e)].toLowerCase()} race with county results here in ${elections[state.e].year}.</td></tr>`) + '</tbody>';
  };
  table.addEventListener('click', (ev) => {
    const th = ev.target.closest('th'); if (!th) return;
    const k = +th.dataset.k; tableSort = { k, dir: tableSort.k === k ? -tableSort.dir : k < 2 ? 1 : -1 }; renderTable();
  });
  const openTable = () => { tableWrap.hidden = false; renderTable(); document.getElementById('tableClose').focus(); };
  const closeTable = () => { tableWrap.hidden = true; };
  document.getElementById('tableBtn').addEventListener('click', () => (tableWrap.hidden ? openTable() : closeTable()));
  document.getElementById('tableClose').addEventListener('click', closeTable);

  function render(opts = {}) {
    buildTimeline();
    const i = trk().indexOf(state.e);
    offices.querySelectorAll('[data-office]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.office === officeOf(state.e)));
    timeline.querySelectorAll('.step').forEach((s) => s.setAttribute('aria-pressed', s.dataset.e === state.e));
    document.getElementById('prev').disabled = i === 0;
    document.getElementById('next').disabled = i === trk().length - 1;
    document.querySelectorAll('[data-s]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.s === state.s));
    document.querySelectorAll('[data-m]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.m === state.m));
    document.getElementById('smoothGroup').hidden = state.s !== 'terrain';
    document.getElementById('keyTerrain').hidden = state.s !== 'terrain';
    document.getElementById('keyBlocks').hidden = state.s === 'terrain';
    document.querySelectorAll('[data-h]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.h === state.h));
    document.querySelectorAll('[data-u]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.u === state.u));
    document.getElementById('upRow').hidden = state.h !== 'net';
    document.querySelectorAll('[data-n]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.n === state.n));
    const sh = document.getElementById('scaleHow');
    sh.hidden = state.n !== 'county';
    const kt = document.getElementById('keyTerrain'); if (kt) kt.hidden = state.n === 'county' || state.s !== 'terrain';   // contours and the volume note are per square mile
    if (effW() !== 'terrain') document.getElementById('keyTerrain').hidden = document.getElementById('keyBlocks').hidden = true;
    sh.textContent = 'Per county: height is each county\'s own total, not its votes per square mile, smoothed a little across county lines. Big counties with many votes stand as plateaus; volume no longer equals votes.';
    document.querySelectorAll('[data-c]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.c === (isMargin() ? 'margin' : 'swing'));
      if (b.dataset.c === 'swing') b.disabled = !baselineOf();
    });
    const bo = baselineOf();
    document.getElementById('swingBtn').textContent = !bo ? 'Swing' : bo === 'senprior' ? 'Swing since last Senate race' : bo === 'govprior' ? 'Swing since last governor\'s race' : `Swing since ${elections[bo].year}`;
    document.getElementById('swingHow').textContent = !bo ? 'No earlier race for the same seat in the data, so only margin is available.'
      : `Swing compares each county with ${bo === 'senprior' ? 'its state\'s previous race for the same Senate seat (2020 in most states)'
        : bo === 'govprior' ? 'its state\'s previous governor\'s race (2022, or 2024 in New Hampshire and Vermont)'
        : officeOf(state.e) === 'senate' ? 'the 2018 race for the same Senate seats' : officeOf(state.e) === 'governor' ? 'the 2018 governor\'s race in the same states' : 'the previous presidential election'}.`;
    document.getElementById('flat').setAttribute('aria-pressed', state.d === '2d');
    document.getElementById('ghost').setAttribute('aria-pressed', state.g === '1');
    document.getElementById('ghost').disabled = !baselineOf();
    document.querySelectorAll('[data-l]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.l === state.l));
    document.getElementById('worthRow').hidden = state.l !== 'worth';
    document.querySelectorAll('[data-wh]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.wh === state.h));
    const per = state.n === 'county' ? 'per county' : 'per sq mi', vw0 = effW();
    document.getElementById('keyHeight').textContent = vw0 === 'dots' ? 'Dot area: votes' : vw0 === 'scatter' ? 'Circle area: votes' : vw0 === 'arrows' ? 'Arrow length: swing'
      : state.d === '2d' ? 'Flat map: colour only'
      : state.h === 'net' ? `Height: net margin ${per}` : state.h === 'ev' || state.h === 'sen' ? `Height: votes × ${state.h === 'ev' ? 'electoral' : 'Senate'} weight`
      : `Height: ${{ total: 'votes', dem: 'Democratic votes', rep: 'Republican votes' }[state.h]} ${per}`;
    document.getElementById('lensState').textContent = state.l === 'custom' ? '(custom view)' : '';
    document.getElementById('play').classList.toggle('hint', state.l === 'changed');
    document.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.v));

    // Weighted views: one plain sentence in the panel, the extremes in the key.
    const w = weighted(), wh = document.getElementById('weightHow'), kw = document.getElementById('keyWeight');
    const aw = document.getElementById('aboutWeight');
    wh.hidden = !w && state.h !== 'net'; kw.hidden = !w; aw.textContent = '';
    if (state.h === 'net') {
      // Volume above ground minus volume below is the margin in votes across every county in the map.
      let dem = 0, rep = 0;
      for (const v of Object.values(elections[state.e].data)) { dem += v[2]; rep += v[1]; }
      const up = state.u === 'r' ? 'Republicans' : 'Democrats', down = state.u === 'r' ? 'Democrats' : 'Republicans';
      const net = dem - rep, lead = net >= 0 ? 'Democrats' : 'Republicans';
      wh.textContent = state.n === 'county'
        ? `Height is each county's net margin in votes: mountains where ${up} won more votes, valleys where ${down} did.`
        : `Height is net votes per square mile: mountains where ${up} won more votes, valleys where ${down} did. Each county's volume is its margin in votes.`;
      aw.textContent = state.n === 'county' ? `Net margin across the counties in this map: ${lead} +${fmt(Math.abs(net))} votes (${elections[state.e].label}${elections[state.e].unofficial ? ', unofficial' : ''}).` : `Mountains minus valleys: ${lead} +${fmt(Math.abs(net))} votes across the counties in this map (${elections[state.e].label}${elections[state.e].unofficial ? ', unofficial' : ''}).`;
    } else if (w) {
      const yr = elections[state.e].year, name = (st) => bal.stateNames[st] || st;
      wh.textContent = state.h === 'ev'
        ? 'Height is votes scaled by each state\'s electoral votes per vote cast, against the national average, so a county\'s volume is its share of the Electoral College.'
        : 'Height is votes scaled by each state\'s two Senate seats per vote cast, against the national average, so a county\'s volume is its share of the Senate.';
      kw.textContent = `${w.hi} vote: ${(w.factor[w.hi] / w.factor[w.lo]).toFixed(1)}× ${w.lo}'s`;
      kw.title = aw.textContent = `A vote in ${name(w.hi)} carries ${(w.factor[w.hi] / w.factor[w.lo]).toFixed(1)} times the ${state.h === 'ev' ? 'electoral' : 'Senate'} weight of one in ${name(w.lo)} (${yr}, votes cast in this election).`;
    }
    renderBalance();

    // Key
    // The key follows the view drawn: Dots and Arrows colour by swing when there is a baseline, Scatter by margin.
    const kw2 = effW(), m = kw2 === 'terrain' ? isMargin() : kw2 === 'scatter' || !baselineOf(), max = m ? MARGIN_MAX : SWING_MAX;
    document.getElementById('keyTitle').textContent = m ? `Margin, ${elections[state.e].label}` : `Swing since ${baselineLabel()}`;
    document.getElementById('ramp').innerHTML = d3.range(-max, max + 0.001, max / 6).map((x) => `<i style="background:${toward(x, max)}"></i>`).join('');
    document.getElementById('rampLabels').innerHTML = m
      ? `<span>R+${max}</span><span>even</span><span>D+${max}</span>`
      : `<span>${max} R</span><span>no change</span><span>${max} D</span>`;

    const e = elections[state.e];
    const n = [notes.AK, notes.CT, notes.KC, notes.VA];
    if (officeOf(state.e) !== 'president') n.unshift(`Pale grey: no ${OFFICE_NAME[officeOf(state.e)].toLowerCase()} race with Democrat-vs-Republican county results in ${e.year}.`, ...(e.notes || []));
    document.getElementById('notes').textContent = n.map((x) => (/[.)]$/.test(x) ? x : x + '.')).join(' ');
    document.getElementById('source').textContent = 'Source: ' + e.source + (m ? '' : ` Swing: the Democratic margin minus the margin in ${baselineLabel()}. ` + (baselineOf() === 'senprior' ? elections.senprior.source : ''));
    fitBalance();
    // Tabs: the one drawn is pressed; one that cannot draw is disabled, with its reason on hover and, when chosen, under the tabs.
    const vw = effW();
    document.querySelectorAll('[data-w]').forEach((b) => { const why = tabWhy(b.dataset.w); b.disabled = !!why; b.title = why ? `${TAB_NAME[b.dataset.w]} ${why}.` : ''; b.setAttribute('aria-pressed', b.dataset.w === vw); });
    const tw = document.getElementById('tabWhy');
    tw.textContent = vw !== state.w ? `${TAB_NAME[state.w]} ${tabWhy(state.w)}; showing ${TAB_NAME[vw]}.` : ''; tw.hidden = vw === state.w;
    const nt = document.getElementById('notice');
    nt.hidden = !glFailed;
    if (glFailed) document.getElementById('locator').style.display = 'none';   // the locator is drawn by the terrain
    nt.textContent = 'This browser is not drawing 3D (WebGL is off or unavailable), so the map is shown as Dots or Arrows. Everything else works.';
    tourBtn().disabled = vw !== 'terrain';
    for (const id of ['flat', 'reset']) document.getElementById(id).disabled = vw === 'dots' || vw === 'scatter';
    if (sel) document.getElementById('selText').textContent = selSummary();
    showView();
    if (vw === 'terrain') {
      if (state.s === 'terrain' && terrain) terrain.setState(terrainState(), { animate: opts.animate !== false, base: baselineOf() });
      else dk({ layers: layers() });
    } else if (views) views.redraw(opts.animate !== false);
    if (!tableWrap.hidden) renderTable();
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
    if (k === 'Escape') { if (!about.hidden) closeAbout(); else if (!findBox.hidden) closeFind(); else if (!tableWrap.hidden) closeTable(); else if (sel) setSelection(null); }
    else if (k === 'ArrowLeft') { stop(); go(trk().indexOf(state.e) - 1); }
    else if (k === 'ArrowRight') { stop(); go(trk().indexOf(state.e) + 1); }
    else if (k >= '1' && k <= '4') { if (terrain) terrain.stopMotion(); applyLens(['votes', 'won', 'changed', 'worth'][+k - 1]); }
    else if (k === 'v' || k === 'V') { const ok = TABS.filter((w) => !tabWhy(w)); switchTab(ok[(ok.indexOf(effW()) + 1) % ok.length]); }
    else if (k === ' ' && !ev.target.closest('button, a, summary')) { ev.preventDefault(); document.getElementById('play').click(); }
    else if (k === '/') { ev.preventDefault(); openFind(); }
    else if (k === 't' || k === 'T') { tableWrap.hidden ? openTable() : closeTable(); }
  });
  const lensHint = (key) => {
    const box = document.getElementById('lensHow'); let seen = true;
    try { seen = localStorage.getItem('vt-lens-' + key) === '1'; localStorage.setItem('vt-lens-' + key, '1'); } catch (e) { seen = !!lensHint[key]; }
    lensHint[key] = true;
    box.hidden = seen; if (!seen) document.getElementById('lensHowText').textContent = LENSES[key].how;
  };
  document.getElementById('lensHowClose').addEventListener('click', () => { document.getElementById('lensHow').hidden = true; });
  document.querySelectorAll('[data-li]').forEach((b) => {
    const show = () => { const r = b.getBoundingClientRect(); placeTip(LENSES[b.dataset.li].how, r.right + 8, r.top - 4); };
    b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
    b.addEventListener('mouseleave', () => { tip.hidden = true; }); b.addEventListener('blur', () => { tip.hidden = true; });
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (tip.hidden) show(); else tip.hidden = true; });
  });
  // About this map: everything read once (intro, lens sentences, key notes, data notes, sources, how to move).
  const about = document.getElementById('about'), aboutBtn = document.getElementById('aboutBtn');
  document.getElementById('aboutLenses').innerHTML = Object.keys(LENSES).map((k) =>
    `<dt>${document.querySelector(`[data-l="${k}"]`).textContent}</dt><dd>${LENSES[k].how}</dd>`).join('');
  const openAbout = (at) => { about.hidden = false; aboutBtn.setAttribute('aria-expanded', 'true'); document.getElementById('aboutClose').focus();
    if (at) document.getElementById(at).scrollIntoView({ block: 'start' }); };
  const closeAbout = () => { about.hidden = true; aboutBtn.setAttribute('aria-expanded', 'false'); };
  aboutBtn.addEventListener('click', () => (about.hidden ? openAbout() : closeAbout()));
  document.getElementById('keyInfo').addEventListener('click', () => openAbout('aboutKeyHead'));
  document.getElementById('aboutClose').addEventListener('click', closeAbout);
  const applyLens = (key) => {
    const L2 = LENSES[key]; if (!L2) return;
    lensHint(key);
    Object.assign(state, L2.set, { l: key, v: L2.v });
    // Swing needs an earlier race for the same seat: the latest election on this office's track that has one.
    if (key === 'changed' && !sameOffice[state.e]) state.e = trk().slice().reverse().find((e) => sameOffice[e]) || 'pres2024';
    render(); setCamera(state.v);
  };
  document.querySelectorAll('[data-l]').forEach((b) => b.addEventListener('click', () => { if (terrain) terrain.stopMotion(); applyLens(b.dataset.l); }));
  document.querySelectorAll('[data-wh]').forEach((b) => b.addEventListener('click', () => { state.h = b.dataset.wh; render(); }));
  document.getElementById('ghost').addEventListener('click', () => { state.g = state.g === '1' ? '0' : '1'; render(); });
  // Any control inside Adjust turns the lens into a custom view (the capture runs before the control's own handler).
  document.getElementById('adjust').addEventListener('click', (ev) => { if (ev.target.closest('button')) state.l = 'custom'; }, true);
  document.querySelectorAll('[data-s]').forEach((b) => b.addEventListener('click', () => {
    state.s = b.dataset.s; render({ animate: false }); setCamera(state.v, false);
  }));
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => { state.m = b.dataset.m; render(); }));
  document.querySelectorAll('[data-h]').forEach((b) => b.addEventListener('click', () => { state.h = b.dataset.h; render(); }));
  document.querySelectorAll('[data-u]').forEach((b) => b.addEventListener('click', () => { state.u = b.dataset.u; render(); }));
  document.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => { state.n = b.dataset.n; render(); }));
  document.querySelectorAll('[data-c]').forEach((b) => b.addEventListener('click', () => { state.c = b.dataset.c; render(); }));
  document.querySelectorAll('button[data-view]').forEach((b) => b.addEventListener('click', () => {
    state.v = b.dataset.view; render(); setCamera(state.v);
  }));
  document.getElementById('tour').addEventListener('click', () => {
    if (tourBtn().getAttribute('aria-pressed') === 'true') { terrain && terrain.stopMotion(); endTour(); } else startTour();
  });
  // Any control stops the spin or tour, so the reader is never fighting the camera.
  document.querySelector('.panel').addEventListener('click', (ev) => { if (terrain && ev.target.id !== 'tour') terrain.stopMotion(); }, true);
  document.getElementById('timeline').addEventListener('click', () => { if (terrain) { terrain.stopMotion(); } }, true);
  // Reset returns to the lens's own view (From the west for a custom view).
  document.getElementById('reset').addEventListener('click', () => {
    if (effW() === 'arrows') { views.frame(null); return; }
    state.v = LENSES[state.l] ? LENSES[state.l].v : 'west'; state.d = '3d'; render(); setCamera(state.v);
  });
  document.getElementById('flat').addEventListener('click', () => {
    state.d = state.d === '2d' ? '3d' : '2d';
    if ((state.s === 'terrain' && terrain) || !deckgl) { render(); setCamera(state.v); return; }
    viewState = { ...viewState, rotationX: state.d === '2d' ? 90 : 42, rotationOrbit: state.d === '2d' ? 0 : viewState.rotationOrbit,
      transitionDuration: reduced ? 0 : 600, transitionInterpolator: new deck.LinearInterpolator(['rotationX', 'rotationOrbit']) };
    dk({ viewState }); render();
  });
  // A shared link or the back button changes the hash: follow it.
  window.addEventListener('hashchange', () => {
    const prev = state.v + state.d, prevSel = state.sel; fromHash();
    if (state.sel !== prevSel) { sel = decodeSel(state.sel); selVersion++; state.sel = encodeSel(); applySelection(); }
    render();
    if (state.v + state.d !== prev) setCamera(state.v);
  });
  window.__vt = { state, deckgl: () => deckgl, elections, meta, terrain: () => terrain, views: () => views, sel: () => sel, setSelection, effW,
    colours: { GARNET: GARNET + '', SAPPHIRE: SAPPHIRE + '', NEUTRAL: NEUTRAL + '' } };   // for checks
  sel = decodeSel(state.sel); state.sel = encodeSel();
  render.ready = true;
  render({ animate: false });
  applySelection();
})();
