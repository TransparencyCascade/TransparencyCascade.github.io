/* Saved views and tours (views.json).
   A saved view is a name for one exact screen: its state (the same keys as the address hash), a title, a caption
   and a sources line, and optionally the snapshot its numbers come from. ?view=<slug> opens it still, with its
   caption; ?tour=<slug> steps through a list of views with Back, Next and Skip. Pieces and guide chapters cite
   views by slug, and tools/vote-terrain/export.mjs renders the same record as a card, a GIF or a video.

   Captions hold no typed numbers. Every figure is a token resolved from the page's data:
     {path.into.data|filter}   roots: bal (balance.json), eff (effective.json), house (house.json), hist (history.json), elections (the page's elections), calc (below)
     filters: n (1,234), raw (as written: years), x (4.2×), pct (12.3%), et (time, Eastern), last (last word), states (names joined),
              perstate ({ST: votes} as "60,134 in Pennsylvania, ...")
   calc.eff.<election>: hi, lo (state codes), hiName, loName, ratio (weight per vote, highest over lowest state)
   calc.hist: first, last (census rows), capYear, lastHiName/lastHiV, lastLoName/lastLoV (most and fewest residents per seat,
     latest census), smallFirst, smallLast, smallMin, smallMax (elections with the fewest and most votes in their smallest change)
   calc.house.<year>: ps, captured, contestable, atRisk, apart, capv, capvShare, st.<ST>.{captured, contestable, atRisk}
     (bands at the default plausible swing). An unknown token stops the caption and logs an error, so a broken
     caption cannot reach a card unnoticed. */
import { fmt, esc, list, $ } from './util.js';
import { createHouse } from './house.js';

