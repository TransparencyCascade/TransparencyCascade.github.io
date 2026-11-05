/* The voter funnel (funnel.json, built by tools/vote-terrain/build_funnel.py from the EAC's EAVS files): from residents to ballots counted
   for the nation, a set of states or a set of counties, in one election year 2016-2024. Pure functions over the data; owns no DOM.

   Stages: residents (census), citizens of voting age (CVAP), active registrations (the main registered bar), ballots cast (derived: counted plus
   mail and provisional ballots rejected, so a floor) and ballots counted. Beside the active bar, as a labelled band: inactive registrations
   (registered less active, EAVS A1a less A1b). EAVS's total registered (A1a) includes inactive records, which stay on the rolls until removed under the
   NVRA's notice-and-wait process (52 U.S.C. 20507(d)); in 2024 it nearly equals citizens of voting age, so as the main bar it hides the gap. Beside the chain: removals since the last general election (with
   the reasons the jurisdictions reported), mail ballots rejected and provisional ballots rejected. Every figure carries its EAVS item code.
   Missing values (EAVS codes -88, -99 and blanks) are never zero: a sum is of the jurisdictions that reported, and says how many did not.
   A removal or a rejection is not a count of eligible voters turned away, and nothing here says a count changed an outcome. */
export const STAGES = [
  { id: 'pop', label: 'Residents', note: 'the census count the effective vote uses' },
  { id: 'cvap', label: 'Citizens of voting age', note: 'ACS citizen voting-age population, as the effective vote uses' },
  { id: 'act', label: 'Active registrations', note: 'registered voters not marked inactive; inactive records are the band beside the bar' },
  { id: 'cast', label: 'Ballots cast', note: 'derived: counted plus mail and provisional ballots rejected (a floor)' },
  { id: 'counted', label: 'Ballots counted', note: 'people whose ballot was counted' },
];
// Beside the active bar: inactive registrations (registered less active, in the jurisdictions that reported both) and the registered total with them (A1a).
export const BAND = [
  { id: 'inact', label: 'Inactive registrations', note: 'registered but marked inactive: on the rolls until removed under the NVRA notice-and-wait process (52 U.S.C. 20507(d))' },
  { id: 'reg', label: 'All registration records', note: 'active and inactive together (EAVS A1a)' },
];
export const NVRA_NOTE = 'Inactive records stay on the rolls until removed under the National Voter Registration Act\'s notice-and-wait process: a notice, no reply, and no voting through the second federal general election after it (52 U.S.C. 20507(d)).';
export const LEAKS = [
  { id: 'rem', label: 'Removed from the rolls', note: 'since the last general election' },
  { id: 'mail_rej', label: 'Mail ballots rejected' },
  { id: 'prov_rej', label: 'Provisional ballots rejected' },
];
export const REASONS = [['rem_moved', 'moved'], ['rem_death', 'death'], ['rem_felony', 'felony'], ['rem_nonresp', 'failed to respond to a notice and did not vote'],
  ['rem_mental', 'mental incompetence'], ['rem_request', 'voter request'], ['rem_dup', 'duplicate record']];
// A stage's rate, what clicking it colours the map by: [numerator, denominator] ids (or a function of the aggregate), the label, and the span of
// colour in percentage points either side of the national rate. 'pr' rates read the build's pairwise-valid parts.
export const RATES = {
  cvr: { label: 'Citizens of voting age per resident', max: 10, stage: 'cvap' },
  gap: { label: 'Registration gap: citizens of voting age without an active registration', max: 25, stage: 'act' },
  inact: { label: 'Inactive share of registrations', max: 15, stage: 'inact' },
  rem: { label: 'Removal rate: removed per registered voter', max: 10, stage: 'rem' },
  mail: { label: 'Mail ballot rejection rate', max: 3, stage: 'mail_rej' },
  prov: { label: 'Provisional ballot rejection rate', max: 25, stage: 'prov_rej' },
  turn: { label: 'Ballots counted per citizen of voting age', max: 20, stage: 'counted' },
};
export const RATE_OF_STAGE = { cvap: 'cvr', act: 'gap', inact: 'inact', rem: 'rem', mail_rej: 'mail', prov_rej: 'prov', cast: 'turn', counted: 'turn' };
export const YEARS = [2016, 2018, 2020, 2022, 2024];

