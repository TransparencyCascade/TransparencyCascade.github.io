/* Read-once text: the lens notes, the About drawer (lenses, key, effective-vote method, moving around,
   notes and sources) and the state ranking for weight per vote. */
import { fmt, esc, $ } from './util.js';
import { LENSES } from './state.js';
import { dataUrl } from './data.js';
import { EG_DEF } from './views2d/seats.js';

export function createAbout({ el, eff, state, tip, selection, select, stName, house }) {
  const { elections } = el;
  // A lens's sentence shows the first time the lens is chosen; the "i" beside it shows it on demand.
  const seenHint = {};
  const lensHint = (key) => {
    const box = $('lensHow'); let seen = true;
    try { seen = localStorage.getItem('vt-lens-' + key) === '1'; localStorage.setItem('vt-lens-' + key, '1'); } catch (e) { seen = !!seenHint[key]; }
    seenHint[key] = true;
    box.hidden = seen; if (!seen) $('lensHowText').textContent = LENSES[key].how;
  };
  $('lensHowClose').addEventListener('click', () => { $('lensHow').hidden = true; });
  // An "i" button: its text in the tip on hover, focus or click.
  const infoButton = (b, text) => {
    const show = () => { const r = b.getBoundingClientRect(); tip.place(text(), r.right + 8, r.top - 4); };
    b.addEventListener('mouseenter', show); b.addEventListener('focus', show);
    b.addEventListener('mouseleave', tip.hide); b.addEventListener('blur', tip.hide);
    b.addEventListener('click', (ev) => { ev.stopPropagation(); if (tip.hidden()) show(); else tip.hide(); });
  };
  document.querySelectorAll('[data-li]').forEach((b) => infoButton(b, () => LENSES[b.dataset.li].how));

  // About this map.
  const about = $('about'), aboutBtn = $('aboutBtn');
  $('aboutLenses').innerHTML = Object.keys(LENSES).map((k) =>
    `<dt>${document.querySelector(`[data-l="${k}"]`).textContent}</dt><dd>${LENSES[k].how}</dd>`).join('');
  const openAbout = (at) => { about.hidden = false; aboutBtn.setAttribute('aria-expanded', 'true'); $('aboutClose').focus();
    if (at) $(at).scrollIntoView({ block: 'start' }); };
  const closeAbout = () => { about.hidden = true; aboutBtn.setAttribute('aria-expanded', 'false'); };
  aboutBtn.addEventListener('click', () => (about.hidden ? openAbout() : closeAbout()));
  $('keyInfo').addEventListener('click', () => openAbout('aboutKeyHead'));
  $('aboutClose').addEventListener('click', closeAbout);

  // State ranking: weight per vote by state for the election in view, with its three parts; a row selects its state.
  const rank = $('rank');
  const renderRank = () => {
    const E = eff.elections[state.e]; if (!E) { rank.hidden = true; return; }
    const rows = Object.entries(E.states).sort((a, b) => b[1][0] - a[1][0]);
    $('rankTitle').textContent = `Weight per vote, ${elections[state.e].label}`;
    const sel = selection(), cur = sel && sel.states ? new Set(sel.states) : new Set();
    $('rankBody').innerHTML = rows.map(([st, [r, B, N, T]]) => { const x = { r, B, N, T };
      return `<button class="rrow" data-st="${st}" aria-pressed="${cur.has(st)}"><span class="rn">${esc(stName(st))}</span><span class="rv">${r.toFixed(2)}×</span>${tip.partsBar(x, 150)}</button>`; }).join('');
    $('rankLegend').innerHTML = tip.partsLegend({ B: NaN, N: NaN, T: NaN }).replace(/ ×NaN/g, '');
  };
  $('rankBody').addEventListener('click', (ev) => { const b = ev.target.closest('[data-st]'); if (b) { tip.hide(); select({ states: [b.dataset.st] }, { toggle: true, frame: true }); renderRank(); } });
  $('rankBody').addEventListener('mousemove', (ev) => { const b = ev.target.closest('[data-st]'); if (!b) return; const E = eff.elections[state.e], [r, B, N, T] = E.states[b.dataset.st];
    tip.place(`<b>${esc(stName(b.dataset.st))}</b><br>Electoral weight per vote: ${r.toFixed(2)}× the national average${tip.partsBar({ r, B, N, T })}${tip.partsLegend({ r, B, N, T })}`, ev.clientX, ev.clientY); });
  $('rankBody').addEventListener('mouseleave', tip.hide);
  $('rankBtn').addEventListener('click', () => { rank.hidden = !rank.hidden; if (!rank.hidden) { renderRank(); $('rankClose').focus(); } });
  $('rankClose').addEventListener('click', () => { rank.hidden = true; });

  // The effective-vote method, its checks and sources.
  {
    const c = eff.checks, pc = c.population;
    $('aboutEff').innerHTML =
      `<p>Each county's votes stand for a share of its state's electoral votes: the state's electoral votes times the county's share of the state's census population. Weight per vote is that share divided by the votes cast, shown against the national average (all electoral votes on the map over all votes cast). It splits exactly into three parts that multiply back to it:</p>` +
      `<dl><dt>State electoral votes per resident</dt><dd>the state's electoral votes over its census population, against the national figure (two Senate electors per state, and House seats rounded to whole numbers).</dd>` +
      `<dt>Residents per eligible citizen</dt><dd>census population over citizens of voting age, against the national figure (children and non-citizens are counted for apportionment but cannot vote).</dd>` +
      `<dt>Eligible citizens per vote cast</dt><dd>citizens of voting age over votes cast, against the national figure (turnout).</dd></dl>` +
      `<p>Residents per vote is census population over votes cast. Represented population, as a height or circle size, is each county's share of the apportioned electoral votes, drawn on President 2024's vote scale so it does not move with turnout.</p>` +
      `<p class="note">${esc(eff.notes.basis)} ${esc(eff.notes.CT)} ${esc(eff.notes.fold)} ${esc(eff.notes.AK)} ${esc(eff.notes.senate_governor)} Citizen counts are survey estimates, so the smallest counties carry wide margins of error.</p>` +
      `<p class="note">Checks: the three parts multiply back to the ratio for every county and state in every election (largest difference ${c.decomposition_max_relative_error.toExponential(0)}). County populations sum to the census national totals: ${fmt(pc['2010_counties_plus_AK'])} in 2010 and ${fmt(pc['2020_counties_plus_AK'])} in 2020, Alaska included as a state total. House seats plus two equal each state's electoral votes for both apportionments.</p>` +
      `<p class="src">Sources: ${eff.sources.map((x) => `<a href="${esc(x.url)}">${esc(x.what)}</a>`).join('; ')}. Every figure: <a href="${dataUrl('effective.json')}">effective.json</a>.</p>`;
  }
  // The House track: what its two views show and the one setting behind the bands.
  {
    const H = house.data;
    $('aboutHouse').innerHTML =
      `<p>House results are by district: ${H.years.join(', ')}, with ${H.years[H.years.length - 1]} unofficial until certified. Choose House above the timeline. Districts places each state's districts by margin; Seats and votes sets each state's share of the two-party House vote against its share of seats. The county views and the four lenses stand down on this track.</p>` +
      `<dl><dt>Plausible swing</dt><dd>One setting behind the bands, under Adjust, kept in the link. Default: ${esc(H.plausible.how)} (${H.plausible.value} points). "State observed" uses each state's own median; states with fewer than ${H.minSwings} observed swings use the national figures.</dd>` +
      `<dt>At risk</dt><dd>A held seat whose margin is below the plausible swing.</dd>` +
      `<dt>Captured</dt><dd>A margin above the state's largest observed swing, or above the plausible swing when that is higher. It describes the result, not anyone's intent.</dd>` +
      `<dt>Contestable</dt><dd>Between the two.</dd>` +
      `<dt>Captured votes</dt><dd>In a captured seat, the winner's votes beyond the captured line, plus all of the runner-up's.</dd>` +
      `<dt>Efficiency gap</dt><dd>${esc(EG_DEF.replace(/^Efficiency gap: /, ''))}</dd></dl>` +
      `<p class="note">Swings are measured only between elections on unchanged lines. Sources: ${H.years.map((y) => esc(H.sources[y])).join('; ')}.</p>`;
  }
  // The Power tab: its three charts, one at a time.
  $('aboutPower').innerHTML =
    `<p>Three charts of how the system turns votes into power, for the election in view (county tracks only), one at a time:</p>` +
    `<dl><dt>Weight per vote</dt><dd>States ranked by the electoral weight of one vote against the national average, each bar split into the three parts above, on a doubling scale so the parts add up to the state's weight.</dd>` +
    `<dt>Cartogram</dt><dd>One square per state, sized by its share of the votes cast, of the electoral votes in force or of the Senate's seats; choosing a measure plays the change between them.</dd>` +
    `<dt>Concentration</dt><dd>Each party's counties ordered from most of its votes to fewest, against the share of the land (or of the counties) they cover. Drag the marker; the counties it reaches become the selection.</dd></dl>` +
    `<p class="note">${esc(eff.notes.AK)}</p>`;
  return { lensHint, infoButton, closeAbout, isAboutOpen: () => !about.hidden, renderRank, isRankOpen: () => !rank.hidden, closeRank: () => { rank.hidden = true; } };
}
