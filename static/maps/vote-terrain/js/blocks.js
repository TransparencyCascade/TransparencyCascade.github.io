/* Exact counties (deck.gl): each county extruded flat, height = votes / area, with two reference blocks
   of 1,000,000 votes on different footprints. Drag pans; shift-drag tilts and turns, inside limits so the
   map cannot flip. */
import { clamp, reduced } from './util.js';
import { rgb, NEUTRAL } from './colour.js';

export function createBlocks({ container, pieces, presets, k, tooltipHtml, onError, initial }) {
  // ---------- reference blocks: 1,000,000 votes on two footprints ----------
  const REF = 1000000, [rx, ry] = presets.ref.target;
  const square = (cx, cy, s) => [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]];
  const refs = [{ s: 9, x: rx - 34 }, { s: 22, x: rx + 12 }].map((r) => ({ p: square(r.x, ry, r.s), h: k * REF / (r.s * r.s), x: r.x }));

  const view = new deck.OrbitView({ orbitAxis: 'Z', fovy: 40 });
  const Z0 = presets.national.zoom;
  const LIMITS = { minZoom: Z0 - 1.2, maxZoom: Z0 + 5, minTilt: 8, maxTilt: 88, maxTurn: 180 };
  const EDGE_ZOOM = Z0 + 1.1;               // county edges appear once zoomed in past the national view
  let flat = initial.flat;
  const constrain = (vs) => ({
    ...vs,
    zoom: clamp(vs.zoom, LIMITS.minZoom, LIMITS.maxZoom),
    rotationX: flat ? 90 : clamp(vs.rotationX, LIMITS.minTilt, LIMITS.maxTilt),
    rotationOrbit: clamp(vs.rotationOrbit, -LIMITS.maxTurn, LIMITS.maxTurn),
  });
  // The national view is fitted to the space between the panel (left) and the key (right); the
  // projection is 975 units wide. Close-ups look in at a lower, more oblique angle, so their blocks stand
  // against the horizon (rotationX: 90 looks straight down; lower is more oblique). West and east look
  // across the country from low on the horizon, so heights read as a skyline.
  const LOOK = { national: { tilt: 42 }, west: { tilt: 14, orbit: 90, across: true }, east: { tilt: 14, orbit: -90, across: true },   // deck's orbit sign is opposite three.js's
                 texas: { tilt: 30, zoom: 1.45 }, maine: { tilt: 34, zoom: 1.9 } };
  const interp = () => new deck.LinearInterpolator(['target', 'zoom', 'rotationX', 'rotationOrbit']);
  const camera = (name, side, animate) => {
    const look = LOOK[name] || { tilt: 42 }, p = presets[name] || presets.national, { left, right } = side;
    const avail = Math.max(320, window.innerWidth - left - right);
    const zoom = name === 'national' ? Math.log2(avail * 1.08 / 975) : look.across ? Math.log2(avail * 0.95 / 610) : look.zoom ?? p.zoom;
    const shift = (left - right) / 2 / 2 ** zoom;
    return { target: [p.target[0] - shift, p.target[1] - (flat ? 0 : 18 / 2 ** zoom), 0], zoom, rotationX: flat ? 90 : look.tilt, rotationOrbit: flat ? 0 : look.orbit || 0,
      transitionDuration: reduced || !animate ? 0 : 900, transitionInterpolator: interp() };
  };
  let viewState = camera(initial.view, initial.side, false);
  const transitions = reduced ? {} : { getElevation: { duration: 800 }, getFillColor: { duration: 800 } };

  // Matte paper lit from the north-west: each side of a block takes a different shade.
  const lighting = new deck.LightingEffect({
    ambient: new deck.AmbientLight({ color: [255, 255, 255], intensity: 1.15 }),
    key: new deck.DirectionalLight({ color: [255, 252, 246], intensity: 0.75, direction: [1, 1.6, -2.2] }),
  });
  const PAPER = { ambient: 0.82, diffuse: 0.42, shininess: 2, specularColor: [8, 8, 8] };   // tops near true colour, sides shaded

  // A county that sinks (net margin) is drawn with its base below ground, extruded up to ground level.
  const sunk = (p, h) => p.map((ring) => ring.map((q) => [q[0], q[1], h]));
  let scene = initial.scene;
  function layers() {
    const { heightOf, colourOf, key } = scene;
    return [
      new deck.PolygonLayer({
        id: 'counties', data: pieces, extruded: true, wireframe: viewState.zoom > EDGE_ZOOM, pickable: true,
        getPolygon: (d) => { const h = heightOf(d.f); return h < 0 ? sunk(d.p, h) : d.p; },
        getElevation: (d) => Math.abs(heightOf(d.f)), getFillColor: (d) => colourOf(d.f),
        getLineColor: [35, 48, 107, 34], material: PAPER,
        updateTriggers: { getPolygon: key, getElevation: key, getFillColor: key }, transitions,
      }),
      new deck.SolidPolygonLayer({
        id: 'refs', data: refs, visible: !flat, getPolygon: (d) => d.p, extruded: true,
        getElevation: (d) => d.h, getFillColor: rgb(NEUTRAL), material: PAPER,
      }),
      new deck.TextLayer({
        id: 'ref-labels', data: [{ x: rx - 12, y: ry - 26, t: '1,000,000 votes each' }], visible: !flat,
        getPosition: (d) => [d.x, d.y, 0], getText: (d) => d.t, getSize: 14, getColor: [35, 48, 107],
        fontFamily: 'Courier Prime, monospace', billboard: true,
      }),
    ];
  }
  const deckgl = new deck.Deck({
    parent: container, views: view, effects: [lighting], onError,
    controller: { dragMode: 'pan', inertia: 250, keyboard: false, scrollZoom: { speed: 0.01, smooth: true } },
    onViewStateChange: ({ viewState: vs }) => {
      const edges = viewState.zoom > EDGE_ZOOM;
      viewState = constrain(vs);
      deckgl.setProps(edges !== viewState.zoom > EDGE_ZOOM ? { viewState, layers: layers() } : { viewState });
      return viewState;
    },
    viewState, layers: layers(),
    getTooltip: ({ object, layer }) => (object && layer.id === 'counties' ? { html: tooltipHtml(object.f) } : null),
    parameters: { clearColor: [232 / 255, 236 / 255, 236 / 255, 1] },
  });
  const look = (vs) => { viewState = vs; deckgl.setProps({ viewState }); };

  return {
    // scene: { heightOf(f), colourOf(f) -> [r,g,b], flat, key } (key changes whenever heights or colours do).
    draw(next) { scene = next; flat = next.flat; deckgl.setProps({ layers: layers() }); },
    view(name, side, animate = true) { look(camera(name, side, animate)); },
    // Frame a set of counties from a low angle.
    frame(counties) {
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const pc of pieces) if (counties.has(pc.f)) for (const q of pc.p[0]) {
        x0 = Math.min(x0, q[0]); x1 = Math.max(x1, q[0]); y0 = Math.min(y0, q[1]); y1 = Math.max(y1, q[1]);
      }
      if (!isFinite(x0)) return;
      const zoom = Math.log2(Math.min(window.innerWidth * 0.55 / (x1 - x0 + 30), window.innerHeight * 0.6 / (y1 - y0 + 30)));
      look({ ...viewState, target: [(x0 + x1) / 2, (y0 + y1) / 2, 0], zoom: clamp(zoom, LIMITS.minZoom, LIMITS.maxZoom), rotationX: 34, rotationOrbit: 0,
        transitionDuration: reduced ? 0 : 900, transitionInterpolator: interp() });
    },
    // The Flat map button: tip straight down (or back up) without moving.
    tip(toFlat) {
      flat = toFlat;
      look({ ...viewState, rotationX: toFlat ? 90 : 42, rotationOrbit: toFlat ? 0 : viewState.rotationOrbit,
        transitionDuration: reduced ? 0 : 600, transitionInterpolator: new deck.LinearInterpolator(['rotationX', 'rotationOrbit']) });
    },
    pick(clientX, clientY) {
      const r = container.getBoundingClientRect(), o = deckgl.pickObject({ x: clientX - r.left, y: clientY - r.top, layerIds: ['counties'] });
      return o && o.object ? o.object.f : null;
    },
    destroy() { try { deckgl.finalize(); } catch (e) { /* already gone */ } },
  };
}
