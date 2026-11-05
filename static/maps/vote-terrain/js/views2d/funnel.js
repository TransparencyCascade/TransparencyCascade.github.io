/* Funnel (county tracks, any election year 2016-2024; arithmetic in ../funnel.js, data funnel.json from the EAC's EAVS): from residents to ballots
   counted for the nation or the selection, each stage a bar as wide as its share of residents, beside the effective weight of a vote for the same
   place. A second selection (state.fc) puts a second funnel beside the first. Hover a stage for its count, rate and EAVS item; click it to choose the
   rate it stands for (removal rate, rejection rate, registration gap) and colour Circles or Terrain by it. Reasons for removal are shown as the
   jurisdictions reported them; a removal or a rejection is not a count of eligible voters turned away, and no count here is said to have changed an
   outcome. A figure no jurisdiction reported is shown as missing, never as zero, with how many jurisdictions did not report it. */
import { RATES, REASONS, NVRA_NOTE } from '../funnel.js';

const pct = (x, d = 1) => (x == null ? '–' : (x * 100).toFixed(d) + '%');

export function funnelView({ ctx, head, body, foot, place }) {
  const { fmt } = ctx;
  const exporting = document.body.classList.contains('export');
  let root = null;
  const stateOptions = (cur, none) => `<option value="">${none}</option><option value="n"${cur === 'n' ? ' selected' : ''}>The nation</option>` + ctx.funnelStates().map(([st, name]) => `<option value="${st}"${st === cur ? ' selected' : ''}>${name}</option>`).join('');
  function build() {
    head.innerHTML = exporting ? '<span class="v2d-ref fn-note"></span>' :
      '<div class="seg v2d-seg fn-years" role="group" aria-label="Election year">' + ctx.funnelYears().map((y) => `<button data-fy="${y}">${y}</button>`).join('') + '</div>' +
      '<label class="v2d-label">Place <select class="fn-a" aria-label="Place"></select></label>' +
      '<label class="v2d-label">Compare with <select class="fn-b" aria-label="Compare with"></select></label>' +
      '<span class="fn-colour"></span><span class="v2d-ref fn-note"></span>';
    head.querySelectorAll('[data-fy]').forEach((b) => b.addEventListener('click', () => ctx.setFunnel({ fy: b.dataset.fy })));
    const a = head.querySelector('.fn-a'), b = head.querySelector('.fn-b');
    if (a) a.addEventListener('change', () => ctx.funnelPlace(a.value));
    if (b) b.addEventListener('change', () => ctx.setFunnel({ fc: !b.value ? '' : b.value === 'n' ? 'n' : 's:' + b.value }));
    body.innerHTML = '<div class="fn-wrap"></div>';
    root = body.querySelector('.fn-wrap');
    root.addEventListener('click', (ev) => { const r = ev.target.closest('[data-rate]'); if (r) ctx.setFunnel({ fs: r.dataset.rate }); });
    root.addEventListener('mousemove', (ev) => { const r = ev.target.closest('[data-tip]'); if (r) ctx.hoverHtml(r.dataset.tip, ev.clientX, ev.clientY); else ctx.hover(null); });
    root.addEventListener('mouseleave', () => ctx.hover(null));
  }
  const missingText = (x) => (x.miss ? `${fmt(x.miss)} ${x.miss === 1 ? 'jurisdiction' : 'jurisdictions'} did not report this${x.missShare ? ` (${pct(x.missShare)} of registered voters)` : ''}, so the figure is a floor` : '');
  const tipFor = (x, d) => {
    const lines = [`<b>${x.label}</b>`, x.v == null ? 'No jurisdiction reported this (missing, not zero)' : `${fmt(Math.round(x.v))} (${x.code})`];
    if (x.share != null && x.id !== 'pop') lines.push(`${pct(x.share)} of residents`);
    if (x.rate) lines.push(`${RATES[x.rateId].label}: ${pct(x.rate.rate)} (${fmt(Math.round(x.rate.num))} of ${fmt(Math.round(x.rate.den))})`);
    if (x.note) lines.push(`<span class="note">${x.note}</span>`);
    const m = missingText(x); if (m) lines.push(`<span class="note">${m}</span>`);
    if (x.id === 'rem' || x.id === 'mail_rej' || x.id === 'prov_rej') lines.push('<span class="note">A removal or a rejection is not a count of eligible voters turned away.</span>');
    return lines.join('<br>').replace(/"/g, '&quot;');
  };
  // The active-registrations bar and, beside it, the inactive band (hatched, labelled); the pair is centred like the other bars.
  const bandOf = (x) => {
    const b = x.band, iw = b && b.share != null ? Math.min(1, b.share) * 100 : 0;
    return b && iw ? `<span class="fn-band" data-tip="${tipFor(b).replace(/"/g, '&quot;')}" style="width:${iw.toFixed(2)}%" aria-hidden="true"><span class="fn-band-l">inactive</span></span>` : '';
  };
  const stageRow = (x, d, pressed) => {
    const w = x.share == null ? 0 : Math.min(1, x.share) * 100;
    return `<button class="fn-row${x.v == null ? ' fn-miss' : ''}" data-tip="${tipFor(x, d)}"${x.rateId ? ` data-rate="${x.rateId}"` : ''} aria-pressed="${x.rateId && x.rateId === pressed ? 'true' : 'false'}">` +
      `<span class="fn-lab">${x.label}<small>${x.code || ''}</small></span><span class="fn-track"><span class="fn-bar" style="width:${w.toFixed(2)}%"></span>${bandOf(x)}</span>` +
      `<span class="fn-num">${x.v == null ? 'missing' : fmt(Math.round(x.v))}<small>${x.id === 'pop' || x.share == null ? '' : pct(x.share)}${x.miss ? ` · ${fmt(x.miss)} jur. missing` : ''}</small></span></button>`;
  };
  const inactRow = (D, pressed) => {
    const x = D.band[0], t = D.band[1];
    return `<button class="fn-inact${x.v == null ? ' fn-miss' : ''}" data-tip="${tipFor(x)}" data-rate="inact" aria-pressed="${pressed === 'inact' ? 'true' : 'false'}">` +
      `<span class="fn-lab">${x.label}<i class="fn-swatch" aria-hidden="true"></i><span class="fn-aside">hatched</span><small>${x.code || ''}</small></span>` +
      `<span class="fn-num">${x.v == null ? 'missing' : fmt(Math.round(x.v))}<small>${x.rate ? pct(x.rate.rate) + ' of registrations' : ''}${t.v != null ? ` · all records ${fmt(Math.round(t.v))}` : ''}</small></span></button>` +
      `<p class="fn-inact-note">${NVRA_NOTE}</p>`;
  };
  const leakRow = (x, pressed) => `<button class="fn-leak${x.v == null ? ' fn-miss' : ''}" data-tip="${tipFor(x)}" data-rate="${x.rateId}" aria-pressed="${x.rateId === pressed ? 'true' : 'false'}">` +
    `<span class="fn-lab">${x.label}<small>${x.code || ''}</small></span><span class="fn-num">${x.v == null ? 'missing' : fmt(Math.round(x.v))}<small>${x.rate ? pct(x.rate.rate) + ' ' + ({ rem: 'of registered', mail_rej: 'of mail ballots returned', prov_rej: 'of provisional ballots' })[x.id] : ''}${x.miss ? ` · ${fmt(x.miss)} jur. missing` : ''}</small></span></button>`;
  const reasonsHtml = (R) => {
    if (!R.rows.length || R.total == null) return '';
    const body = R.rows.map((r) => `<tr><td>${r.label}<small>${r.code}</small></td><td>${r.v == null ? 'missing' : fmt(Math.round(r.v))}</td><td>${r.miss ? fmt(r.miss) : ''}</td></tr>`).join('');
    return `<details class="fn-reasons"><summary>Reasons as reported: ${fmt(Math.round(R.itemised))} of ${fmt(Math.round(R.total))} removals itemised</summary><table><thead><tr><th>Reason</th><th>Removed</th><th>Jur. missing</th></tr></thead><tbody>${body}</tbody></table>` +
      '<p>Reasons are as the jurisdictions reported them and do not always add to the total. A removal is a record taken off a list, not a count of eligible voters turned away.</p></details>';
  };
  const weightHtml = (D) => {
    const w = D.weight;
    if (!w) return `<div class="fn-weight"><b>Weight of one vote</b><p>No weight for this place: ${D.election ? ctx.funnelElectionLabel(D.election) : 'this election'} has no county results here.</p></div>`;
    const x = Math.max(0.25, Math.min(4, w.r)), pos = ((Math.log2(x) + 2) / 4) * 100;
    return `<div class="fn-weight" data-tip="${`<b>Weight of one vote, ${w.label}</b><br>${w.r.toFixed(2)}× the national average: the vote-weighted mean of the counties' weight per vote (electoral votes behind a county over its votes cast, effective.json).`.replace(/"/g, '&quot;')}">` +
      `<b>Weight of one vote</b><div class="fn-w">${w.r.toFixed(2)}×</div><div class="fn-wbar"><i style="left:${pos.toFixed(1)}%"></i><span style="left:50%"></span></div>` +
      '<div class="fn-wlab"><span>¼×</span><span>national average</span><span>4×</span></div>' +
      `<p>${w.label}: each vote counted here stands for ${w.ppv.toFixed(1)} residents.</p></div>`;
  };
  function column(D, pressed, cmp) {
    const nowhere = D.stages.every((s) => s.v == null);
    return `<section class="fn-col${cmp ? ' fn-cmp' : ''}"><h3 class="fn-h">${D.label} <small>${D.year}${D.noRows && D.noRows.length ? ` · ${D.noRows.length} counties without EAVS rows (Alaska and Wisconsin report as one state)` : ''}</small></h3>` +
      `<div class="fn-main"><div class="fn-funnel">${D.stages.map((x) => stageRow(x, D, pressed) + (x.id === 'act' ? inactRow(D, pressed) : '')).join('')}</div>` +
      `<div class="fn-leaks"><div class="fn-sub">Left the chain, and the reasons as reported</div>${D.leaks.map((x) => leakRow(x, pressed)).join('')}${reasonsHtml(D.reasons)}</div></div>` +
      weightHtml(D) + (nowhere ? '<p class="fn-none">No EAVS figures for this place.</p>' : '') + '</section>';
  }
  function draw() {
    place();
    const S = ctx.funnel(), msg = (t) => { root.innerHTML = `<p class="fn-msg">${t}</p>`; head.querySelector('.fn-note').textContent = ''; foot.textContent = ''; };
    if (!S) return msg('Loading the voter funnel…');
    if (S.error) return msg(S.error);
    head.querySelectorAll('[data-fy]').forEach((b) => b.setAttribute('aria-pressed', b.dataset.fy === String(S.year)));
    const a = head.querySelector('.fn-a'), b = head.querySelector('.fn-b'), sts = ctx.funnelStates();
    if (a) { a.innerHTML = '<option value="">The nation</option>' + (S.hasSel && !S.placeState ? '<option value="_" selected>Current selection</option>' : '') + sts.map(([st, name]) => `<option value="${st}">${name}</option>`).join(''); if (S.placeState || !S.hasSel) a.value = S.placeState || ''; }
    if (b) { b.innerHTML = stateOptions(S.compareState, 'No comparison'); }
    const rate = S.fs && RATES[S.fs];
    const col = head.querySelector('.fn-colour');
    if (col) col.innerHTML = rate ? `<span class="v2d-label">Colour by ${rate.label.toLowerCase()}:</span><button data-cw="circles" class="fn-go">Circles</button><button data-cw="terrain" class="fn-go">Terrain</button>` : '<span class="v2d-label">Click a stage to colour a map by its rate.</span>';
    if (col) col.querySelectorAll('[data-cw]').forEach((x) => x.addEventListener('click', () => ctx.colourFunnel(x.dataset.cw)));
    root.classList.toggle('fn-two', S.cols.length > 1);
    root.innerHTML = S.cols.map((D) => column(D, S.fs, S.cols.length > 1)).join('');
    head.querySelector('.fn-note').textContent = `${exporting ? '' : '· '}EAVS ${S.year}, ${S.cols.map((D) => D.label).join(' against ')}.`;
    foot.textContent = S.source;
  }
  return { build, draw };
}
