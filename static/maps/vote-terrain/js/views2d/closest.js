/* Closest races, any track, flat: a sortable table of every race on the election day in view (state.e's year):
   office, place, margin in votes and in points, votes to flip, and whether the seat changed hands against the previous
   race for it in the data. Filter by office (state.ro); click a heading to sort (the fewest votes to flip first by
   default); click a row to select its state (a House district selects its state, as everywhere on the House track).
   In an export only the rows that fit whole are drawn, said in the head. Arithmetic in ../races.js. */
import { GRAPHITE } from './style.js';

const FILTERS = [['', 'All'], ['pres', 'President'], ['sen', 'Senate'], ['house', 'House'], ['gov', 'Governor']];
const OFFICE = { pres: 'President', sen: 'Senate', house: 'House', gov: 'Governor' };

export function closestView({ ctx, head, body, foot, place, shiftOf }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let sort = { k: 5, dir: 1 };
  const COLS = (R) => [
    ['Office', (r) => OFFICE[r.office], String, 'l'], ['Place', (r) => r.place, String, 'l'], ['Winner', (r) => r.win, (x) => ({ D: 'Democratic', R: 'Republican' }[x] || 'undecided'), 'l'],
    ['Margin, votes', (r) => r.votes, fmt, 'r'], ['Margin, points', (r) => r.points == null ? null : Math.abs(r.points), (x) => x.toFixed(1), 'r'],
    ['Votes to flip', (r) => r.flip, fmt, 'r'], ['Changed hands', (r) => R.label(r) || null, String, 'l'],
  ];
  function build() {
    head.innerHTML = (exporting ? '' : '<div class="seg v2d-seg" role="group" aria-label="Office">' + FILTERS.map(([k, t]) => `<button data-ro="${k}">${t}</button>`).join('') + '</div>') +
      '<span class="v2d-ref cl-note"></span>';
    head.querySelectorAll('[data-ro]').forEach((b) => b.addEventListener('click', () => ctx.setRoad({ ro: b.dataset.ro })));
    body.innerHTML = '<div class="cl-wrap"><table class="cl"></table></div>';
    body.querySelector('table').addEventListener('click', (ev) => {
      const th = ev.target.closest('th');
      if (th) { const k = +th.dataset.k; sort = { k, dir: sort.k === k ? -sort.dir : k < 3 ? 1 : k === 6 ? 1 : 1 }; draw(false); return; }
      const tr = ev.target.closest('tr[data-st]'); if (!tr || exporting) return;
      ctx.select({ kind: 'states', states: [tr.dataset.st] }, { add: shiftOf(ev), frame: true });
    });
  }
  function draw() {
    const C = ctx.closest();
    head.querySelectorAll('[data-ro]').forEach((b) => b.setAttribute('aria-pressed', !!C && b.dataset.ro === C.office));
    const note = head.querySelector('.cl-note'), wrap = body.querySelector('.cl-wrap'), table = body.querySelector('table');
    place();
    if (!C || !C.rows) { note.textContent = C ? `No races for ${C.label} in the page.` : 'Loading…'; table.innerHTML = ''; foot.textContent = ''; return; }
    const R = C.races, cols = COLS(R), sel = ctx.selectedStates();
    let rows = C.rows.slice();
    const get = cols[sort.k][1];
    rows.sort((x, y) => { const a = get(x), c = get(y); if (a == null) return 1; if (c == null) return -1; return (typeof a === 'string' ? a.localeCompare(c, 'en', { numeric: true }) : a - c) * sort.dir; });
    let shown = rows;
    const hdr = `<thead><tr>${cols.map((c, i) => `<th data-k="${i}" class="${c[3]}"${i === sort.k ? ` aria-sort="${sort.dir > 0 ? 'ascending' : 'descending'}"` : ''}>${c[0]}</th>`).join('')}</tr></thead>`;
    const rowHtml = (r) => `<tr data-st="${r.st}"${sel && sel.has(r.st) ? ' class="on"' : ''}>${cols.map((c, i) => { const v = c[1](r); const t = v == null ? '' : c[2](v);
      const extra = i === 6 && r.note ? (t ? ' · ' : '') + r.note : '';
      const chip = i === 2 && r.win ? `<i class="cl-chip" style="background:${ctx.colour(r.win === 'D' ? 60 : -60, true)}"></i>` : '';
      return `<td class="${c[3]}">${chip}${esc(t + extra)}</td>`; }).join('')}</tr>`;
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    table.innerHTML = hdr + '<tbody>' + shown.map(rowHtml).join('') + '</tbody>';
    // An export shows whole rows only: as many as fit under the heading.
    let cut = '';
    if (exporting) {
      const avail = body.clientHeight || 400, th = table.querySelector('thead').getBoundingClientRect().height, rh = table.querySelector('tbody tr') ? table.querySelector('tbody tr').getBoundingClientRect().height : 24;
      const n = Math.max(3, Math.floor((avail - th - 4) / rh));
      if (n < shown.length) { shown = shown.slice(0, n); table.querySelector('tbody').innerHTML = shown.map(rowHtml).join(''); cut = ` The ${n} races ${sort.k === 5 && sort.dir > 0 ? 'with the fewest votes to flip' : 'at the top of this sort'} are shown; every race is on the page.`; }
    }
    note.textContent = `${C.label}: ${fmt(rows.length)} ${rows.length === 1 ? 'race' : 'races'}${C.office ? ` for ${OFFICE[C.office]}` : ''}, sorted by ${cols[sort.k][0].toLowerCase()} (${sort.dir > 0 ? 'lowest' : 'highest'} first). Votes to flip: voters switching from the winner to the runner-up, half the margin plus one.${cut}`;
    foot.textContent = C.sources + (C.unofficial ? ' ' + C.unofficial : '');
    ctx.viewNote(sel ? `${fmt(rows.filter((r) => sel.has(r.st)).length)} of the ${fmt(rows.length)} races shown are in the selected states.` : '');
  }
  return { build, draw, sort: () => sort, setSort: (s) => { sort = s; } };
}
