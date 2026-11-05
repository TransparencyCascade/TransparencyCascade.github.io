/* The hover tip shared by every view, and the county numbers it shows. */
import { fmt, clamp, lead, countyLabelOf, $ } from './util.js';

export function createTooltip({ geo, el, bal, state, model }) {
  const { meta } = geo, { elections, notes } = el;
  const OFFICE_NAME = { president: 'President', senate: 'Senate', governor: 'Governor', house: 'House' };
  const tip = document.createElement('div');
  tip.className = 'vt-tip'; tip.hidden = true; document.body.appendChild(tip);
  const place = (html, x, y) => {
    tip.innerHTML = html;
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    // Below-right of the pointer, flipping above or left when it would run off screen or over the timeline.
    const tl = $('timeline').getBoundingClientRect();
    const floor = Math.min(window.innerHeight, tl.top) - 8;
    tip.style.left = (x + 14 + w > window.innerWidth - 8 ? Math.max(8, x - 14 - w) : x + 14) + 'px';
    tip.style.top = (y + 14 + h > floor ? Math.max(8, y - 14 - h) : y + 14) + 'px';
  };
  const hide = () => { tip.hidden = true; };

  // Effective vote: residents per vote, the weight ratio and its three parts as a bar on a doubling scale
  // (parts above 1 stack right of the centre line, parts below 1 stack left; the black tick is their
  // product, the county's ratio).
  const PARTS = [['B', 'State electoral votes per resident', '#23306B'], ['N', 'Residents per eligible citizen', '#8890B4'], ['T', 'Eligible citizens per vote cast', '#C3C7CE']];
  const partsBar = (x, w = 200) => {
    const u = w / 2 / 2.5;                     // pixels per doubling: the bar spans 2.5 doublings each way
    let pos = w / 2, neg = w / 2, h = '';
    for (const [k, , col] of PARTS) {
      const l = Math.log2(x[k]) * u;
      if (l >= 0) { h += `<i style="left:${pos.toFixed(1)}px;width:${l.toFixed(1)}px;background:${col}"></i>`; pos += l; }
      else { neg += l; h += `<i style="left:${neg.toFixed(1)}px;width:${(-l).toFixed(1)}px;background:${col}"></i>`; }
    }
    const t = clamp(w / 2 + Math.log2(x.r) * u, 1, w - 1);
    return `<span class="pbar" style="width:${w}px" role="img" aria-label="Weight ${x.r.toFixed(2)} times the average">${h}<span class="z" style="left:${w / 2}px"></span><span class="t" style="left:${t.toFixed(1)}px"></span></span>`;
  };
  const partsLegend = (x) => `<span class="plegend">${PARTS.map(([k, name, col]) => `<span><i style="background:${col}"></i>${name} ×${x[k].toFixed(2)}</span>`).join('')}</span>`;
  const effTip = (f) => {
    const x = model.effOf(f); if (!x) return '';
    return `<br>${x.ppv.toFixed(2)} residents per vote (${x.basis} Census)${x.u18 != null ? `; ${(x.u18 * 100).toFixed(0)}% under 18` : ''}` +
      `<br>Electoral weight per vote: ${x.r.toFixed(2)}× the national average${partsBar(x)}${partsLegend(x)}`;
  };

  // A county's numbers in the election in view.
  const countyHtml = (f) => {
    const m = meta[f], e = elections[state.e], v = e.data[f], office = model.officeOf(state.e);
    const head = `<b>${countyLabelOf(meta, f)}</b><br>`;
    if (!v) {
      const why = m.st === 'AK' ? notes.AK : office === 'president' ? 'No result in the source for this county.'
        : `No Democrat-vs-Republican ${OFFICE_NAME[office].toLowerCase()} race with county results here in ${e.year} (see the notes in the panel).`;
      return head + why;
    }
    const s = model.swingOf(f), w = model.weighted(), effOn = model.effShown();
    return head + `${e.label}${e.unofficial ? ' (unofficial)' : ''}<br>` +
      `${fmt(v[0])} votes, ${fmt(v[0] / m.sqmi)} per square mile<br>` +
      `Republican ${fmt(v[1])}, Democratic ${fmt(v[2])}<br>Margin ${lead(model.margin(v))}` +
      (s != null ? `<br>Swing since ${model.baselineLabel(m.st)}: ${Math.abs(s).toFixed(1)} points toward the ${s >= 0 ? 'Democrat' : 'Republican'}` : '') +
      (w && !effOn ? `<br>${state.h === 'ev' ? 'Electoral' : 'Senate'} weight of a vote in ${bal.stateNames[m.st] || m.st}: ${(w.factor[m.st] || 0).toFixed(2)} times the average` : '') +
      (effOn ? effTip(f) : '') +
      `<br><span style="color:#5B6168">${e.source}</span>`;
  };
  // Hover from a view: a county under the pointer, or null to hide.
  const hoverCounty = (f, x, y) => { if (!f) hide(); else place(countyHtml(f), x, y); };

  return { place, hide, hidden: () => tip.hidden, countyHtml, hoverCounty, partsBar, partsLegend, OFFICE_NAME };
}
