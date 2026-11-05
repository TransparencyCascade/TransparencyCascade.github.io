/* The reader's selection: one set of counties shared by every view, kept across elections and tabs.
   { states: [..] | null, counties: Set, rule }. A drag is kept in the link as its rule, re-read against the
   election in the link (k: the Power tab's concentration marker). */
import { fmt, list, countyLabelOf } from './util.js';

export function createSelectionCodec({ geo, el, state, model, stName, house, power }) {
  const { meta } = geo, { elections } = el;
  const ALL_ST = new Set(Object.values(meta).map((m) => m.st));
  const countiesOf = (states) => { const S = new Set(states); return Object.keys(meta).filter((f) => S.has(meta[f].st)); };
  const pctCh = (a, b) => (a - b) / b * 100;
  const QUAD = { ne: (x, y) => x > 0 && y > 0, sw: (x, y) => x < 0 && y < 0, nw: (x, y) => x <= 0 && y > 0, se: (x, y) => x > 0 && y <= 0 };
  const changeRows = () => model.rowsNow().filter((r) => r.v && r.b && r.b[1] > 0 && r.b[2] > 0);
  const RULES = {
    // k:<d|r>:<q>: the counties holding q percent of one party's votes, biggest first (the Power tab's marker).
    k: ([pk, q]) => { const r = power && (pk === 'd' || pk === 'r') && elections[state.e] && !elections[state.e].house ? power.reach(state.e, pk, Math.max(1, Math.min(99, +q || 50))) : null; return r ? r.list.map((f) => ({ f })) : []; },
    r: ([k, lo, hi]) => model.rowsNow().filter((r) => { const x = k === 's' ? r.s : r.m; return r.v && x != null && x >= +lo && x <= +hi; }),
    q: ([k]) => (QUAD[k] ? changeRows().filter((r) => QUAD[k](pctCh(r.v[1], r.b[1]), pctCh(r.v[2], r.b[2]))) : []),
    b: ([box]) => { const [x0, x1, y0, y1] = (box || '').split(',').map(Number);
      return changeRows().filter((r) => { const x = pctCh(r.v[1], r.b[1]), y = pctCh(r.v[2], r.b[2]); return x >= x0 && x <= x1 && y >= y0 && y <= y1; }); },
  };
  const encode = (sel) => (!sel ? '' : sel.states ? 's:' + sel.states.join(',') : sel.rule ? sel.rule
    : sel.counties.size <= 300 ? 'c:' + [...sel.counties].join(',') : '');
  const decode = (text) => {
    if (!text) return null;
    const [kind, ...p] = text.split(':');
    let states = null, cs = [];
    if (kind === 's') { states = p.join(':').split(',').filter((st) => ALL_ST.has(st)); cs = countiesOf(states); }
    else if (kind === 'c') cs = p.join(':').split(',').filter((f) => meta[f]);
    else if (RULES[kind]) cs = RULES[kind](p).map((r) => r.f);
    return cs.length ? { states: states && states.length ? states : null, counties: new Set(cs), rule: RULES[kind] ? text : null } : null;
  };
  // spec: { states } or { counties, rule }; opts.add merges (shift-click, long press), opts.toggle lets a second
  // click on the same thing clear it.
  const next = (sel, spec, opts = {}) => {
    if (!spec) return null;
    let out = null;
    const states = spec.states ? spec.states.slice() : null, cs = states ? countiesOf(states) : spec.counties || [];
    const same = sel && (states ? sel.states && sel.states.join(',') === states.join(',') : !sel.states && cs.length === 1 && sel.counties.size === 1 && sel.counties.has(cs[0]));
    if (opts.add && sel) {
      const merged = new Set(sel.counties);
      if (!states && cs.length === 1 && merged.has(cs[0])) merged.delete(cs[0]); else cs.forEach((f) => merged.add(f));
      out = { states: states && sel.states ? [...new Set([...sel.states, ...states])] : null, counties: merged, rule: null };
    } else if (!(opts.toggle && same)) out = { states, counties: new Set(cs), rule: spec.rule || null };
    return out && out.counties.size ? out : null;
  };
  const summary = (sel) => {
    // On the House track the selection counts districts: those in every state the selection touches.
    if (house && house.isHouse()) {
      const sts = sel.states || [...new Set([...sel.counties].map((f) => meta[f].st))];
      const n = house.data.districts.filter((d) => sts.includes(d.st)).length;
      return `${sts.length <= 3 ? list(sts.map(stName)) : `${sts.length} states`}: ${fmt(n)} House district${n === 1 ? '' : 's'}, ${elections[state.e].label}`;
    }
    const d = elections[state.e].data, sts = new Set(); let votes = 0, none = 0;
    for (const f of sel.counties) { sts.add(meta[f].st); if (d[f]) votes += d[f][0]; else none++; }
    const n = sel.counties.size, first = sel.counties.values().next().value;
    const where = sel.states ? `${sel.states.length <= 3 ? list(sel.states.map(stName)) : `${sel.states.length} states`}, ${fmt(n)} counties`
      : n === 1 ? countyLabelOf(meta, first) : `${fmt(n)} counties in ${sts.size} state${sts.size > 1 ? 's' : ''}`;
    return `${where}: ${fmt(votes)} votes in ${elections[state.e].label}${none ? ` (${fmt(none)} with no race)` : ''}`;
  };
  return { ALL_ST, encode, decode, next, summary, pctCh };
}
