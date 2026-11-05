/* Balance of power: what the votes decided, for the election on the timeline (balance.json,
   build_balance.py), collapsed to one line per office or open in full with the smallest change. */
import { SAPPHIRE, GARNET } from './colour.js';
import { fmt, list, $ } from './util.js';
import { dataUrl } from './data.js';

export function createBalance({ el, bal, state, house, selection, onResize }) {
  const { elections } = el;
  const D_COL = d3.rgb(SAPPHIRE) + '', R_COL = d3.rgb(GARNET) + '';
  const pct = (n, total) => (n / total * 100).toFixed(2) + '%';
  const bar = (d, r, total, unc = 0) => `<div class="bar" role="img" aria-label="Democrats ${d}, Republicans ${r}${unc ? `, ${unc} not called` : ''}, of ${total}">` +
    `<i style="width:${pct(d, total)};background:${D_COL}"></i>${unc ? `<i class="u" style="width:${pct(unc, total)}"></i>` : ''}<i style="width:${pct(r, total)};background:${R_COL}"></i><b></b></div>`;
  const openOf = (ho) => (ho.leading ? ho.leading.D + ho.leading.R : 0) + ho.uncalled;
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '−' : '±') + Math.abs(n);
  const stName = (st) => bal.stateNames[st] || st;
  const etTime = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', month: 'short', day: 'numeric', year: 'numeric' });
  // Each election maps to its election day's entry in balance.json.
  const BALKEY = { pres2016: 'pres2016', pres2020: 'pres2020', pres2024: 'pres2024', sen2018: 'd2018', gov2018: 'd2018',
    sen2020: 'pres2020', sen2022: 'd2022', gov2022: 'd2022', sen2024: 'pres2024', sen2026: 'sen2026', gov2026: 'sen2026',
    house2022: 'd2022', house2024: 'pres2024', house2026: 'sen2026' };
  // On the House track the House line comes from the district file (house.json): the same counts as the
  // House history office for 2022 and 2024 (build_house.py checks it), and calls and leads for 2026.
  const withHouse = (b) => {
    if (!house.isHouse()) return b;
    const y = String(elections[state.e].year), s = house.data.seats[y];
    return { ...b, house: y === '2026'
      ? { called: s.called, leading: s.leading, uncalled: s.uncalled, uncalledSeats: s.uncalledSeats, before: b.house.before, asof: house.data.asof2026 }
      : { ...b.house, D: s.D, R: s.R } };
  };
  // A smallest-change line is a button: it selects its states.
  const flip = (states, text) => { const sel = selection();
    return `<button class="flip" data-states="${states.join(',')}" aria-pressed="${!!(sel && sel.states && sel.states.join(',') === states.join(','))}">${text}</button>`; };

  function render() {
    const b0 = bal.elections[BALKEY[state.e]], b = b0 && withHouse(b0), body = $('bopBody'), lines = $('bopLines');
    if (!b) { body.innerHTML = lines.innerHTML = ''; return; }
    lines.innerHTML = compact(b);
    $('bopTitle').textContent = `Balance of power, ${elections[state.e].year}`;   // the election day, whatever the office in view
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
      const ho = b.house, d = ho.called.D, r = ho.called.R, open = openOf(ho);
      h += `<h3>House, called so far</h3>${bar(d, r, 435, open)}` +
        `<p>Democrats ${d}, Republicans ${r}, ${open} not called. ${d >= 218 ? 'Democrats have a majority.' : r >= 218 ? 'Republicans have a majority.' : ''}</p>` +
        (ho.leading ? `<p>Leading in the races not called: Democrats ${ho.leading.D}, Republicans ${ho.leading.R}${ho.uncalled ? `; no leader counted in ${list(ho.uncalledSeats)} (Louisiana's open primary goes to a Dec. 12 runoff)` : ''}.</p>` : '') +
        `<p class="muted">Before the election: Republicans ${ho.before.R}, Democrats ${ho.before.D}.${ho.asof ? ` House figures from the district file, unofficial as of ${etTime(ho.asof)} ET.` : ''}</p>`;
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
    h += `<p class="src">Sources: ${first}<a href="${S.senate}">U.S. Senate</a>, <a href="${S.house}">House history office</a>${house.isHouse() ? `, <a href="${dataUrl('house.json')}">the district file</a>` : ''}` +
      (b.smallest && b.smallest.president ? `, <a href="${S.countypres}">MIT Election Lab</a>` : '') +
      (b.smallest && b.smallest.senate ? `, <a href="${b.smallest.senate.source.split(' ')[0]}">${/medsl|MEDSL|github/.test(b.smallest.senate.source) ? 'MIT Election Lab Senate file' : 'FEC'}</a>` : '') +
      (b.president ? '' : '. Governors by party are not shown: no single official source was at hand') + `. Every figure and its source: <a href="${dataUrl('balance.json')}">balance.json</a>.</p>`;
    body.innerHTML = h;
    fit();
  }
  // One line per office for the collapsed box: the same figures as the full box.
  function compact(b) {
    const last = (n) => n.replace(/,? Jr\.$/, '').split(' ').pop();
    let h = '';
    if (b.president) h += `<p class="line" title="Electoral votes">${last(b.president.winner)} ${b.president.ev} · ${last(b.president.runner)} ${b.president.runnerEv}</p>`;
    if (b.senate && b.senate.caucusD != null) h += `<p class="line">Senate R ${b.senate.R} · D ${b.senate.caucusD}${bar(b.senate.caucusD, b.senate.R, 100)}</p>`;
    if (b.senate && b.senate.holdover) { const s = b.senate, d = s.holdover.D + s.called.D, r = s.holdover.R + s.called.R;
      h += `<p class="line">Senate, called: D ${d} · R ${r}${s.uncalled.length ? ` · ${s.uncalled.length} open` : ''}${bar(d, r, 100, s.uncalled.length)}</p>`; }
    if (b.house && b.house.R != null) h += `<p class="line">House R ${b.house.R} · D ${b.house.D}${bar(b.house.D, b.house.R, 435, 435 - b.house.D - b.house.R)}</p>`;
    if (b.house && b.house.called) h += `<p class="line">House, called: D ${b.house.called.D} · R ${b.house.called.R} · ${openOf(b.house)} open${bar(b.house.called.D, b.house.called.R, 435, openOf(b.house))}</p>`;
    return h;
  }
  // Keep the box below the key: its height is capped to the space between the key and the bottom edge.
  const fit = () => {
    const box = $('bop'); if (window.innerWidth <= 900) { box.style.maxHeight = ''; return; }
    const kb = document.querySelector('.key').getBoundingClientRect().bottom;
    box.style.maxHeight = Math.max(140, window.innerHeight - kb - 12 - 22) + 'px';
  };
  const box = $('bop'), toggle = $('bopToggle');
  const setOpen = (open) => {
    box.classList.toggle('open', open); toggle.setAttribute('aria-expanded', open); toggle.textContent = open ? '−' : '+'; toggle.setAttribute('aria-label', open ? 'Show less' : 'Show the full balance of power');
    $('bopBody').hidden = !open; $('bopLines').hidden = open;
    try { localStorage.setItem('vt-bop-open', open ? '1' : '0'); } catch (e) { /* storage off: the choice lasts this visit */ }
    fit();
    onResize();
  };
  toggle.addEventListener('click', () => setOpen(!box.classList.contains('open')));
  window.addEventListener('resize', fit);
  setOpen((() => { try { return localStorage.getItem('vt-bop-open') === '1'; } catch (e) { return false; } })());
  return { render, fit, stName };
}