export function createSavedViews({ registry, bal, eff, houseData, histData, elections, stName, apply }) {
  const etTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' }) + ' ET';
  // Derived figures, computed once from the data files (the House bands with their own state, at the default plausible swing).
  const calc = { eff: {}, house: {} };
  for (const [e, E] of Object.entries(eff.elections)) {
    const rows = Object.entries(E.states).sort((a, b) => b[1][0] - a[1][0]), [hi, lo] = [rows[0], rows[rows.length - 1]];
    calc.eff[e] = { hi: hi[0], lo: lo[0], hiName: stName(hi[0]), loName: stName(lo[0]), ratio: hi[1][0] / lo[1][0] };
  }
  for (const y of houseData.years) {
    const h = createHouse({ data: houseData, state: { e: 'house' + y, ps: '' }, elections }).now();
    const c = { captured: 0, contestable: 0, 'at risk': 0, apart: 0 };
    for (const d of h.districts) c[d.band] += 1;
    const capv = Object.values(h.states).reduce((a, s) => a + s.capv, 0), T = Object.values(h.states).reduce((a, s) => a + s.T, 0);
    calc.house[y] = { ps: h.plausible.value, captured: c.captured, contestable: c.contestable, atRisk: c['at risk'], apart: c.apart, capv, capvShare: capv / T * 100,
      st: Object.fromEntries(Object.entries(h.states).map(([st, s]) => [st, { captured: s.captured, contestable: s.contestable, atRisk: s.atRisk }])) };
  }
  // The long view (history.json): first and last census, the 1929 act's year, the widest and narrowest smallest change.
  {
    const P = histData.perSeat, last = P[P.length - 1], L = histData.smallest;
    const byVotes = L.slice().sort((a, b) => a.votes - b.votes);
    calc.hist = { first: P[0], last, capYear: histData.cap.signed.slice(0, 4), lastHiName: stName(last.hi), lastHiV: last.states[last.hi].perSeat,
      lastLoName: stName(last.lo), lastLoV: last.states[last.lo].perSeat, smallFirst: L[0].year, smallLast: L[L.length - 1].year,
      smallMin: byVotes[0], smallMax: byVotes[byVotes.length - 1] };
    // Weight per vote over time: the first and last presidential year, with the states named.
    const Wt = histData.weight, wF = Wt[0], wL = Wt[Wt.length - 1];
    Object.assign(calc.hist, { wFirst: wF, wLast: wL, wLastBigName: stName(wL.senate.big), wLastSmallName: stName(wL.senate.small),
      wLastHiName: stName(wL.ev.hi), wLastLoName: stName(wL.ev.lo), wFirstHiName: stName(wF.ev.hi), wFirstLoName: stName(wF.ev.lo) });
  }
  const roots = { bal, eff, house: houseData, hist: histData, elections, calc };
  const FILTERS = {
    n: (v) => fmt(v), raw: (v) => String(v), x: (v) => v.toFixed(1) + '×', pct: (v) => v.toFixed(1) + '%', et: (v) => etTime(v),
    last: (v) => String(v).split(' ').pop(), states: (v) => list(v.map(stName)),
    perstate: (v) => list(Object.entries(v).sort((a, b) => b[1] - a[1]).map(([st, n]) => `${fmt(n)} in ${stName(st)}`)),
  };
  const resolve = (text) => text.replace(/\{([^}|]+)(?:\|(\w+))?\}/g, (whole, p, f) => {
    let v = roots;
    for (const k of p.split('.')) v = v == null ? undefined : v[k];
    if (v === undefined || (f && !FILTERS[f])) { console.error(`views.json: cannot resolve ${whole}`); return '[?]'; }
    return f ? FILTERS[f](v) : typeof v === 'number' ? (Number.isInteger(v) ? fmt(v) : String(v)) : String(v);
  });
  const view = (slug) => registry.views.find((v) => v.slug === slug);
  const tour = (slug) => registry.tours.find((t) => t.slug === slug);
  // The text of a view, resolved: what the card on the page and the exported card both show.
  const text = (slug, caption) => { const v = view(slug); return { title: resolve(v.title), caption: resolve(caption || v.caption), sources: resolve(v.sources), file: resolve(v.file || v.title) }; };

  // The card on the page: the view's title, caption and sources; on a tour, Back, Next and Skip with the step count.
  const card = $('viewCard');
  let current = null;   // { kind: 'view', slug } or { kind: 'tour', slug, i }
  const draw = () => {
    if (!current) { card.hidden = true; return; }
    const t = current.kind === 'tour' ? tour(current.slug) : null, step = t ? t.steps[current.i] : null;
    const slug = step ? step.view : current.slug, x = text(slug, step && step.caption);
    card.innerHTML = `<header><b>${esc(x.title)}</b>${t ? `<span class="vc-step">${current.i + 1} of ${t.steps.length}</span>` : ''}<button class="vc-close" aria-label="Close">×</button></header>` +
      `<p class="vc-caption">${esc(x.caption)}</p><p class="vc-src">${esc(x.sources)}</p>` +
      (t ? `<div class="vc-nav"><button class="vc-back"${current.i === 0 ? ' disabled' : ''}>Back</button><button class="vc-next">${current.i === t.steps.length - 1 ? 'Done' : 'Next'}</button><button class="vc-skip">Skip</button></div>` : '');
    card.hidden = false;
  };
  const go = (i) => { current.i = i; apply(view(tour(current.slug).steps[i].view).state); draw(); };
  card.addEventListener('click', (ev) => {
    const b = ev.target.closest('button'); if (!b) return;
    if (b.classList.contains('vc-close') || b.classList.contains('vc-skip')) close();
    else if (b.classList.contains('vc-back')) go(current.i - 1);
    else if (b.classList.contains('vc-next')) { const t = tour(current.slug); if (current.i < t.steps.length - 1) go(current.i + 1); else close(); }
  });
  const close = () => { current = null; draw(); onResize(); };
  let onResize = () => {};
  const open = (spec, { applyState = true } = {}) => {
    if (spec.view && view(spec.view)) { current = { kind: 'view', slug: spec.view }; if (applyState) apply(view(spec.view).state); }
    else if (spec.tour && tour(spec.tour)) { current = { kind: 'tour', slug: spec.tour, i: 0 }; if (applyState) apply(view(tour(spec.tour).steps[0].view).state); }
    else return false;
    draw(); return true;
  };
  return { open, close, draw, text, view, tour, resolve, calc, isOpen: () => !!current, current: () => current, setOnResize: (f) => { onResize = f; } };
}

// Which saved view or tour the address asks for (?view=, ?tour=), checked against the registry's slug format.
export const askedFor = () => {
  const q = new URLSearchParams(location.search), ok = (s) => (s && /^[a-z0-9][a-z0-9-]{0,80}$/.test(s) ? s : null);
  return { view: ok(q.get('view')), tour: ok(q.get('tour')), exporting: q.get('export') === '1' };
};
