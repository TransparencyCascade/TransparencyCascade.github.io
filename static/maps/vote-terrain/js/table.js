/* Table: the numbers behind the view in use, as in the tooltip. */
import { fmt, esc, countyLabelOf, $ } from './util.js';

export function createTable({ geo, el, state, model, selection, effW, pctCh, OFFICE_NAME }) {
  const { meta } = geo, { elections } = el;
  const wrap = $('tableWrap'), table = $('table');
  let sort = { k: 2, dir: -1 };
  const lead = (x) => (x == null ? '' : (x >= 0 ? 'D+' : 'R+') + Math.abs(x).toFixed(1));
  const signedPct = (p) => (p == null ? '' : (p >= 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%');
  const render = () => {
    const b = model.baselineOf(), w = effW(), sel = selection();
    let rs = model.rowsNow().filter((r) => r.v);
    if (sel) rs = rs.filter((r) => sel.counties.has(r.f));
    const effOf = model.effOf;
    const cols = [
      ['County', (r) => countyLabelOf(meta, r.f).replace(/, \w\w$/, ''), String], ['State', (r) => r.st, String],
      ['Votes', (r) => r.v[0], fmt], ['Republican', (r) => r.v[1], fmt], ['Democratic', (r) => r.v[2], fmt],
      ['Margin', (r) => r.m, lead],
      ...(b ? [['Swing', (r) => r.s, (s) => (s == null ? '' : `${Math.abs(s).toFixed(1)} to ${s >= 0 ? 'D' : 'R'}`)]] : []),
      ...(b && w === 'scatter' ? [['Rep. votes', (r) => (r.b && r.b[1] > 0 ? pctCh(r.v[1], r.b[1]) : null), signedPct],
        ['Dem. votes', (r) => (r.b && r.b[2] > 0 ? pctCh(r.v[2], r.b[2]) : null), signedPct]] : []),
      ...(model.effShown() ? [['Residents per vote', (r) => (effOf(r.f) || {}).ppv, (x) => (x == null ? '' : x.toFixed(2))],
        ...[['Weight per vote', 'r'], ['State EV per resident', 'B'], ['Residents per eligible', 'N'], ['Eligible per vote', 'T']]
          .map(([name, key]) => [name, (r) => (effOf(r.f) || {})[key], (x) => (x == null ? '' : x.toFixed(2) + '×')])] : []),
    ];
    if (sort.k >= cols.length) sort = { k: 2, dir: -1 };
    const get = cols[sort.k][1];
    rs = rs.slice().sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c) : a - c) * sort.dir; });
    $('tableTitle').textContent = `${sel ? 'Selected counties' : 'Every county'}, ${elections[state.e].label}`;
    $('tableNote').textContent = `${fmt(rs.length)} ${rs.length === 1 ? 'county' : 'counties'}` + (b ? `. Swing in points since ${model.baselineLabel()}` : '') +
      (b && w === 'scatter' ? '; vote changes in percent since the same race' : '') + '. Click a heading to sort.';
    table.innerHTML = '<thead><tr>' + cols.map((c, i) => `<th data-k="${i}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('') + '</tr></thead><tbody>' +
      (rs.length ? rs.map((r) => '<tr>' + cols.map((c) => `<td>${esc(c[2](c[1](r)))}</td>`).join('') + '</tr>').join('')
        : `<tr><td colspan="${cols.length}">No ${OFFICE_NAME[model.officeOf(state.e)].toLowerCase()} race with county results here in ${elections[state.e].year}.</td></tr>`) + '</tbody>';
  };
  table.addEventListener('click', (ev) => {
    const th = ev.target.closest('th'); if (!th) return;
    const k = +th.dataset.k; sort = { k, dir: sort.k === k ? -sort.dir : k < 2 ? 1 : -1 }; render();
  });
  const open = () => { wrap.hidden = false; render(); $('tableClose').focus(); };
  const close = () => { wrap.hidden = true; };
  const toggle = () => (wrap.hidden ? open() : close());
  $('tableBtn').addEventListener('click', toggle);
  $('tableClose').addEventListener('click', close);
  return { render, open, close, toggle, isOpen: () => !wrap.hidden, refresh: () => { if (!wrap.hidden) render(); } };
}
