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
  const { order, sameOffice, k, elections, notes } = el;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fmt = (n) => Math.round(n).toLocaleString('en-US');

  // ---------- state, mirrored in the URL hash ----------
  const state = { e: 'pres2024', h: 'total', c: 'margin', s: 'terrain', m: '1', v: 'west', d: '3d', u: 'd', n: 'area', l: 'votes', g: '0' };
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
  const firstVisit = !location.hash;                    // a shared link opens still; a first visit spins
  const fromHash = () => {
    const q = new URLSearchParams(location.hash.slice(1));
    for (const key of Object.keys(state)) if (q.get(key)) state[key] = q.get(key);
    if (!order.includes(state.e)) state.e = 'pres2024';
    if (!['terrain', 'blocks'].includes(state.s)) state.s = 'terrain';
    if (!['1', '8'].includes(state.m)) state.m = '1';
    if (!LENSES[state.l] && state.l !== 'custom') state.l = 'votes';
    if (!['0', '1'].includes(state.g)) state.g = '0';
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
  const colourOf = (f) => {
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
    const ev = bal.ev[e] || bal.ev.pres2024;
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
    const trig = [state.e, state.h, state.c, state.d];
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
  const deckgl = new deck.Deck({
    parent: document.getElementById('map'), views: view, effects: [lighting],
    controller: { dragMode: 'pan', inertia: 250, keyboard: false, scrollZoom: { speed: 0.01, smooth: true } },
    onViewStateChange: ({ viewState: vs }) => {
      const edges = viewState.zoom > EDGE_ZOOM;
      viewState = constrain(vs);
      deckgl.setProps(edges !== viewState.zoom > EDGE_ZOOM ? { viewState, layers: layers() } : { viewState });
      return viewState;
    },
    viewState, layers: layers(), getTooltip: tooltip,
    parameters: { clearColor: [232 / 255, 236 / 255, 236 / 255, 1] },
  });

  // ---------- terrain view (terrain.js) ----------
  const tip = document.createElement('div');
  tip.className = 'deck-tooltip vt-tip'; tip.hidden = true; document.body.appendChild(tip);
  const onHover = (f, x, y) => {
    if (!f) { tip.hidden = true; return; }
    tip.innerHTML = tooltip({ object: { f }, layer: { id: 'counties' } }).html;
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
  let terrain = null;
  const terrainState = () => {
    const w = weighted(), b = baselineOf();
    return { ...state, kc: kcOf(), mode: isMargin() ? 'margin' : 'swing', weights: w ? w.factor : null,
      baseWeights: w && b ? weightsFor(b, state.h).factor : null };
  };
  const showView = () => {
    const on = state.s === 'terrain' && terrain;
    document.getElementById('map').style.display = on ? 'none' : 'block';
    if (terrain) terrain.show(state.s === 'terrain');
    if (!on) tip.hidden = true;
  };
  (window.VTTerrain ? Promise.resolve() : new Promise((r) => window.addEventListener('vt-terrain-ready', r, { once: true })))
    .then(() => window.VTTerrain.init({ container: document.getElementById('terrain'), geo, ramp: buildRamp(), onHover, labels: METROS,
      locator: document.getElementById('locator') }))
    .then((t) => { terrain = t; showView(); terrain.setState(terrainState(), { animate: false, base: baselineOf() }); terrain.view(state.v, presets, sideSpace(), false);
      if (firstVisit && state.s === 'terrain') terrain.spin(); });
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
    if (!terrain || state.s !== 'terrain') return;
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
    if (state.s === 'terrain' && terrain) terrain.view(name, presets, sideSpace(), animate);
    else { viewState = camera(name, animate); deckgl.setProps({ viewState }); }
  };

  function tooltip({ object, layer }) {
    if (!object || layer.id !== 'counties') return null;
    const f = object.f, m = meta[f], e = elections[state.e], v = e.data[f];
    const head = `<b>${m.n}${/^(AK|LA)$/.test(m.st) ? '' : ' County'}, ${m.st}</b><br>`;
    if (!v) {
      const why = m.st === 'AK' ? notes.AK : state.e === 'sen2026' ? 'No Democrat-vs-Republican Senate race counted here in 2026.' : 'No result in the source for this county.';
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
  timeline.innerHTML = '<button class="nav" id="prev" aria-label="Previous election">‹</button>' +
    order.map((o) => { const p = parts(o); return `<button class="step" data-e="${o}"><b>${p.year}</b><span>${p.office}</span></button>`; }).join('') +
    '<button class="nav" id="next" aria-label="Next election">›</button>' +
    '<button class="nav" id="play" aria-label="Play through the elections">▶</button>';
  let timer = null;
  // "the 2020 Senate race" for a state, or "President 2020".
  const baselineLabel = (st) => {
    const b = baselineOf(); if (!b) return '';
    if (b === 'senprior') return st && elections.senprior.priorYears[st] ? `the ${elections.senprior.priorYears[st]} Senate race` : 'the previous Senate race';
    return elections[b].label;
  };

  const go = (i) => { state.e = order[clamp(i, 0, order.length - 1)]; render(); };
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
  function renderBalance() {
    const b = bal.elections[state.e], el2 = document.getElementById('bopBody'); if (!b) { el2.innerHTML = ''; return; }
    const yr = elections[state.e].year;
    document.getElementById('bopTitle').textContent = `Balance of power, ${yr}`;
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
      if (sm.president) h += `<p>${fmt(sm.president.votes)} voters switching from ${b.president.winner.split(' ').slice(-1)[0] === 'Jr.' ? 'Biden' : b.president.winner.split(' ').slice(-1)[0]} to ${b.president.runner.split(' ').slice(-1)[0]} in ${list(sm.president.states.map(stName))} would have changed the presidency.</p>`;
      if (sm.senate) {
        const other = b.senate.caucusD > b.senate.R || b.senate.tiebreak && b.senate.tiebreak.includes('(D)') ? 'Republicans' : 'Democrats';
        const where = sm.senate.races.map((r) => stName(r.state)), runoff = state.e === 'pres2020' && where.includes('Georgia') ? ' (the Jan. 5 runoff)' : '';
        h += `<p>${fmt(sm.senate.votes)} in ${list(where)}${runoff} would have given ${other} the Senate.</p>`;
      }
      if (sm.house) h += `<p>${fmt(sm.house.votes)} in ${list(sm.house.districts.map((d) => d.district))} would have given Democrats the House.</p>`;
      h += `<p class="muted">Voters moving from winner to runner-up: half the margin plus one, closest races first.${sm.president ? ' 270 needed; Maine and Nebraska district electors held as cast.' : ''}</p></div>`;
    }
    const S = bal.sources;
    h += `<p class="src">Sources: <a href="${b.president ? b.president.source : S.cnn_sen}">${b.president ? 'National Archives' : 'AP via CNN'}</a>, <a href="${S.senate}">U.S. Senate</a>, <a href="${S.house}">House history office</a>` +
      (b.smallest ? `, <a href="${S.countypres}">MIT Election Lab</a>, <a href="${state.e === 'pres2016' ? S.fec2016 : state.e === 'pres2020' ? S.fec2020 : S.medsl2024sen}">${state.e === 'pres2024' ? 'MIT Election Lab Senate file' : 'FEC'}</a>` : '') + `. Every figure and its source: <a href="balance.json">balance.json</a>.</p>`;
    el2.innerHTML = h;
    fitBalance();
  }
  // Keep the box below the key: its height is capped to the space between the key and the bottom edge.
  const fitBalance = () => {
    const box = document.getElementById('bop'); if (window.innerWidth <= 900) { box.style.maxHeight = ''; return; }
    const kb = document.querySelector('.key').getBoundingClientRect().bottom;
    box.style.maxHeight = Math.max(140, window.innerHeight - kb - 12 - 22) + 'px';
  };
  window.addEventListener('resize', fitBalance);
  if (window.innerWidth <= 640) document.getElementById('bop').open = false;

  function render(opts = {}) {
    const i = order.indexOf(state.e);
    timeline.querySelectorAll('.step').forEach((s) => s.setAttribute('aria-pressed', s.dataset.e === state.e));
    document.getElementById('prev').disabled = i === 0;
    document.getElementById('next').disabled = i === order.length - 1;
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
    const kt = document.getElementById('keyTerrain'); if (kt) kt.hidden = state.n === 'county';   // contours and the volume note are per square mile
    sh.textContent = 'Per county: height is each county\'s own total, not its votes per square mile, smoothed a little across county lines. Big counties with many votes stand as plateaus; volume no longer equals votes.';
    document.querySelectorAll('[data-c]').forEach((b) => {
      b.setAttribute('aria-pressed', b.dataset.c === (isMargin() ? 'margin' : 'swing'));
      if (b.dataset.c === 'swing') b.disabled = !baselineOf();
    });
    document.getElementById('swingBtn').textContent = baselineOf() ? (baselineOf() === 'senprior' ? 'Swing since last Senate race' : `Swing since ${elections[baselineOf()].year}`) : 'Swing';
    document.getElementById('swingHow').textContent = baselineOf()
      ? `Swing compares each county with ${baselineOf() === 'senprior' ? 'its state\'s previous race for the same Senate seat (2020 in most states)' : 'the previous presidential election'}.`
      : 'No earlier race for this office in the data, so only margin is available.';
    document.getElementById('flat').setAttribute('aria-pressed', state.d === '2d');
    document.getElementById('ghost').setAttribute('aria-pressed', state.g === '1');
    document.getElementById('ghost').disabled = !baselineOf();
    document.querySelectorAll('[data-l]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.l === state.l));
    document.getElementById('worthRow').hidden = state.l !== 'worth';
    document.querySelectorAll('[data-wh]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.wh === state.h));
    document.getElementById('lensHow').textContent = LENSES[state.l] ? LENSES[state.l].how : 'Custom view: the settings are under Adjust.';
    document.getElementById('lensState').textContent = state.l === 'custom' ? '(custom view)' : '';
    document.getElementById('play').classList.toggle('hint', state.l === 'changed');
    document.querySelectorAll('button[data-view]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.view === state.v));

    // Weighted views: one plain sentence in the panel, the extremes in the key.
    const w = weighted(), wh = document.getElementById('weightHow'), kw = document.getElementById('keyWeight');
    wh.hidden = kw.hidden = !w && state.h !== 'net';
    if (state.h === 'net') {
      // Volume above ground minus volume below is the margin in votes across every county in the map.
      let dem = 0, rep = 0;
      for (const v of Object.values(elections[state.e].data)) { dem += v[2]; rep += v[1]; }
      const up = state.u === 'r' ? 'Republicans' : 'Democrats', down = state.u === 'r' ? 'Democrats' : 'Republicans';
      const net = dem - rep, lead = net >= 0 ? 'Democrats' : 'Republicans';
      wh.textContent = state.n === 'county'
        ? `Height is each county's net margin in votes: mountains where ${up} won more votes, valleys where ${down} did.`
        : `Height is net votes per square mile: mountains where ${up} won more votes, valleys where ${down} did. Each county's volume is its margin in votes.`;
      kw.textContent = state.n === 'county' ? `Net margin across the counties in this map: ${lead} +${fmt(Math.abs(net))} votes (${elections[state.e].label}${elections[state.e].unofficial ? ', unofficial' : ''}).` : `Mountains minus valleys: ${lead} +${fmt(Math.abs(net))} votes across the counties in this map (${elections[state.e].label}${elections[state.e].unofficial ? ', unofficial' : ''}).`;
    } else if (w) {
      const yr = elections[state.e].year, name = (st) => bal.stateNames[st] || st;
      wh.textContent = state.h === 'ev'
        ? 'Height is votes scaled by each state\'s electoral votes per vote cast, against the national average, so a county\'s volume is its share of the Electoral College.'
        : 'Height is votes scaled by each state\'s two Senate seats per vote cast, against the national average, so a county\'s volume is its share of the Senate.';
      kw.textContent = `A vote in ${name(w.hi)} carries ${(w.factor[w.hi] / w.factor[w.lo]).toFixed(1)} times the ${state.h === 'ev' ? 'electoral' : 'Senate'} weight of one in ${name(w.lo)} (${yr}, votes cast in this election).`;
    }
    renderBalance();

    // Key
    const m = isMargin(), max = m ? MARGIN_MAX : SWING_MAX;
    document.getElementById('keyTitle').textContent = m ? `Margin, ${elections[state.e].label}` : `Swing since ${baselineLabel()}`;
    document.getElementById('ramp').innerHTML = d3.range(-max, max + 0.001, max / 6).map((x) => `<i style="background:${toward(x, max)}"></i>`).join('');
    document.getElementById('rampLabels').innerHTML = m
      ? `<span>R+${max}</span><span>even</span><span>D+${max}</span>`
      : `<span>${max} to R</span><span>no change</span><span>${max} to D</span>`;

    const e = elections[state.e];
    const n = [notes.AK, notes.CT, notes.KC, notes.VA];
    if (state.e === 'sen2026') n.unshift('Pale grey counties had no Democrat-vs-Republican Senate race in 2026, or are not yet counted.');
    document.getElementById('notes').textContent = n.join(' ');
    document.getElementById('source').textContent = 'Source: ' + e.source + (m ? '' : ` Swing: the Democratic margin minus the margin in ${baselineLabel()}. ` + (baselineOf() === 'senprior' ? elections.senprior.source : ''));
    fitBalance();
    showView();
    if (state.s === 'terrain' && terrain) terrain.setState(terrainState(), { animate: opts.animate !== false, base: baselineOf() });
    else deckgl.setProps({ layers: layers() });
    toHash();
  }

  timeline.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.id === 'play') {
      if (timer) return stop();
      if (order.indexOf(state.e) === order.length - 1) go(0);
      b.textContent = '❚❚';
      timer = setInterval(() => { const i = order.indexOf(state.e); if (i >= order.length - 1) stop(); else go(i + 1); }, reduced ? 2500 : 2000);
      return;
    }
    stop();
    if (b.id === 'prev') go(order.indexOf(state.e) - 1);
    else if (b.id === 'next') go(order.indexOf(state.e) + 1);
    else if (b.dataset.e) go(order.indexOf(b.dataset.e));
  });
  // Left and right arrows step through the elections (the map itself pans by dragging).
  document.addEventListener('keydown', (ev) => {
    if (ev.target.closest('select, input')) return;
    if (ev.key === 'ArrowLeft') { stop(); go(order.indexOf(state.e) - 1); }
    if (ev.key === 'ArrowRight') { stop(); go(order.indexOf(state.e) + 1); }
  });
  const applyLens = (key) => {
    const L2 = LENSES[key]; if (!L2) return;
    Object.assign(state, L2.set, { l: key, v: L2.v });
    if (key === 'changed' && !sameOffice[state.e]) state.e = 'pres2024';   // swing needs an earlier race
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
    state.v = LENSES[state.l] ? LENSES[state.l].v : 'west'; state.d = '3d'; render(); setCamera(state.v);
  });
  document.getElementById('flat').addEventListener('click', () => {
    state.d = state.d === '2d' ? '3d' : '2d';
    if (state.s === 'terrain' && terrain) { render(); setCamera(state.v); return; }
    viewState = { ...viewState, rotationX: state.d === '2d' ? 90 : 42, rotationOrbit: state.d === '2d' ? 0 : viewState.rotationOrbit,
      transitionDuration: reduced ? 0 : 600, transitionInterpolator: new deck.LinearInterpolator(['rotationX', 'rotationOrbit']) };
    deckgl.setProps({ viewState }); render();
  });
  // A shared link or the back button changes the hash: follow it.
  window.addEventListener('hashchange', () => {
    const prev = state.v + state.d; fromHash();
    render();
    if (state.v + state.d !== prev) setCamera(state.v);
  });
  window.__vt = { state, deckgl, elections, meta, terrain: () => terrain, colours: { GARNET: GARNET + '', SAPPHIRE: SAPPHIRE + '', NEUTRAL: NEUTRAL + '' } };   // for checks
  render();
})();