export function createFunnel({ data, eff, elections, meta, states }) {
  const ids = data.meta.ids, IX = Object.fromEntries(ids.map((k, i) => [k, i]));
  const cPos = Object.fromEntries(data.counties.map((f, i) => [f, i]));
  const itemMeta = Object.fromEntries(data.meta.items.map((x) => [x.id, x]));
  const basisOf = (y) => data.meta.basis[String(y)];
  const eavsCode = (id, y) => (itemMeta[id] && itemMeta[id].eavs[String(y)]) || null;
  const empty = () => ({ v: ids.map(() => 0), miss: ids.map(() => 0), missReg: ids.map(() => 0), has: ids.map(() => false), pr: new Array(10).fill(0), n: 0, nulls: ids.map(() => 0), units: 0 });
  const addRow = (A, S) => {   // a state or national row
    ids.forEach((k, i) => { A.miss[i] += S.miss[i] || 0; A.missReg[i] += S.missReg[i] || 0; if (S.v[i] != null) { A.v[i] += S.v[i]; A.has[i] = true; } });
    S.pr.forEach((x, i) => { A.pr[i] += x; }); A.n += S.n; A.units += 1;
  };
  const stPop = (st, b) => data.statePop[b][st] || 0, stCvap = (st, b) => data.stateCvap[b][st] || 0;
  // The aggregate for the nation (sel null), for whole states (sel.states) or for counties (sel.counties).
  function aggregate(year, sel) {
    const y = String(year), b = basisOf(year), A = empty();
    let pop = 0, cvap = 0, scope, label, noRows = [];
    if (!sel) {
      addRow(A, data.national[y]);
      for (const st of Object.keys(data.statePop[b])) { pop += stPop(st, b); cvap += stCvap(st, b); }
      scope = 'nation'; label = 'The nation';
    } else if (sel.states && sel.states.length) {
      for (const st of sel.states) { const S = data.state[y][st]; if (S) addRow(A, S); pop += stPop(st, b); cvap += stCvap(st, b); }
      scope = 'states'; label = sel.states.join(', ');
    } else {
      const rows = data.county[y], colsPop = data.pop[b], colsCvap = data.cvap[b];
      const touched = new Set();
      for (const f of sel.counties) {
        const i = cPos[f]; if (i == null) continue;
        pop += colsPop[i]; cvap += colsCvap[i];
        const r = rows[f];
        if (!r) { noRows.push(f); continue; }
        A.units += 1; touched.add(f);
        ids.forEach((k, j) => { if (r[j] == null) { A.nulls[j] += 1; } else { A.v[j] += r[j]; A.has[j] = true; } });
        // pairwise-valid rate parts at county level
        [['rem', 'reg'], ['mail_rej', 'mail_ret'], ['prov_rej', 'prov'], ['counted', 'reg'], ['act', 'reg']].forEach(([n, d], p) => { if (r[IX[n]] != null && r[IX[d]] != null) { A.pr[2 * p] += r[IX[n]]; A.pr[2 * p + 1] += r[IX[d]]; } });
      }
      A.miss = A.nulls.slice();
      scope = 'counties'; label = `${sel.counties.size} counties`;
    }
    return { year, scope, label, pop, cvap, A, noRows, get: (id) => itemOf({ A, pop, cvap, year }, id), unitsN: A.units };
  }
  // One stage's figure: { v, miss, missReg, code } (v null when no jurisdiction reported it).
  function itemOf(agg, id) {
    const { A, pop, cvap, year } = agg;
    if (id === 'pop') return { v: pop, miss: 0, missReg: 0, code: 'Census' };
    if (id === 'cvap') return { v: cvap, miss: 0, missReg: 0, code: 'ACS CVAP' };
    if (id === 'inact') { const n = A.pr[9] - A.pr[8]; return A.pr[9] > 0 ? { v: n, miss: A.miss[IX.act] || 0, missReg: A.missReg[IX.act] || 0, code: `${eavsCode('reg', year)} less ${eavsCode('act', year)}` } : { v: null, miss: A.miss[IX.act] || 0, missReg: 0, code: eavsCode('act', year) }; }
    const i = IX[id];
    if (i == null || !A.has[i]) return { v: null, miss: A.miss[i] || 0, missReg: 0, code: eavsCode(id, year) };
    return { v: A.v[i], miss: A.miss[i], missReg: A.missReg[i], code: eavsCode(id, year) };
  }
  // A rate of an aggregate: { rate, num, den } or null.
  function rateOf(agg, id) {
    const { A, pop, cvap } = agg, x = (n) => itemOf(agg, n).v;
    const pr = (p) => (A.pr[2 * p + 1] > 0 ? { rate: A.pr[2 * p] / A.pr[2 * p + 1], num: A.pr[2 * p], den: A.pr[2 * p + 1] } : null);
    if (id === 'rem') return pr(0);
    if (id === 'mail') return pr(1);
    if (id === 'prov') return pr(2);
    if (id === 'cvr') return pop > 0 && cvap > 0 ? { rate: cvap / pop, num: cvap, den: pop } : null;
    if (id === 'gap') return cvap > 0 && x('act') != null ? { rate: 1 - x('act') / cvap, num: cvap - x('act'), den: cvap } : null;
    if (id === 'inact') return A.pr[9] > 0 ? { rate: 1 - A.pr[8] / A.pr[9], num: A.pr[9] - A.pr[8], den: A.pr[9] } : null;
    if (id === 'turn') return cvap > 0 && x('counted') != null ? { rate: x('counted') / cvap, num: x('counted'), den: cvap } : null;
    return null;
  }
  // The rate for one county (the colour on the maps): null when the county has no figure.
  function countyRate(f, year, id) {
    const i = cPos[f]; if (i == null) return null;
    const r = data.county[String(year)][f], b = basisOf(year), pop = data.pop[b][i], cvap = data.cvap[b][i], g = (k) => (r ? r[IX[k]] : null);
    const frac = (a, d) => (a != null && d != null && d > 0 ? a / d : null);
    if (id === 'cvr') return frac(cvap, pop);
    if (id === 'gap') { const q = frac(g('act'), cvap); return q == null ? null : 1 - q; }
    if (id === 'inact') { const q = frac(g('act'), g('reg')); return q == null ? null : 1 - q; }
    if (id === 'rem') return frac(g('rem'), g('reg'));
    if (id === 'mail') return frac(g('mail_rej'), g('mail_ret'));
    if (id === 'prov') return frac(g('prov_rej'), g('prov'));
    if (id === 'turn') return frac(g('counted'), cvap);
    return null;
  }
  // Colour value for the maps: percentage points above (positive) or below the national rate; null without a figure.
  const natCache = {};
  function colourValue(f, year, id) {
    const k = year + id, nat = natCache[k] || (natCache[k] = rateOf(aggregate(year, null), id));
    const r = countyRate(f, year, id); if (r == null || !nat) return null;
    return (r - nat.rate) * 100;
  }
  // Weight of a vote for a selection (effective.json through the page's model): the vote-weighted mean of the counties' weight per vote against the national
  // average, residents per vote, and the election it is measured on. null when the election has no effective-vote data or the selection has no votes in it.
  function weightFor(year, sel, effOf, e) {
    if (!eff.elections[e]) return null;
    let sv = 0, sr = 0, pop = 0, votes = 0, n = 0;
    const list = sel ? (sel.counties ? [...sel.counties] : []) : Object.keys(elections[e].data);
    for (const f of list) { const x = effOf(f, e); if (!x) continue; sv += x.votes; sr += x.r * x.votes; pop += x.pop; votes += x.votes; n += 1; }
    const so = (eff.elections[e].stateOnly || {});
    if (!sel) for (const st in so) { /* Alaska's statewide total counts in the national figures, not in a county row */ votes += so[st].votes; }
    return n && sv ? { r: sr / sv, ppv: pop / votes, votes, counties: n, e, label: elections[e].label } : null;
  }
  const electionFor = (year) => ({ 2016: 'pres2016', 2018: 'sen2018', 2020: 'pres2020', 2022: 'sen2022', 2024: 'pres2024' })[year];
  // The reasons for removal, as reported, with their sum against the total.
  function reasons(agg) {
    const rows = REASONS.map(([id, label]) => ({ id, label, ...itemOf(agg, id) })).filter((r) => r.code);
    const tot = itemOf(agg, 'rem'), known = rows.reduce((a, r) => a + (r.v || 0), 0);
    return { rows, total: tot.v, itemised: known };
  }
  // One selection as the view, the table, the captions and the smoke test read it: every stage and leak with its count, EAVS item, share of
  // residents, rate and missing count; the reasons as reported; the weight of a vote.
  function describe(year, sel, effOf, label) {
    const agg = aggregate(year, sel), pop = agg.pop || 0;
    const fig = (id) => { const x = itemOf(agg, id), rid = RATE_OF_STAGE[id] || (id === 'rem' ? 'rem' : null), r = rid ? rateOf(agg, rid) : null;
      return { id, ...x, share: x.v != null && pop ? x.v / pop : null, rate: r, rateId: rid, missShare: x.missReg && itemOf(agg, 'reg').v ? x.missReg / itemOf(agg, 'reg').v : null }; };
    const e = electionFor(year), w = effOf ? weightFor(year, sel, effOf, e) : null;
    return { year, label: label || agg.label, scope: agg.scope, units: agg.unitsN, noRows: agg.noRows, agg,
      stages: STAGES.map((s) => ({ ...s, ...fig(s.id), ...(s.id === 'act' ? { band: { ...BAND[0], ...fig('inact') } } : {}) })), band: BAND.map((s) => ({ ...s, ...fig(s.id) })), leaks: LEAKS.map((s) => ({ ...s, ...fig(s.id) })), reasons: reasons(agg), weight: w, election: e };
  }
  const flagOf = (st, y) => (data.state[String(y)][st] ? { n: data.state[String(y)][st].n } : null);
  return { aggregate, describe, itemOf, rateOf, countyRate, colourValue, weightFor, electionFor, reasons, eavsCode, basisOf, flagOf, data, years: YEARS, has: (f) => f in cPos, stateIds: () => Object.keys(data.state[String(YEARS[0])]).filter((st) => data.statePop['2020'][st]).sort() };
}
