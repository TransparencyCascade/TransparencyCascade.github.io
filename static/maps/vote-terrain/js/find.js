/* Find: type-ahead over counties and states; choosing one selects and frames it. */
import { esc, clamp, countyLabelOf, $ } from './util.js';

export function createFind({ geo, el, ALL_ST, stName, choose }) {
  const { meta } = geo, { elections } = el;
  const box = $('find'), input = $('findInput'), listEl = $('findList');
  const index = [...[...ALL_ST].map((st) => ({ st, label: stName(st), key: (stName(st) + ' ' + st).toLowerCase() })),
    ...Object.keys(meta).map((f) => ({ f, label: countyLabelOf(meta, f), key: countyLabelOf(meta, f).replace(/,/g, '').toLowerCase(), v: (elections.pres2024.data[f] || [0])[0] }))
      .sort((a, b) => b.v - a.v)];
  let hits = [], at = 0;
  const render = () => {
    const q = input.value.trim().replace(/,/g, '').toLowerCase();
    // Name matches first, then matches inside a name; states before counties, bigger counties first.
    hits = !q ? [] : [...index.filter((x) => x.key.startsWith(q)), ...index.filter((x) => !x.key.startsWith(q) && x.key.includes(q))].slice(0, 12);
    at = Math.min(at, Math.max(0, hits.length - 1));
    listEl.innerHTML = hits.map((x, i) => `<li role="option" id="fh${i}" data-i="${i}" aria-selected="${i === at}">${esc(x.label)}${x.st ? ' (state)' : ''}</li>`).join('')
      || (q ? '<li aria-disabled="true">No county or state by that name</li>' : '');
    input.setAttribute('aria-activedescendant', hits.length ? 'fh' + at : '');
  };
  const open = () => { box.hidden = false; input.value = ''; at = 0; render(); input.focus(); };
  const close = () => { box.hidden = true; input.blur(); };
  const pick = (i) => { const x = hits[i]; if (!x) return; close(); choose(x.st ? { states: [x.st] } : { counties: [x.f] }); };
  input.addEventListener('input', () => { at = 0; render(); });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') { ev.preventDefault(); close(); }
    else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); at = clamp(at + (ev.key === 'ArrowDown' ? 1 : -1), 0, Math.max(0, hits.length - 1)); render(); }
    else if (ev.key === 'Enter') { ev.preventDefault(); pick(at); }
  });
  listEl.addEventListener('mousedown', (ev) => { const li = ev.target.closest('[data-i]'); if (li) { ev.preventDefault(); pick(+li.dataset.i); } });
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) box.hidden = true; }, 120));
  $('findBtn').addEventListener('click', open);
  return { open, close, isOpen: () => !box.hidden };
}
