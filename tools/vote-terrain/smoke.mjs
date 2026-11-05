#!/usr/bin/env node
/* Smoke test for the vote-terrain page (static/maps/vote-terrain).

   Serves the page from disk, opens it in headless Chromium (playwright-core) with WebGL (SwiftShader)
   and again with WebGL off, walks a list of scenarios (tabs, lenses, offices, elections, shapes,
   selections, table, find, keys, phone width, saved views and tours, one card export, the Power tab) and records for each: the hash, the text of the key,
   balance box, notes and panels, which buttons are pressed, a hash of every flat-view SVG, and a
   screenshot. Reduced motion is on, so every transition lands in one frame.

     node tools/vote-terrain/smoke.mjs --record     write the baseline
     node tools/vote-terrain/smoke.mjs              compare against it (exit 1 on any difference)
     options: --only <substring>  --out <dir> (default tools/vote-terrain/.smoke)  --root <page folder>  --loose <prefix>
              (--loose: screenshot differences in scenarios starting with <prefix> are reported, not failed)

   Needs playwright-core (VT_PLAYWRIGHT: its folder) and a Chromium (VT_CHROME: the executable; see CHROME below). */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv0 = process.argv.slice(2);
const ROOT = path.resolve(argv0.includes('--root') ? argv0[argv0.indexOf('--root') + 1] : path.join(HERE, '../../static/maps/vote-terrain'));
const PW = process.env.VT_PLAYWRIGHT || path.join(process.env.HOME, 'tcp-skills/plugins/tcp-skills/skills/article-images/scripts/node_modules/playwright-core');
const { chromium } = createRequire(PW + '/')(PW);

const argv = process.argv.slice(2), flag = (k) => argv.includes(k), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const RECORD = flag('--record'), ONLY = opt('--only', ''), OUT = path.resolve(opt('--out', path.join(HERE, '.smoke'))), LOOSE = opt('--loose', null);
const BASE = path.join(OUT, 'baseline'), RUN = path.join(OUT, RECORD ? 'baseline' : 'run');
const CDN = path.join(OUT, 'cdn');
fs.mkdirSync(RUN, { recursive: true }); fs.mkdirSync(CDN, { recursive: true });

// ---------- static server: the page folder, as the site would serve it ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}/`;

// ---------- scenarios ----------
const key = (k) => async (page) => { await page.keyboard.press(k); };
const click = (sel) => async (page) => { await page.click(sel); };
const seq = (...fs2) => async (page) => { for (const f of fs2) { await f(page); await settle(page); } };
const hover = (x, y) => async (page) => { await page.mouse.move(x - 40, y - 40); await page.mouse.move(x, y); await page.waitForTimeout(250); };
// Hover the circle of one county (a datum that is the county code, or has .f) in the selector's elements.
const hoverAt = (selector, f) => async (page) => {
  const b = await page.evaluate(([q, f]) => { const c = [...document.querySelectorAll(q)].find((n) => { const d = n.__data__; return d === f || (d && d.f === f); }).getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; }, [selector, f]);
  await page.mouse.move(b.x - 30, b.y - 30); await page.mouse.move(b.x, b.y); await page.waitForTimeout(250);
};
const SCENARIOS = [
  { name: 't-default', hash: 'w=terrain' },
  { name: 't-overhead', hash: 'v=national' },
  { name: 't-strong', hash: 'm=8&v=national' },
  { name: 't-lens-won', hash: 'w=terrain', act: key('2') },
  { name: 't-lens-changed', hash: 'w=terrain', act: key('3') },
  { name: 't-lens-worth', hash: 'w=terrain', act: seq(key('4'), click('#rankBtn')) },
  { name: 't-worth-people', hash: 'w=terrain', act: seq(key('4'), click('[data-wh=pop]')) },
  { name: 't-worth-senate', hash: 'w=terrain', act: seq(key('4'), click('[data-wh=sen]')) },
  { name: 't-sen2026-swing', hash: 'e=sen2026&c=swing&v=national' },
  { name: 't-gov2026', hash: 'e=gov2026&v=national' },
  { name: 't-gov2018-swing', hash: 'e=gov2018&c=swing&v=national' },
  { name: 't-ghost', hash: 'e=pres2020&c=swing&g=1&l=custom' },
  { name: 't-county-scale', hash: 'n=county&v=national&l=custom' },
  { name: 't-net-r', hash: 'h=net&u=r&v=national&l=custom' },
  { name: 't-flat', hash: 'd=2d&l=custom' },
  { name: 't-texas', hash: 'v=texas' },
  { name: 't-east', hash: 'v=east' },
  { name: 't-sel-states', hash: 'sel=s:TX,OK&v=national' },
  { name: 't-sel-frame', hash: 'v=national', act: async (page) => { await page.evaluate(() => window.__vt.setSelection({ states: ['MI'] }, { frame: true })); } },
  { name: 't-hover', hash: 'v=national', act: hover(700, 470), tip: true },
  { name: 't-click-select', hash: 'v=national', act: async (page) => { await page.mouse.click(700, 470); } },
  { name: 'b-blocks', hash: 's=blocks&v=national&l=custom' },
  { name: 'b-blocks-west', hash: 's=blocks&l=custom' },
  { name: 'b-blocks-net', hash: 's=blocks&h=net&v=texas&l=custom' },
  { name: 'b-blocks-sel', hash: 's=blocks&sel=s:CA&v=national&l=custom' },
  { name: 'b-blocks-flat', hash: 's=blocks&d=2d&l=custom' },
  { name: 'b-blocks-worth', hash: 's=blocks&h=ev&c=weight&v=national&l=custom' },
  { name: 'b-blocks-hover', hash: 's=blocks&v=national&l=custom', act: hover(700, 470), tip: true },
  { name: 'b-blocks-frame', hash: 's=blocks&v=national&l=custom', act: async (page) => { await page.evaluate(() => window.__vt.setSelection({ states: ['OH'] }, { frame: true })); } },
  { name: 'c-circles', hash: 'w=circles' },
  { name: 'c-circles-people', hash: 'w=circles&h=pop&l=worth' },
  { name: 'c-circles-sen2026', hash: 'w=circles&e=sen2026' },
  { name: 'c-circles-sel', hash: 'w=circles&sel=s:FL' },
  { name: 'c-circles-hover', hash: 'w=circles', act: hover(640, 400), tip: true },
  { name: 'a-arrows', hash: 'w=arrows' },
  { name: 'a-arrows-sel', hash: 'w=arrows&sel=s:PA', act: click('#selFrame') },
  { name: 'a-arrows-options', hash: 'w=arrows', act: seq(click('[data-a=votes]'), click('[data-a=exc]')) },
  { name: 'd-dots', hash: 'w=dots' },
  { name: 'd-dots-spread', hash: 'w=dots', act: click('[data-sort=spread]') },
  { name: 'd-dots-rule', hash: 'w=dots&sel=r:s:5.0:20.0' },
  { name: 'd-dots-gov2026', hash: 'w=dots&e=gov2026' },
  { name: 's-scatter', hash: 'w=scatter' },
  { name: 's-scatter-raw', hash: 'w=scatter', act: seq(click('[data-x=raw]'), click('[data-k=state]')) },
  { name: 's-scatter-quad', hash: 'w=scatter&sel=q:nw' },
  { name: 's-scatter-box', hash: 'w=scatter&sel=b:-10.0,10.0,0.0,30.0' },
  { name: 'x-table', hash: 'sel=s:DE&v=national', act: key('t') },
  { name: 'x-table-scatter', hash: 'w=scatter&sel=s:RI', act: seq(key('t'), click('#table th[data-k="0"]')) },
  { name: 'x-find', hash: 'v=national', act: async (page) => { await page.keyboard.press('/'); await page.keyboard.type('cook'); } },
  { name: 'x-find-pick', hash: 'v=national', act: async (page) => { await page.keyboard.press('/'); await page.keyboard.type('maricopa'); await page.keyboard.press('Enter'); } },
  { name: 'x-about', hash: 'v=national', act: click('#aboutBtn') },
  { name: 'x-keys', hash: 'v=national', act: seq(key('ArrowLeft'), key('v')) },
  { name: 'x-office', hash: 'v=national', act: click('[data-office=governor]') },
  { name: 'x-office-swing', hash: 'c=swing&e=pres2020&v=national', act: click('[data-office=senate]') },
  { name: 'x-flip', hash: 'e=pres2020&v=national', act: seq(click('#bopToggle'), click('#bopBody .flip')) },
  { name: 'x-bop-2026', hash: 'e=sen2026&v=national', act: click('#bopToggle') },
  { name: 'x-escape', hash: 'sel=s:NV&v=national', act: key('Escape') },
  { name: 'x-play', hash: 'e=pres2016&v=national', act: async (page) => { await page.click('#play'); await page.waitForTimeout(2800); await page.click('#play'); } },
  { name: 'x-reset', hash: 'v=texas&l=won', act: click('#reset') },
  { name: 'p-phone', hash: '', viewport: { width: 390, height: 844 } },
  { name: 'p-phone-terrain', hash: 'w=terrain', viewport: { width: 390, height: 844 } },
  // Exact counties: Per county and Republicans up change the block heights (Los Angeles, Cook, Loving TX).
  { name: 'b-blocks-scale-party', hash: 's=blocks&v=national&l=custom', probe: async (page) => {
    const hs = () => page.evaluate(() => ['06037', '17031', '48301'].map((f) => +window.__vt.blocks().heightOf(f).toFixed(4)));
    const out = { area: await hs() };
    await page.click('summary'); await page.click('[data-n=county]'); await settle(page); out.county = await hs();
    await page.click('[data-h=net]'); await settle(page); out.netD = await hs();
    await page.click('[data-u=r]'); await settle(page); out.netR = await hs();
    out.allChange = out.area.join() !== out.county.join() && out.county.join() !== out.netD.join() && out.netD.every((h, i) => h === -out.netR[i]);
    return out; } },
  // County-equivalent names in the tip: DC, a parish, independent cities and the counties that share their names.
  { name: 'x-county-names', hash: 'v=national', probe: (page) => page.evaluate(() =>
    ['11001', '22001', '51760', '51159', '24510', '24005', '29510', '32510', '51036'].map((f) => window.__vt.tipHtml(f).split('<br>')[0].replace(/<[^>]+>/g, ''))) },
  // Arrows and Circles fit their map after leaving the tab, a resize while away, and coming back.
  ...['arrows', 'circles'].map((w) => ({ name: `a-${w}-refit`, hash: `w=${w}`, probe: async (page) => {
    await page.click('[data-w=dots]'); await settle(page);
    await page.setViewportSize({ width: 1280, height: 820 }); await settle(page);
    await page.click(`[data-w=${w}]`); await settle(page);
    const back = await page.evaluate(() => document.querySelector('#v2d svg.v2d-map > g').getAttribute('transform'));
    await page.reload(); await page.waitForFunction(() => window.__vt); await settle(page); await page.waitForTimeout(500);
    const fresh = await page.evaluate(() => document.querySelector('#v2d svg.v2d-map > g').getAttribute('transform'));
    // Fitted means the fresh load's scale; the offset can differ by a few pixels (the head's reference glyph).
    const scale = (t) => +t.match(/scale\(([^)]+)\)/)[1];
    return { back, fresh, fitted: Math.abs(scale(back) - scale(fresh)) < 1e-9 }; } })),
  // The House track: Districts and Seats and votes, the plausible swing, tables, the balance box, and the
  // county views standing down.
  { name: 'h-strips', hash: 'e=house2026&w=strips' },
  { name: 'h-strips-2022', hash: 'e=house2022&w=strips' },
  { name: 'h-strips-state', hash: 'e=house2024&w=strips&ps=state' },
  { name: 'h-strips-sel', hash: 'e=house2026&w=strips&sel=s:TX' },
  { name: 'h-strips-hover', hash: 'e=house2026&w=strips', act: async (page) => { const b = await page.locator('#v2d .ticks rect').first().boundingBox(); await page.mouse.move(b.x + 1, b.y + 4); await page.waitForTimeout(250); }, tip: true },
  { name: 'h-strips-click', hash: 'e=house2026&w=strips', act: async (page) => { await page.locator('#v2d g.row .hit').nth(1).click({ position: { x: 20, y: 10 } }); } },
  { name: 'h-seats', hash: 'e=house2026&w=seats' },
  { name: 'h-seats-sel', hash: 'e=house2024&w=seats&sel=s:NC' },
  { name: 'h-seats-hover', hash: 'e=house2024&w=seats', act: async (page) => { const b = await page.locator('#v2d .seats-wrap svg circle').first().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'h-table-strips', hash: 'e=house2026&w=strips&sel=s:OH', act: key('t') },
  { name: 'h-table-seats', hash: 'e=house2024&w=seats', act: key('t') },
  { name: 'h-bop', hash: 'e=house2026&w=strips', act: click('#bopToggle') },
  { name: 'h-office', hash: 'e=pres2024&v=national', act: click('[data-office=house]') },
  { name: 'h-terrain-asked', hash: 'e=house2026&w=terrain' },
  { name: 'h-phone', hash: 'e=house2026&w=strips', viewport: { width: 390, height: 844 } },
  // The plausible swing is the one knob behind the bands: the slider writes ps= and moves the lines and counts.
  { name: 'h-plausible', hash: 'e=house2026&w=strips', probe: async (page) => {
    const bands = () => page.evaluate(() => { const h = window.__vt.house(), c = {}; for (const d of h.districts) c[d.band] = (c[d.band] || 0) + 1;
      return { c, ps: h.plausible.label, tx: h.lines.TX, capv: Object.values(h.states).reduce((a, s) => a + s.capv, 0) }; });
    const out = { def: await bands() };
    await page.click('summary');
    await page.$eval('#psRange', (r) => { r.value = '12'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(page);
    out.at12 = await bands(); out.hash12 = await page.evaluate(() => location.hash.includes('ps=12'));
    await page.click('[data-ps=state]'); await settle(page); out.state = await bands();
    await page.click('[data-ps=default]'); await settle(page); out.back = await bands();
    out.ok = out.hash12 && out.at12.c['at risk'] > out.def.c['at risk'] && out.at12.tx.captured >= 12 && out.at12.tx.atRisk === 12 && JSON.stringify(out.back) === JSON.stringify(out.def);
    return out; } },
  // Numbers against the data: 2022 and 2024 seats equal the House history office's divisions; every district counted.
  { name: 'h-data', hash: 'e=house2024&w=seats', probe: (page) => page.evaluate(() => {
    const H = window.__vt.house().data, seat = (y) => ({ D: H.seats[y].D, R: H.seats[y].R });
    const sums = Object.fromEntries(H.years.map((y) => [y, H.districts.reduce((a, d) => a + d.y[y][2], 0) === Object.values(H.states[y]).reduce((a, s) => a + s.T, 0)]));
    return { n: H.districts.length, s2022: seat('2022'), s2024: seat('2024'), sums, ok: H.districts.length === 435 && H.seats['2022'].D === 213 && H.seats['2022'].R === 222 && H.seats['2024'].D === 215 && H.seats['2024'].R === 220 }; }) },
  // Circles and Arrows keep the reader's zoom through a redraw (an election change), the head keeping its height.
  ...['circles', 'arrows'].map((w) => ({ name: `a-${w}-zoom-kept`, hash: `w=${w}&e=pres2024`, probe: async (page) => {
    const t = () => page.evaluate(() => [document.querySelector('#v2d svg.v2d-map > g').getAttribute('transform'), document.querySelector('.v2d-head').offsetHeight]);
    const b = await page.locator('#v2d svg.v2d-map').boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.wheel(0, -600); await page.waitForTimeout(400); await settle(page);
    const zoomed = await t(); await page.keyboard.press('ArrowLeft'); await settle(page); const after = await t();
    return { zoomed, after, kept: zoomed[0] === after[0] && zoomed[1] === after[1] }; } })),
  // Saved views and tours (views.json): ?view= opens still with its caption; every caption resolves from the data;
  // ?tour= steps with Back, Next and Skip; a reader's own hash wins over the view's state on reload.
  ...['effective-vote-by-state-2024', 'smallest-change-2024', 'districts-2026', 'texas-districts-2026'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), hidden: document.getElementById('viewCard').hidden })) })),
  { name: 'v-captions', query: 'tour=guide-1-4', probe: (page) => page.evaluate(async () => {
    const reg = await (await fetch('views.json')).json(), S = window.__vt.saved();
    const texts = reg.views.map((v) => S.text(v.slug)), all = JSON.stringify(texts);
    const steps = reg.tours.every((t) => t.steps.every((st) => reg.views.some((v) => v.slug === st.view)));
    return { n: texts.length, unresolved: (all.match(/\[\?\]|\{[a-z]/g) || []).length, steps, ok: !/\[\?\]/.test(all) && steps, captions: texts.map((t) => t.caption) }; }) },
  { name: 'v-tour-next', query: 'tour=safe-seats', act: seq(click('.vc-next'), click('.vc-next')),
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), view: window.__vt.effW(), e: window.__vt.state.e, sel: window.__vt.state.sel })) },
  { name: 'v-tour-skip', query: 'tour=safe-seats', act: click('.vc-skip'), probe: (page) => page.evaluate(() => ({ hidden: document.getElementById('viewCard').hidden })) },
  { name: 'v-view-own-hash', query: 'view=districts-2026', hash: 'e=house2024&w=seats', probe: (page) => page.evaluate(() => ({ e: window.__vt.state.e, w: window.__vt.effW(), card: !document.getElementById('viewCard').hidden })) },
  { name: 'v-house-lenses', hash: 'e=house2024&w=seats', probe: (page) => page.evaluate(() => ({ lenses: getComputedStyle(document.querySelector('.lenses')).display, note: getComputedStyle(document.querySelector('.house-only')).display,
    about: document.getElementById('aboutHouse').innerText.slice(0, 120) })) },
  // One card export (tools/vote-terrain/export.mjs) into a scratch folder: master, link and square at their sizes.
  { name: 'x-export', hash: 'e=house2026&w=strips', probe: () => {
    const dir = path.join(OUT, 'export-check'); fs.rmSync(dir, { recursive: true, force: true });
    execFileSync(process.execPath, [path.join(HERE, 'export.mjs'), '--view', 'districts-2026', '--out', dir, '--root', ROOT], { stdio: 'ignore' });
    const dims = (f) => { const b = fs.readFileSync(path.join(dir, f)); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
    const sizes = { master: dims('districts-2026.png'), link: dims('districts-2026.link.png'), square: dims('districts-2026.square.png') };
    return { sizes, ok: sizes.master.join() === '2400,1500' && sizes.link.join() === '2400,1260' && sizes.square.join() === '2400,2400' }; } },
  // History (the long view): on any track; its numbers against history.json and the balance box; a bar opens its
  // election with the smallest-change states selected; the table; the two saved views.
  { name: 'y-history', hash: 'w=history' },
  { name: 'y-history-house', hash: 'e=house2026&w=history' },
  { name: 'y-history-sel', hash: 'w=history&sel=s:WY,CA' },
  { name: 'y-history-hover', hash: 'w=history', act: async (page) => { const b = await page.locator('#v2d svg.hist-chart > g:last-of-type circle').last().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'y-history-table', hash: 'w=history', act: key('t') },
  { name: 'y-history-data', hash: 'w=history', probe: (page) => page.evaluate(async () => {
    const H = await (await fetch('history.json')).json(), bal = await (await fetch('balance.json')).json();
    const seatsOk = H.perSeat.every((e) => Object.values(e.states).reduce((a, s) => a + s.seats, 0) === e.seats);
    const balOk = H.smallest.filter((s) => s.election).every((s) => bal.elections[s.election].smallest.president.votes === s.votes);
    const dots = document.querySelectorAll('#v2d svg.hist-chart circle').length, rects = document.querySelectorAll('#v2d svg.hist-chart rect').length;
    return { censuses: H.perSeat.length, elections: H.smallest.length, dots, rects, seatsOk, balOk, ok: seatsOk && balOk && rects === 0 && dots > H.perSeat.length && H.perSeat[H.perSeat.length - 1].perSeat === 761169 }; }) },
  // The smallest change: dots on the log scale, never bars (a bar's length is not proportional to its value there).
  { name: 'y-history-small', hash: 'w=history&hc=small', probe: (page) => page.evaluate(async () => {
    const H = await (await fetch('history.json')).json();
    const dots = document.querySelectorAll('#v2d svg.hist-chart g g circle').length, rects = document.querySelectorAll('#v2d svg.hist-chart rect').length;
    return { dots, rects, ok: dots === H.smallest.length && rects === 0 }; }) },
  { name: 'y-history-open', hash: 'w=history&hc=small', act: async (page) => { await page.locator('#v2d svg.hist-chart g g').nth(10).locator('circle').click(); },
    probe: (page) => page.evaluate(() => ({ e: window.__vt.state.e, w: window.__vt.effW(), sel: window.__vt.state.sel })) },
  // Weight per vote over time: two ratios per presidential year, checked against history.json.
  { name: 'y-history-weight', hash: 'w=history&hc=weight', probe: (page) => page.evaluate(async () => {
    const H = await (await fetch('history.json')).json(), W = H.weight, first = W[0], last = W[W.length - 1];
    const pts = document.querySelectorAll('#v2d svg.hist-chart g g circle').length;
    return { pts, y1976: [first.senate.ratio, first.ev.ratio], y2024: [last.senate.ratio, last.ev.ratio],
      ok: pts === 2 * W.length && W.every((w) => w.senate.ratio > 1 && w.ev.ratio > 1) && first.year === 1976 && last.year === 2024 }; }) },
  { name: 'y-history-weight-open', hash: 'w=history&hc=weight', act: async (page) => { await page.locator('#v2d svg.hist-chart > g').last().locator('g').last().locator('circle').click(); },
    probe: (page) => page.evaluate(() => ({ e: window.__vt.state.e, w: window.__vt.effW(), sel: window.__vt.state.sel })) },
  { name: 'y-history-weight-table', hash: 'w=history&hc=weight', act: key('t') },
  ...['residents-per-seat', 'smallest-change-history', 'weight-over-time'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), w: window.__vt.effW(), hc: window.__vt.state.hc,
      charts: document.querySelectorAll('#v2d svg.hist-chart').length })) })),
  // The swing simulator: one swing for every race on the election day; the slider, locks and rule in the link; the
  // thresholds against a direct count; the 2024 Electoral College against the smallest change.
  { name: 'm-sim-2024', hash: 'e=pres2024&w=sim' },
  { name: 'm-sim-2024-swing', hash: 'e=pres2024&w=sim&sw=1.8&lock=NV&sel=s:PA' },
  { name: 'm-sim-house2026', hash: 'e=house2026&w=sim&sw=-6' },
  { name: 'm-sim-sen2018-prop', hash: 'e=sen2018&w=sim&swr=p&sw=6' },
  { name: 'm-sim-table', hash: 'e=pres2024&w=sim&sw=1.8', act: key('t') },
  { name: 'm-sim-phone', hash: 'e=pres2024&w=sim&sw=1.8', viewport: { width: 390, height: 844 } },
  { name: 'm-sim-hover', hash: 'e=pres2024&w=sim', act: async (page) => { const b = await page.locator('#v2d .sim-tile[data-st=PA] rect').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'm-sim-slider', hash: 'e=pres2024&w=sim', probe: async (page) => {
    const now = () => page.evaluate(() => { const S = window.__vt.sim(), t = S.sim.tally(S.P, S.s, S.rule, S.locked); return { s: S.s, ev: [t.pres.D, t.pres.R], ctl: t.pres.control, hash: location.hash.match(/(?:^|&)(sw|lock)=[^&]*/g) }; });
    await page.$eval('.sim-range', (r) => { r.value = '1.8'; r.dispatchEvent(new Event('input', { bubbles: true })); }); await settle(page);
    const at = await now();
    await page.locator('.sim-lock[data-lock=PA]').first().click(); await settle(page);
    const locked = await now();
    await page.reload(); await page.waitForFunction(() => window.__vt && window.__vt.sim()); await settle(page);
    const reloaded = await now();
    await page.click('.sim-reset'); await settle(page);
    const reset = await now();
    return { at, locked, reloaded, reset, ok: at.ctl === 'D' && at.ev[0] === 270 && locked.ctl === 'R' && JSON.stringify(reloaded) === JSON.stringify(locked) && reset.s === 0 && reset.ctl === 'R' }; } },
  { name: 'm-sim-thresholds', hash: 'e=pres2024&w=sim', probe: (page) => page.evaluate(async () => {
    const bal = await (await fetch('balance.json')).json(), S = window.__vt.sim(), { sim, P } = S;
    // Direct count: Republican-held states in order of margin, electoral votes added until Democrats reach 270.
    const tot = S.sim.tally(P, 0, 'u'), order = P.pres.filter((p) => p.actual === 'R').map((p) => ({ st: p.st, ev: p.ev, m: -sim.marginOf(p) })).sort((a, b) => a.m - b.m);
    let ev = tot.pres.D, raw = null; const states = [];
    for (const x of order) { ev += x.ev; states.push(x.st); if (ev >= 270) { raw = x.m; break; } }
    const th = sim.thresholds(P, 'u'), tick = th.find((k) => k.body === 'pres');
    const small = bal.elections.pres2024.smallest.president.states.slice().sort().join();
    // Every tick: control at the tick is the new one, just inside it the old one.
    const ticksOk = th.every((k) => { const sg = Math.sign(k.at); return sim.tally(P, k.at, 'u')[k.body].control === k.control && sim.tally(P, k.raw - sg * 1e-6, 'u')[k.body].control === k.from; });
    return { raw, tick, states: states.slice().sort().join(), small, ticksOk, ok: Math.abs(tick.raw - raw) < 1e-9 && states.slice().sort().join() === small && ticksOk }; }) },
  { name: 'm-sim-data', hash: 'e=sen2026&w=sim', probe: (page) => page.evaluate(async () => {
    const d = await (await fetch('simulator.json')).json(), bal = await (await fetch('balance.json')).json();
    const sen = { 2016: 'pres2016', 2018: 'd2018', 2020: 'pres2020', 2022: 'd2022', 2024: 'pres2024' };
    const senOk = Object.entries(sen).every(([y, k]) => d.days[y].senate.actual.D === bal.elections[k].senate.caucusD && d.days[y].senate.actual.R === bal.elections[k].senate.R);
    const presOk = ['2016', '2020', '2024'].every((y) => { const a = d.days[y].pres.actual; return a.D + a.R === 538; });
    const seats = Object.values(d.days).every((x) => x.senate.holdover.D + x.senate.holdover.R + x.senate.races.length === 100);
    return { senOk, presOk, seats, ok: senOk && presOk && seats }; }) },
  ...['simulator-2024-president', 'simulator-2026-house'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), w: window.__vt.effW(), s: window.__vt.sim() && window.__vt.sim().s })) })),
  // Power: weight per vote ranked with its three parts; the cartogram (votes, electoral votes, Senate seats); each
  // party's concentration with its marker and the selection rule k:. Numbers against effective.json and the county data.
  { name: 'p-power-rank', hash: 'w=power' },
  { name: 'p-power-rank-sel', hash: 'w=power&sel=s:WY,MI' },
  { name: 'p-power-rank-sen2026', hash: 'e=sen2026&w=power' },
  { name: 'p-power-rank-hover', hash: 'w=power', act: async (page) => { const b = await page.locator('#v2d .pw-row[data-st=WY] rect').first().boundingBox(); await page.mouse.move(b.x + 200, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'p-power-tiles', hash: 'w=power&pc=tiles' },
  { name: 'p-power-tiles-ev', hash: 'w=power&pc=tiles&pm=ev' },
  { name: 'p-power-tiles-sen', hash: 'w=power&pc=tiles&pm=sen&sel=s:CA,WY' },
  { name: 'p-power-tiles-click', hash: 'w=power&pc=tiles', act: click('.pw-stops [data-pm=sen]'),
    probe: (page) => page.evaluate(() => ({ pm: window.__vt.state.pm, hash: /(^|&)pm=sen/.test(location.hash), sides: [...document.querySelectorAll('#v2d .pw-tile[data-st=WY] rect, #v2d .pw-tile[data-st=CA] rect')].map((r) => +(+r.getAttribute('width')).toFixed(1)) })) },
  { name: 'p-power-tiles-hover', hash: 'w=power&pc=tiles&pm=ev', act: async (page) => { const b = await page.locator('#v2d .pw-tile[data-st=WY] rect').last().boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'p-power-conc', hash: 'w=power&pc=conc' },
  { name: 'p-power-conc-r', hash: 'w=power&pc=conc&pk=r&pa=counties&pq=75' },
  { name: 'p-power-conc-drag', hash: 'w=power&pc=conc', act: async (page) => {
    const b = await page.locator('#v2d .pw-handle path').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y - 120, { steps: 8 }); await page.mouse.up(); },
    probe: (page) => page.evaluate(() => { const v = window.__vt, r = v.power.reach(v.state.e, v.state.pk, +v.state.pq);
      return { pq: v.state.pq, sel: v.state.sel, n: v.sel() && v.sel().counties.size, ok: +v.state.pq > 50 && v.state.sel === `k:d:${v.state.pq}` && v.sel().counties.size === r.n }; }) },
  { name: 'p-power-rule', hash: 'w=power&pc=conc&pk=r&sel=k:r:50', probe: (page) => page.evaluate(() => { const v = window.__vt, r = v.power.reach('pres2024', 'r', 50);
    return { n: v.sel().counties.size, ok: v.sel().counties.size === r.n && r.list.every((f) => v.sel().counties.has(f)) }; }) },
  { name: 'p-power-data', hash: 'w=power', probe: (page) => page.evaluate(async () => {
    const v = window.__vt, P = v.power, eff = await (await fetch('effective.json')).json(), el = v.elections;
    const R = P.rank('pres2024'), sorted = R.every((x, i) => !i || R[i - 1].r >= x.r), parts = R.every((x) => Math.abs(x.B * x.N * x.T - x.r) / x.r < 1e-3);
    const sameAsEff = R.every((x) => eff.elections.pres2024.states[x.st][0] === x.r);
    const T = P.states('pres2024'), sum = (k) => T.rows.reduce((a, x) => a + x.share[k], 0);
    const ev = T.rows.reduce((a, x) => a + x.ev, 0), sen = T.rows.reduce((a, x) => a + x.sen, 0);
    // Concentration against a direct count: counties by Democratic votes, most first, until half the party's votes.
    const d = el.pres2024.data, fs = Object.keys(d).filter((f) => d[f][0] > 0 && v.meta[f]).sort((a, b) => d[b][2] - d[a][2]);
    const tot = fs.reduce((a, f) => a + d[f][2], 0); let c = 0, n = 0; for (const f of fs) { c += d[f][2]; n++; if (c >= tot / 2) break; }
    const C = P.curve('pres2024', 'd'), half = P.reach('pres2024', 'd', 50);
    return { states: R.length, top: [R[0].st, R[0].r], bottom: [R[R.length - 1].st, R[R.length - 1].r], ev, sen, half: half.n, direct: n,
      ok: sorted && parts && sameAsEff && Math.abs(sum('votes') - 1) < 1e-9 && Math.abs(sum('ev') - 1) < 1e-9 && Math.abs(sum('sen') - 1) < 1e-9 && ev === 538 && sen === 100 && R.some((x) => x.st === 'AK') && T.rows.some((x) => x.st === 'AK' && x.votes === eff.elections.pres2024.stateOnly.AK.votes) &&
        Math.abs(C[C.length - 1].cv - 1) < 1e-9 && Math.abs(C[C.length - 1].ca - 1) < 1e-9 && half.n === n }; }) },
  // Overlays: marks on every county view, the comparison card, its selection rule and a direct recount of the comparison.
  { name: 'o-monitors-circles', hash: 'e=sen2026&w=circles&c=swing&ov=monitors' },
  { name: 'o-detention-terrain', hash: 'e=sen2026&c=swing&v=national&ov=detention', probe: (page) => page.evaluate(() => ({ marks: document.querySelectorAll('.ov-mark').length, key: document.getElementById('keyOvText').textContent })) },
  { name: 'o-monitors-dots', hash: 'e=sen2026&w=dots&ov=monitors', probe: (page) => page.evaluate(() => ({ rings: document.querySelectorAll('#v2d circle.ov').length })) },
  { name: 'o-detention-arrows', hash: 'e=sen2026&w=arrows&ov=detention', probe: (page) => page.evaluate(() => ({ marks: document.querySelectorAll('#v2d .ov-marks path').length })) },
  { name: 'o-monitors-pres2024', hash: 'e=pres2024&w=circles&c=swing&ov=monitors', probe: (page) => page.evaluate(() => ({ card: document.getElementById('ovText').textContent })) },
  { name: 'o-no-baseline', hash: 'e=sen2018&w=circles&ov=detention', probe: (page) => page.evaluate(() => ({ card: document.getElementById('ovText').textContent })) },
  { name: 'o-house-hidden', hash: 'e=house2026&w=strips&ov=monitors', probe: (page) => page.evaluate(() => ({ card: document.getElementById('ovCard').hidden, key: document.getElementById('keyOv').hidden })) },
  { name: 'o-menu', hash: 'e=sen2026&w=circles&c=swing', act: seq(click('#adjust summary'), click('[data-ov=detention]')), probe: (page) => page.evaluate(() => ({ ov: window.__vt.state.ov, l: window.__vt.state.l, card: !document.getElementById('ovCard').hidden })) },
  { name: 'o-select', hash: 'e=sen2026&w=circles&c=swing&ov=monitors', act: click('#ovSelect'),
    probe: (page) => page.evaluate(() => { const v = window.__vt, O = v.overlays.sets.monitors; return { sel: v.state.sel, n: v.sel() && v.sel().counties.size, ok: !!v.sel() && v.sel().counties.size === O.size && [...O].every((f) => v.sel().counties.has(f)) }; }) },
  { name: 'o-table', hash: 'e=sen2026&w=circles&c=swing&ov=detention', act: key('t') },
  { name: 'o-hover', hash: 'e=sen2026&w=circles&c=swing&ov=detention', act: async (page) => { await page.evaluate(() => window.__vt.setSelection({ counties: ['48479'] }, { frame: true })); await page.waitForTimeout(900); const b = await page.locator('#v2d svg.v2d-circles').boundingBox(); await page.mouse.move(b.x + b.width / 2 - 30, b.y + b.height / 2 - 30); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'o-data', hash: 'e=sen2026&w=circles&ov=monitors', probe: (page) => page.evaluate(async () => {
    // The comparison recounted from the files, by a second route: cells of state, lean and size; weighted median.
    const v = window.__vt, ov = await (await fetch('overlays.json')).json(), el = await (await fetch('elections.json')).json(), out = {};
    for (const k of ['monitors', 'detention']) {
      const L = ov.layers[k], e = L.election, b = el.sameOffice[e], d = el.elections[e].data, bd = el.elections[b].data, S = new Set(Object.keys(L.counties));
      const m = (x) => (x[2] - x[1]) / x[0] * 100, band = (x) => { const r = -m(x); return [r < 0 ? 0 : r < 20 ? 1 : r < 40 ? 2 : 3, x[0] < 1e4 ? 0 : x[0] < 5e4 ? 1 : x[0] < 2e5 ? 2 : 3].join(); };
      const cells = new Map();
      for (const f of Object.keys(d)) { if (!v.meta[f] || !bd[f] || !d[f][0] || !bd[f][0]) continue; const c = v.meta[f].st + band(bd[f]); if (!cells.has(c)) cells.set(c, { a: [], o: [] }); cells.get(c)[S.has(f) ? 'a' : 'o'].push(m(d[f]) - m(bd[f])); }
      const ins = [], outs = []; let un = 0;
      for (const { a, o } of cells.values()) { if (!a.length) continue; if (!o.length) { un += a.length; continue; } ins.push(...a); for (const x of o) outs.push([x, a.length / o.length]); }
      ins.sort((x, y) => x - y); outs.sort((x, y) => x[0] - y[0]);
      const med = ins.length % 2 ? ins[(ins.length - 1) / 2] : (ins[ins.length / 2 - 1] + ins[ins.length / 2]) / 2;
      const T = outs.reduce((a, x) => a + x[1], 0); let c = 0, wm = null;
      for (let i = 0; i < outs.length; i++) { c += outs[i][1]; if (c >= T / 2 - 1e-9) { wm = c > T / 2 + 1e-9 || i === outs.length - 1 ? outs[i][0] : (outs[i][0] + outs[i + 1][0]) / 2; break; } }
      const P = v.overlays.compare(k, e);
      out[k] = { counties: S.size, inN: ins.length, unmatched: un, inMed: +med.toFixed(3), outMed: +wm.toFixed(3), page: [P.inN, P.unmatched, +P.inMed.toFixed(3), +P.outMed.toFixed(3)],
        ok: P.inN === ins.length && P.unmatched === un && Math.abs(P.inMed - med) < 1e-9 && Math.abs(P.outMed - wm) < 1e-9 };
    }
    return { ...out, ok: out.monitors.ok && out.detention.ok }; }) },
  ...['overlay-monitors-2026', 'overlay-detention-2026'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), ov: window.__vt.state.ov, w: window.__vt.effW() })) })),
  { name: 'p-power-table-rank', hash: 'w=power', act: key('t') },
  { name: 'p-power-table-tiles', hash: 'w=power&pc=tiles', act: key('t') },
  { name: 'p-power-table-conc', hash: 'w=power&pc=conc', act: key('t') },
  { name: 'p-power-phone', hash: 'w=power&pc=tiles', viewport: { width: 390, height: 844 } },
  { name: 'p-power-house', hash: 'e=house2026&w=power' },
  ...['power-weight-2024', 'power-cartogram-2024', 'power-concentration-2024'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), w: window.__vt.effW(), pc: window.__vt.state.pc,
      charts: document.querySelectorAll('#v2d svg.pw-chart').length })) })),
  { name: 'n-nogl-power', hash: 'w=power&pc=conc', gl: false },
  { name: 'n-nogl-sim', hash: 'e=pres2024&w=sim&sw=1.8', gl: false },
  { name: 'n-nogl-house', hash: 'e=house2026&w=seats', gl: false },
  { name: 'n-nogl', hash: 'w=terrain', gl: false },
  { name: 'n-nogl-blocks', hash: 's=blocks', gl: false },
  { name: 'n-nogl-dots', hash: 'w=dots', gl: false },
  // Road to 270 (and 51), Closest races, flips and bellwethers, and Scatter's margin-against-swing chart.
  { name: 'r-road-2024', hash: 'e=pres2024&w=road' },
  { name: 'r-road-2016', hash: 'e=pres2016&w=road' },
  { name: 'r-road-sen2024', hash: 'e=sen2024&w=road' },
  { name: 'r-road-sen2026', hash: 'e=sen2026&w=road&rb=sen' },
  { name: 'r-road-house2026', hash: 'e=house2026&w=road' },
  { name: 'r-road-sel', hash: 'e=pres2024&w=road&sel=s:PA,WI' },
  { name: 'r-road-switch', hash: 'e=pres2024&w=road', act: click('[data-rb=sen]') },
  { name: 'r-road-hover', hash: 'e=pres2024&w=road', act: async (page) => { const b = await page.locator('#v2d .rd-seg[data-st=PA]').boundingBox(); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true },
  { name: 'r-road-click', hash: 'e=pres2024&w=road', act: async (page) => { const b = await page.locator('#v2d .rd-seg[data-st=GA]').boundingBox(); await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2); },
    probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, n: window.__vt.sel() && window.__vt.sel().counties.size })) },
  { name: 'r-road-table', hash: 'e=pres2024&w=road&sel=s:PA', act: key('t') },
  { name: 'r-road-table-sen', hash: 'e=sen2026&w=road&rb=sen', act: key('t') },
  { name: 'r-road-phone', hash: 'e=pres2024&w=road', viewport: { width: 390, height: 844 } },
  // The bar against balance.json: the same votes to flip for the smallest-change states of each presidential election and
  // the 2024 Senate races, the totals, and the line and the tipping state counted again from the segments.
  { name: 'r-road-data', hash: 'e=pres2024&w=road', probe: (page) => page.evaluate(async () => {
    const v = window.__vt, bal = await (await fetch('balance.json')).json(), out = {};
    for (const y of ['2016', '2020', '2024']) {
      const r = v.races.road(y, 'pres'), sm = bal.elections['pres' + y].smallest.president, st = r.segs.filter((s) => s.kind === 'state');
      const win = r.D > r.R ? 'D' : 'R', order = win === 'D' ? r.segs : r.segs.slice().reverse();
      let c = 0, tip = null; for (const s of order) { if (s.win === win) c += s.size; if (c >= 270) { tip = s; break; } }
      out[y] = { total: r.total, evD: r.D, evR: r.R, states: st.length, flips: Object.entries(sm.per_state).every(([k, n]) => st.find((s) => s.st === k).flip === n),
        tip: r.tip && r.tip.st, tipAgain: tip.st, tipInSmallest: sm.states.includes(r.tip.st), ordered: st.every((s, i) => !i || st[i - 1].points >= s.points), line: r.lineAt, winner: bal.elections['pres' + y].president.party === win };
    }
    const s = v.races.road('2024', 'sen'), sm = bal.elections.pres2024.smallest.senate;
    out.sen = { total: s.total, seats: s.counts.D + s.counts.R, flips: sm.races.every((x) => s.segs.find((q) => q.st === x.state && q.kind === 'race').flip === x.cost), tip: s.tip && s.tip.st, control: s.control, caucus: [bal.elections.pres2024.senate.R, bal.elections.pres2024.senate.caucusD] };
    return out; }) },
  { name: 'k-closest-2024', hash: 'e=pres2024&w=closest' },
  { name: 'k-closest-sen2026', hash: 'e=sen2026&w=closest&ro=sen' },
  { name: 'k-closest-house', hash: 'e=house2026&w=closest&ro=house' },
  { name: 'k-closest-gov2022', hash: 'e=gov2022&w=closest&ro=gov' },
  { name: 'k-closest-pres', hash: 'e=pres2020&w=closest&ro=pres' },
  { name: 'k-closest-filter', hash: 'e=pres2024&w=closest', act: click('[data-ro=sen]') },
  { name: 'k-closest-sort', hash: 'e=pres2024&w=closest', act: seq(click('.cl th[data-k="3"]'), click('.cl th[data-k="3"]')) },
  { name: 'k-closest-sel', hash: 'e=pres2024&w=closest&sel=s:PA,CA' },
  { name: 'k-closest-click', hash: 'e=pres2024&w=closest&ro=pres', act: click('.cl tbody tr:nth-child(3)'),
    probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, n: window.__vt.sel() && window.__vt.sel().counties.size, on: document.querySelectorAll('.cl tr.on').length })) },
  { name: 'k-closest-table', hash: 'e=pres2024&w=closest&ro=house', act: key('t') },
  { name: 'k-closest-phone', hash: 'e=pres2024&w=closest', viewport: { width: 390, height: 844 } },
  // Against balance.json's House and Senate smallest changes and the House file: the same margins and votes to flip.
  { name: 'k-closest-data', hash: 'e=pres2024&w=closest', probe: (page) => page.evaluate(async () => {
    const v = window.__vt, bal = await (await fetch('balance.json')).json(), C = v.closest(), rows = C.rows, sm = bal.elections.pres2024.smallest, out = {};
    const row = (o, p) => rows.find((r) => r.office === o && r.place === p);
    out.n = rows.length; out.offices = Object.fromEntries(['pres', 'sen', 'house', 'gov'].map((o) => [o, rows.filter((r) => r.office === o).length]));
    out.house = sm.house.districts.map((d) => { const r = row('house', d.district.replace('AK-1', 'AK-AL')); return r && r.votes === d.margin && r.flip === d.cost; });
    out.sen = sm.senate.races.map((x) => { const r = rows.find((q) => q.office === 'sen' && q.st === x.state); return r && r.votes === x.margin && r.flip === x.cost; });
    out.pres = Object.entries(sm.president.per_state).map(([st, n]) => rows.find((q) => q.office === 'pres' && q.st === st).flip === n);
    const ch = rows.filter((r) => r.ctl.changed), pa = row('pres', 'Pennsylvania');
    out.changed = { n: ch.length, pres: ch.filter((r) => r.office === 'pres').map((r) => r.st).join(','), pa: pa.ctl };
    out.ranked = rows.filter((r) => r.flip != null).length; out.noFlip = rows.filter((r) => r.flip == null).map((r) => r.place).join(',');
    return out; }) },
  { name: 'k-closest-data-gov', hash: 'e=gov2022&w=closest&ro=gov', probe: (page) => page.evaluate(() => { const rows = window.__vt.closest().rows;
    return { n: rows.length, first: rows.slice().sort((a, b) => a.flip - b.flip).slice(0, 3).map((r) => [r.st, r.votes, r.win, r.ctl.changed]) }; }) },
  { name: 'f-flips-panel', hash: 'e=pres2024&w=circles', act: click('#flipsBox summary'),
    probe: (page) => page.evaluate(() => ({ flip: document.getElementById('flipText').textContent, bell: document.getElementById('bellText').textContent, opts: document.getElementById('flipA').options.length })) },
  { name: 'f-flips-select', hash: 'e=pres2024&w=circles', act: seq(click('#flipsBox summary'), click('#flipGo')),
    probe: (page) => page.evaluate(() => { const v = window.__vt, F = v.flips.flipped('pres2020', 'pres2024'); return { sel: v.state.sel, n: v.sel().counties.size, ok: v.sel().counties.size === F.n && F.list.every((x) => v.sel().counties.has(x.f)), text: document.getElementById('selText').textContent }; }) },
  { name: 'f-flips-rule', hash: 'e=pres2024&w=circles&sel=f:pres2016:pres2020&c=swing' },
  { name: 'f-flips-pick', hash: 'e=pres2024&w=circles', act: async (page) => { await page.click('#flipsBox summary'); await page.selectOption('#flipA', 'pres2016'); await page.selectOption('#flipB', 'pres2020'); await page.click('#flipGo'); },
    probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, n: window.__vt.sel().counties.size, text: document.getElementById('flipText').textContent })) },
  { name: 'f-flips-scope', hash: 'e=pres2024&w=circles&sel=s:TX,FL', act: seq(click('#flipsBox summary'), click('#flipGo')),
    probe: async (page) => { const a = await page.evaluate(() => ({ sel: window.__vt.state.sel, n: window.__vt.sel().counties.size, st: [...new Set([...window.__vt.sel().counties].map((f) => window.__vt.meta[f].st))].join(',') }));
      await page.reload(); await page.waitForFunction(() => window.__vt && window.__vt.sel()); await settle(page);
      return { ...a, reloaded: await page.evaluate(() => window.__vt.sel().counties.size) }; } },
  { name: 'f-bell', hash: 'e=pres2024&w=circles', act: seq(click('#flipsBox summary'), click('#bellGo')),
    probe: (page) => page.evaluate(() => { const v = window.__vt, B = v.flips.bell(); return { sel: v.state.sel, n: v.sel().counties.size, ok: v.sel().counties.size === B.n, ids: B.ids.join(','), win: B.win.join('') }; }) },
  { name: 'f-bell-rule', hash: 'e=pres2024&w=terrain&sel=w' },
  { name: 'f-flips-house', hash: 'e=house2026&w=strips', probe: (page) => page.evaluate(() => ({ box: getComputedStyle(document.getElementById('flipsBox')).display })) },
  // Recounted from elections.json with its own loops: which counties changed party, and the bellwethers.
  { name: 'f-flips-data', hash: 'e=pres2024&w=circles', probe: (page) => page.evaluate(async () => {
    const v = window.__vt, el = (await (await fetch('elections.json')).json()).elections, bal = await (await fetch('balance.json')).json(), fs = Object.keys(v.meta), out = {};
    const win = (x) => (x[2] > x[1] ? 'D' : x[2] < x[1] ? 'R' : '');
    for (const [a, b] of [['pres2016', 'pres2020'], ['pres2020', 'pres2024'], ['pres2016', 'pres2024'], ['sen2018', 'sen2024'], ['gov2018', 'gov2022']]) {
      let both = 0, dr = 0, rd = 0;
      for (const f of fs) { const x = el[a].data[f], y = el[b].data[f]; if (!x || !y) continue; const p = win(x), q = win(y); if (!p || !q) continue; both++; if (p !== q) (p === 'D' ? dr++ : rd++); }
      const F = v.flips.flipped(a, b); out[a + '-' + b] = { both, dr, rd, same: F.both === both && F.dToR === dr && F.rToD === rd && F.n === dr + rd };
    }
    const ids = ['pres2016', 'pres2020', 'pres2024'], nat = ids.map((e) => bal.elections[e].president.party); let n = 0, of = 0;
    for (const f of fs) { const s = ids.map((e) => (el[e].data[f] ? win(el[e].data[f]) : '')); if (s.some((x) => !x)) continue; of++; if (s.every((x, i) => x === nat[i])) n++; }
    out.bell = { n, of, nat: nat.join(''), same: v.flips.bell().n === n && v.flips.bell().of === of };
    return out; }) },
  { name: 's-ms', hash: 'w=scatter&sx=ms' },
  { name: 's-ms-toggle', hash: 'w=scatter', act: click('[data-sx=ms]') },
  { name: 's-ms-back', hash: 'w=scatter&sx=ms', act: click('[data-sx=""]') },
  { name: 's-ms-sen2026', hash: 'e=sen2026&w=scatter&sx=ms' },
  { name: 's-ms-gov2026', hash: 'e=gov2026&w=scatter&sx=ms&c=swing' },
  { name: 's-ms-quad', hash: 'w=scatter&sx=ms&sel=n:se' },
  { name: 's-ms-box', hash: 'w=scatter&sx=ms&sel=g:-30.0,10.0,-8.0,-2.0' },
  { name: 's-ms-sel', hash: 'w=scatter&sx=ms&sel=s:TX' },
  { name: 's-ms-hover', hash: 'w=scatter&sx=ms', act: async (page) => { const b = await page.evaluate(() => { const c = d3.selectAll('#v2d circle').filter((d) => d.f === '06037').node().getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
    await page.mouse.move(b.x - 30, b.y - 30); await page.mouse.move(b.x, b.y); await page.waitForTimeout(250); }, tip: true },
  { name: 's-ms-click', hash: 'w=scatter&sx=ms', act: async (page) => { const b = await page.evaluate(() => { const c = d3.selectAll('#v2d circle').filter((d) => d.f === '06037').node().getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
    await page.mouse.click(b.x, b.y); }, probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, n: window.__vt.sel() && window.__vt.sel().counties.size })) },
  { name: 's-ms-drag', hash: 'w=scatter&sx=ms', act: async (page) => { await page.mouse.move(700, 420); await page.mouse.down(); await page.mouse.move(900, 540, { steps: 8 }); await page.mouse.up(); },
    probe: (page) => page.evaluate(() => { const v = window.__vt, R = v.views(); return { sel: v.state.sel, n: v.sel() && v.sel().counties.size, rule: /^g:/.test(v.state.sel) }; }) },
  { name: 's-ms-table', hash: 'w=scatter&sx=ms&sel=s:RI', act: key('t') },
  { name: 's-ms-phone', hash: 'w=scatter&sx=ms', viewport: { width: 390, height: 844 } },
  // The chart against elections.json: each county's earlier margin and swing, the quadrants, the medians and the running line.
  { name: 's-ms-data', hash: 'w=scatter&sx=ms', probe: (page) => page.evaluate(async () => {
    const v = window.__vt, el = (await (await fetch('elections.json')).json()), E = el.elections, fs = Object.keys(v.meta), out = {};
    const mg = (x) => (x[2] - x[1]) / x[0] * 100, med = (a) => { a = a.slice().sort((p, q) => p - q); const n = a.length; return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2; };
    const P = []; for (const f of fs) { const x = E.pres2024.data[f], b = E.pres2020.data[f]; if (!x || !b || !b[0] || !x[0]) continue; P.push({ f, x: mg(b), y: mg(x) - mg(b) }); }
    const rows = fs.map((f) => { const a = E.pres2024.data[f] || null, b = E.pres2020.data[f] || null; return { f, v: a, b, s: a && b && a[0] && b[0] ? mg(a) - mg(b) : null }; });
    const R = v.ms.msRows(rows, mg), S = v.ms.summarize(R), run = v.ms.running(R);
    const rep = P.filter((p) => p.x <= 0), dem = P.filter((p) => p.x > 0);
    out.counts = { n: P.length, same: S.n === P.length, nR: S.nR === rep.length, nD: S.nD === dem.length, medR: Math.abs(S.medR - med(rep.map((p) => p.y))) < 1e-9, medD: Math.abs(S.medD - med(dem.map((p) => p.y))) < 1e-9,
      toR: S.toR === P.filter((p) => p.y <= 0).length, quads: ['ne', 'se', 'nw', 'sw'].map((k) => P.filter((p) => v.ms.QUADS[k](p.x, p.y)).length).reduce((a, b) => a + b, 0) === P.length };
    out.run = { n: run.line.length === P.length, window: run.window, sorted: run.line.every((p, i) => !i || run.line[i - 1].x <= p.x), inRange: run.line.every((p) => p.y >= Math.min(...P.map((q) => q.y)) && p.y <= Math.max(...P.map((q) => q.y))) };
    out.svg = { circles: document.querySelectorAll('#v2d svg.v2d-scatter circle').length === P.length };
    return out; }) },
  ...['road-to-270-2024', 'closest-races-2024', 'flips-2020-2024', 'margin-against-swing-2024'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), w: window.__vt.effW(), sel: window.__vt.state.sel, n: window.__vt.sel() && window.__vt.sel().counties.size })) })),
  // Turnout drop-off, Ticket splitting, the County history card and Regional close-ups (turnout.js, places.js, drawers.js, regions.json).
  { name: 'u-dropoff-2026', hash: 'e=sen2026&w=dropoff' },
  { name: 'u-dropoff-2022', hash: 'e=sen2022&w=dropoff' },
  { name: 'u-dropoff-gov2026', hash: 'e=gov2026&w=dropoff' },
  { name: 'u-dropoff-sel', hash: 'e=sen2026&w=dropoff&sel=s:TX' },
  { name: 'u-dropoff-hover', hash: 'e=sen2026&w=dropoff', act: hoverAt('#v2d svg.v2d-scatter circle', '48201'), tip: true },
  { name: 'u-dropoff-table', hash: 'e=sen2026&w=dropoff&sel=s:ME', act: key('t') },
  { name: 'u-dropoff-unavailable', hash: 'e=pres2024&w=dropoff' },
  { name: 'u-dropoff-phone', hash: 'e=sen2026&w=dropoff', viewport: { width: 390, height: 844 } },
  { name: 'u-colour-terrain', hash: 'e=sen2026&c=drop&v=national&l=custom' },
  { name: 'u-colour-circles', hash: 'e=sen2026&w=circles&c=drop&l=custom' },
  { name: 'u-colour-circles-gov', hash: 'e=gov2026&w=circles&c=drop&l=custom' },
  { name: 'u-colour-circles-2022', hash: 'e=sen2022&w=circles&c=drop&l=custom' },
  { name: 'u-colour-button', hash: 'e=sen2026&w=dropoff', act: click('[data-do=circles]'),
    probe: (page) => page.evaluate(() => ({ w: window.__vt.effW(), c: window.__vt.state.c, key: document.getElementById('keyTitle').textContent, labels: document.getElementById('rampLabels').textContent })) },
  { name: 'u-colour-menu', hash: 'e=sen2026&w=circles', act: seq(click('#adjust summary'), click('[data-c=drop]')), probe: (page) => page.evaluate(() => ({ c: window.__vt.state.c, l: window.__vt.state.l, how: document.getElementById('dropHow').textContent })) },
  { name: 'u-colour-hover', hash: 'e=sen2026&w=circles&c=drop&l=custom', act: hover(640, 400), tip: true },
  { name: 'u-colour-blocks', hash: 'e=sen2026&s=blocks&c=drop&v=national&l=custom' },
  // The drop-off from the files by a second route: the race per state, the counties, the all-county share, the 2022 band's bins.
  { name: 'u-dropoff-data', hash: 'e=sen2026&w=dropoff', probe: (page) => page.evaluate(async () => {
    const E = (await (await fetch('elections.json')).json()).elections, v = window.__vt, out = {};
    for (const [y, base, sen, gov] of [[2026, 'pres2024', 'sen2026', 'gov2026'], [2022, 'pres2020', 'sen2022', 'gov2022']]) {
      const st = (e) => new Set(Object.keys(E[e].data).map((f) => v.meta[f].st)), S = st(sen), G = st(gov);
      let sv = 0, sb = 0, n = 0; const used = {}, shares = [];
      for (const f of Object.keys(v.meta)) {
        const s = v.meta[f].st, e = S.has(s) ? sen : G.has(s) ? gov : null; if (!e) continue;
        const a = E[e].data[f], b = E[base].data[f]; if (!a || !b || !(a[0] > 0) || !(b[0] > 0)) continue;
        sv += a[0]; sb += b[0]; n++; used[s] = e; shares.push(a[0] / b[0]);
      }
      const D = v.turnout.drop(y), none = Object.keys(E.sen2026.data).length && [...new Set(Object.values(v.meta).map((m) => m.st))].filter((s) => !S.has(s) && !G.has(s)).sort();
      out['y' + y] = { n, nTurn: D.rows.length, all: +(sv / sb).toFixed(5), allTurn: +D.all.toFixed(5), sen: Object.values(used).filter((e) => e === sen).length, gov: Object.values(used).filter((e) => e === gov).length,
        nSen: D.nSen, nGov: D.nGov, noRace: none.join(), noRaceTurn: D.noRace.join(), maxShare: +Math.max(...shares).toFixed(3), minShare: +Math.min(...shares).toFixed(3),
        ok: n === D.rows.length && Math.abs(sv / sb - D.all) < 1e-12 && none.join() === D.noRace.join() && Object.values(used).filter((e) => e === sen).length === D.nSen };
    }
    const b = v.turnout.band(2022);
    out.band = { bins: b.length, ordered: b.every((x, i) => !i || b[i - 1].x < x.x), lohi: b.every((x) => x.lo <= x.med && x.med <= x.hi), min: Math.min(...b.map((x) => x.n)), points: document.querySelectorAll('#v2d svg.v2d-scatter circle').length };
    out.ok = out.y2026.ok && out.y2022.ok && out.band.ordered && out.band.lohi && out.band.points === out.y2026.nTurn;
    return out; }) },
  { name: 'k2-split', hash: 'e=sen2026&w=split' },
  { name: 'k2-split-state', hash: 'e=sen2026&w=split&sel=s:TX' },
  { name: 'k2-split-hover', hash: 'e=sen2026&w=split', act: async (page) => { const b = await page.evaluate(() => { const r = [...document.querySelectorAll('#v2d .sp-map path')].find((p, i) => i === Object.keys(window.__vt.views().shapes().countyPath).indexOf('48201')).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    await page.mouse.move(b.x - 30, b.y - 30); await page.mouse.move(b.x, b.y); await page.waitForTimeout(250); }, tip: true },
  { name: 'k2-split-click', hash: 'e=sen2026&w=split', act: async (page) => { await page.locator('#v2d .sp-rows g.row .hit').nth(2).click({ position: { x: 20, y: 8 } }); },
    probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, drawer: document.getElementById('drawer').innerText.replace(/\s+/g, ' ').slice(0, 260) })) },
  { name: 'k2-split-close', hash: 'e=sen2026&w=split&sel=s:GA', act: click('.dr-close'), probe: (page) => page.evaluate(() => ({ hidden: document.getElementById('drawer').hidden, sel: window.__vt.state.sel })) },
  { name: 'k2-split-table', hash: 'e=sen2026&w=split&sel=s:ME', act: key('t') },
  { name: 'k2-split-unavailable', hash: 'e=sen2024&w=split' },
  { name: 'k2-split-phone', hash: 'e=sen2026&w=split', viewport: { width: 390, height: 844 } },
  { name: 'k2-split-data', hash: 'e=sen2026&w=split', probe: (page) => page.evaluate(async () => {
    const E = (await (await fetch('elections.json')).json()).elections, v = window.__vt, T = v.turnout.split();
    const mg = (x) => (x[2] - x[1]) / x[0] * 100, both = Object.keys(v.meta).filter((f) => E.sen2026.data[f] && E.gov2026.data[f] && E.sen2026.data[f][0] > 0 && E.gov2026.data[f][0] > 0);
    const worst = Math.max(...both.map((f) => Math.abs((mg(E.sen2026.data[f]) - mg(E.gov2026.data[f])) - T.byF[f].d)));
    const sts = [...new Set(both.map((f) => v.meta[f].st))].sort();
    const st = (e) => new Set(Object.keys(E[e].data).map((f) => v.meta[f].st));
    const inter = [...st('sen2026')].filter((s) => st('gov2026').has(s)).sort();
    return { n: both.length, nSplit: T.rows.length, states: sts.join(), inter: inter.join(), worst, ticks: document.querySelectorAll('#v2d .sp-rows line.t').length,
      ok: both.length === T.rows.length && worst < 1e-9 && sts.join() === T.states.join() && sts.join() === inter.join() && document.querySelectorAll('#v2d .sp-rows line.t').length === T.rows.length }; }) },
  // The County history card: opened by a double-click, the tooltip's History, or hk= in the link; follows the timeline year.
  { name: 'h2-card', hash: 'e=gov2026&w=circles&hk=04013' },
  { name: 'h2-card-terrain', hash: 'e=pres2024&v=national&hk=48201' },
  { name: 'h2-card-phone', hash: 'e=gov2026&w=circles&hk=04013', viewport: { width: 390, height: 844 } },
  { name: 'h2-dblclick', hash: 'e=gov2026&w=circles', act: async (page) => { const b = await page.evaluate(() => { const c = d3.selectAll('#v2d circle').filter((f) => f === '04013').node().getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
    await page.mouse.move(b.x - 20, b.y - 20); await page.mouse.move(b.x, b.y); await page.waitForTimeout(150); await page.mouse.dblclick(b.x, b.y); }, probe: (page) => page.evaluate(() => ({ hk: window.__vt.state.hk, card: document.getElementById('histCard').hidden })) },
  { name: 'h2-tip-link', hash: 'e=gov2026&w=circles', act: async (page) => { const b = await page.evaluate(() => { const c = d3.selectAll('#v2d circle').filter((f) => f === '04013').node().getBoundingClientRect(); return { x: c.x + c.width / 2, y: c.y + c.height / 2 }; });
    await page.mouse.move(b.x - 20, b.y - 20); await page.mouse.move(b.x, b.y); await page.waitForTimeout(150);
    const l = await page.locator('.vt-tip .tip-hist').boundingBox(); await page.mouse.move(l.x + 4, l.y + 4, { steps: 4 }); await page.waitForTimeout(400); await page.mouse.click(l.x + 4, l.y + 4); },
    probe: (page) => page.evaluate(() => ({ hk: window.__vt.state.hk, card: document.getElementById('histCard').hidden })) },
  { name: 'h2-key', hash: 'e=gov2026&w=circles&sel=c:04013', act: key('h'), probe: (page) => page.evaluate(() => ({ hk: window.__vt.state.hk })) },
  { name: 'h2-close', hash: 'e=gov2026&w=circles&hk=04013', act: click('.hc-close'), probe: (page) => page.evaluate(() => ({ hk: window.__vt.state.hk, hidden: document.getElementById('histCard').hidden })) },
  { name: 'h2-follows', hash: 'e=gov2026&w=circles&hk=04013', probe: async (page) => {
    const now = () => page.evaluate(() => ({ e: window.__vt.state.e, x: +document.querySelector('#histCard .hc-now').getAttribute('x1'), rings: document.querySelectorAll('#histCard path[stroke-width="1.8"]').length }));
    const a = await now(); await page.keyboard.press('ArrowLeft'); await settle(page); const b = await now(); await page.keyboard.press('ArrowLeft'); await settle(page); const c = await now();
    return { a, b, c, ok: a.x > b.x && b.x > c.x && a.rings > 0 }; } },
  { name: 'h2-data', hash: 'e=pres2024&w=circles&hk=04013', probe: (page) => page.evaluate(async () => {
    const E = (await (await fetch('elections.json')).json()).elections, v = window.__vt, f = '04013', C = v.places.countyOf(f), S = v.places.stateOf('AZ');
    const mg = (x) => (x[2] - x[1]) / x[0] * 100, ids = v.places.list.map((x) => x.e);
    const cOk = C.every((x) => (E[x.e].data[f] ? Math.abs(mg(E[x.e].data[f]) - x.m) < 1e-9 : x.m == null));
    const sOk = S.every((x) => { let d = 0, r = 0, t = 0; for (const g of Object.keys(v.meta)) { if (v.meta[g].st !== 'AZ' || !E[x.e].data[g]) continue; const q = E[x.e].data[g]; t += q[0]; d += q[2]; r += q[1]; } return t === 0 ? x.m == null : Math.abs((d - r) / t * 100 - x.m) < 1e-9; });
    return { ids: ids.join(), n: C.length, cOk, sOk, charts: document.querySelectorAll('#histCard .hc-charts svg').length, kinds: [...new Set(C.map((x) => x.kind))].join(), ok: cOk && sOk && ids.length === 11 && !ids.includes('senprior') && document.querySelectorAll('#histCard .hc-charts svg').length === 2 }; }) },
  // Regional close-ups: any selection, or a preset region defined in regions.json with its county codes and definition.
  { name: 'q-closeup-sel', hash: 'e=pres2024&w=circles&sel=s:ME&cu=sel' },
  { name: 'q-closeup-chip', hash: 'e=pres2024&w=circles&sel=s:RI', act: click('#selCloseup'), probe: (page) => page.evaluate(() => ({ cu: window.__vt.state.cu, open: !document.getElementById('drawer').hidden })) },
  { name: 'q-closeup-preset', hash: 'e=pres2024&w=circles', act: seq(click('#regionsBox summary'), click('[data-preset=rio-grande]')),
    probe: (page) => page.evaluate(() => ({ cu: window.__vt.state.cu, sel: window.__vt.state.sel, n: window.__vt.sel().counties.size, title: document.querySelector('#drawer header b').textContent })) },
  { name: 'q-closeup-black-belt', hash: 'e=pres2024&w=terrain&v=national&sel=p:black-belt&cu=black-belt' },
  { name: 'q-closeup-filter', hash: 'e=pres2024&w=circles&sel=p:maine&cu=maine', act: click('#drawer [data-k=sen]') },
  { name: 'q-closeup-hover', hash: 'e=pres2024&w=circles&sel=p:maine&cu=maine', act: async (page) => { const b = await page.locator('#drawer .dr-map path').first().boundingBox(); await page.mouse.move(b.x + b.width / 2 - 5, b.y + b.height / 2 - 5); await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2); await page.waitForTimeout(250); }, tip: true,
    probe: (page) => page.evaluate(() => ({ hl: document.querySelectorAll('#drawer .hl').length })) },
  { name: 'q-closeup-line-click', hash: 'e=pres2024&w=circles&sel=p:maine&cu=maine', act: async (page) => { const b = await page.locator('#drawer .dr-chart svg rect').boundingBox(); await page.mouse.move(b.x + b.width * 0.5, b.y + b.height * 0.5); await page.mouse.move(b.x + b.width * 0.5 + 2, b.y + b.height * 0.5 + 2); await page.waitForTimeout(250); await page.mouse.click(b.x + b.width * 0.5 + 2, b.y + b.height * 0.5 + 2); },
    probe: (page) => page.evaluate(() => ({ sel: window.__vt.state.sel, cu: window.__vt.state.cu, n: window.__vt.sel() && window.__vt.sel().counties.size })) },
  { name: 'q-closeup-close', hash: 'e=pres2024&w=circles&sel=p:maine&cu=maine', act: click('.dr-close'), probe: (page) => page.evaluate(() => ({ cu: window.__vt.state.cu, hidden: document.getElementById('drawer').hidden, sel: window.__vt.state.sel })) },
  { name: 'q-closeup-clear', hash: 'e=pres2024&w=circles&sel=s:ME&cu=sel', act: key('Escape'), probe: (page) => page.evaluate(() => ({ cu: window.__vt.state.cu, hidden: document.getElementById('drawer').hidden })) },
  { name: 'q-closeup-phone', hash: 'e=pres2024&w=circles&sel=p:maine&cu=maine', viewport: { width: 390, height: 844 } },
  { name: 'q-closeup-data', hash: 'e=pres2024&w=circles&sel=p:rio-grande&cu=rio-grande', probe: (page) => page.evaluate(async () => {
    const R = (await (await fetch('regions.json')).json()).regions, E = (await (await fetch('elections.json')).json()).elections, v = window.__vt, out = {};
    for (const r of R) {
      const A = v.places.areaOf(r.counties), a = A.find((x) => x.e === 'pres2024'); let t = 0, d = 0, q = 0; for (const f of r.counties) { const c = E.pres2024.data[f]; if (c) { t += c[0]; d += c[2]; q += c[1]; } }
      out[r.id] = { n: r.counties.length, found: r.counties.every((f) => v.meta[f]), states: [...new Set(r.counties.map((f) => v.meta[f].st))].join(), votes: t, area: a.votes, margin: +((d - q) / t * 100).toFixed(3), hasDef: r.definition.length > 40 && r.source.length > 20, ok: r.counties.every((f) => v.meta[f]) && a.votes === t && Math.abs(a.m - (d - q) / t * 100) < 1e-9 };
    }
    out.rowsInDrawer = document.querySelectorAll('#drawer .dr-t tbody tr').length;
    out.ok = Object.values(out).every((x) => typeof x !== 'object' || x.ok) && out['rio-grande'].n === 13 && out.maine.n === 16 && out['black-belt'].n === 357 && out.rowsInDrawer === 11;
    return out; }) },
  ...['turnout-dropoff-2026', 'ticket-splitting-2026', 'county-history-maricopa', 'closeup-rio-grande'].map((v) => ({ name: `v-view-${v}`, query: `view=${v}`,
    probe: (page) => page.evaluate(() => ({ card: document.getElementById('viewCard').innerText.replace(/\s+/g, ' '), w: window.__vt.effW(), hk: window.__vt.state.hk, cu: window.__vt.state.cu, sel: window.__vt.state.sel })) })),
  { name: 'n-nogl-road', hash: 'e=pres2024&w=road', gl: false },
  { name: 'n-nogl-closest', hash: 'e=sen2026&w=closest', gl: false },
  { name: 'n-nogl-ms', hash: 'w=scatter&sx=ms', gl: false },
].filter((s) => !ONLY || s.name.includes(ONLY));

// ---------- the record kept for each scenario ----------
async function settle(page) {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 120)))));
}
const fingerprint = (page, withTip) => page.evaluate(async (withTip) => {
  const txt = (q) => { const e = document.querySelector(q); return e ? (e.hidden ? '[hidden] ' : '') + e.textContent.replace(/\s+/g, ' ').trim() : null; };
  const sha = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-1', new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const svgs = [...document.querySelectorAll('#v2d svg')].filter((s) => s.closest('[hidden]') === null);
  const vt = window.__vt;
  return {
    hash: location.hash,
    view: vt ? vt.effW() : null,
    selection: vt && vt.sel() ? vt.sel().counties.size : 0,
    pressed: [...document.querySelectorAll('button[aria-pressed=true]')].map((b) => b.textContent.trim()).join(' | '),
    disabled: [...document.querySelectorAll('button:disabled')].map((b) => b.id || b.textContent.trim()).join(' | '),
    text: Object.fromEntries(['#keyTitle', '#rampLabels', '#keyHeight', '#keyWeight', '#bopTitle', '#bopLines', '#bopBody', '#notes', '#source', '#selChip',
      '#tabWhy', '#notice', '#viewNote', '#weightHow', '#swingHow', '#scaleHow', '#lensHow', '#lensState', '#swingBtn', '.v2d-head', '.v2d-foot', '#tableWrap',
      '#findList', '#about', '#rank', '.tour-caption', '#ovCard', '#keyOv', '#histCard', '#drawer', '#dropHow'].map((q) => [q, txt(q)])),
    ramp: document.getElementById('ramp').innerHTML,
    svg: await Promise.all(svgs.map((s) => sha(s.outerHTML))),
    svgCounts: svgs.map((s) => s.querySelectorAll('circle, path, line').length).join(','),
    tip: withTip ? txt('.vt-tip') : undefined,
    labels: [...document.querySelectorAll('.peak, .metro')].filter((p) => p.style.visibility === 'visible').map((p) => p.textContent).join(','),
    shown: ['#terrain canvas', '#map', '#v2d .v2d-root', '#locator'].map((q) => { const e = document.querySelector(q); return q + ':' + (!e ? 'none' : getComputedStyle(e).display === 'none' || e.hidden ? 'off' : 'on'); }).join(' '),
  };
}, withTip);

// ---------- run ----------
const results = {}, errors = {}, loadBytes = {};
// The machine's GPU through full Chromium when it is installed (VT_CHROME, or Playwright's Chrome for Testing);
// otherwise Playwright's headless shell with SwiftShader, which works but draws a frame in about a second.
const CHROME = process.env.VT_CHROME || [path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')].find((f) => fs.existsSync(f));
const LAUNCH = CHROME ? { executablePath: CHROME, headless: true } : {};
const GL_ARGS = CHROME ? ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const NOGL_ARGS = ['--disable-webgl', '--disable-webgl2', '--disable-3d-apis'];
for (const gl of [true, false]) {
  const list = SCENARIOS.filter((s) => (s.gl !== false) === gl);
  if (!list.length) continue;
  const browser = await chromium.launch({ ...LAUNCH, args: gl ? GL_ARGS : NOGL_ARGS });
  for (const sc of list) {
    const ctx = await browser.newContext({ viewport: sc.viewport || { width: 1440, height: 900 }, reducedMotion: 'reduce', deviceScaleFactor: 1 });
    // CDN scripts and fonts come from a local cache after the first fetch: faster, and the same bytes every run.
    await ctx.route(/^https:\/\/(cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com)\//, async (route) => {
      const u = route.request().url(), f = path.join(CDN, crypto.createHash('sha1').update(u).digest('hex'));
      if (!fs.existsSync(f)) {
        const r = await route.fetch();
        if (!r.ok()) return route.fulfill({ response: r });
        fs.writeFileSync(f, await r.body()); fs.writeFileSync(f + '.type', r.headers()['content-type'] || '');
      }
      route.fulfill({ status: 200, body: fs.readFileSync(f), headers: { 'content-type': fs.readFileSync(f + '.type', 'utf8'), 'access-control-allow-origin': '*' } });
    });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push('console: ' + m.text()); });
    page.on('requestfailed', (r) => { if (!/fonts\.g/.test(r.url())) errs.push('requestfailed: ' + r.url()); });
    const bytes = { local: 0, localGzip: 0, cdn: 0, files: [] };
    page.on('response', async (r) => {
      try {
        const b = await r.body(), u = r.url();
        if (u.startsWith(ORIGIN)) { bytes.local += b.length; bytes.localGzip += zlib.gzipSync(b).length; bytes.files.push(u.slice(ORIGIN.length).replace(/\?.*/, '')); }
        else if (!/fonts\.g/.test(u)) bytes.cdn += b.length;
      } catch (e) { /* redirects and aborted bodies */ }
    });
    const t0 = Date.now();
    await page.goto(ORIGIN + (sc.query ? '?' + sc.query : '') + (sc.hash ? '#' + sc.hash : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => { const v = window.__vt; if (!v) return false; if (v.effW() !== 'terrain') return true;
      return v.state.s === 'terrain' ? !!v.terrain() : !!(v.blocks ? v.blocks() : v.deckgl()); }, null, { timeout: 30000 }).catch(() => errs.push('timeout: page never became ready'));
    await settle(page);
    if (sc.name === 't-default') loadBytes.firstLoad = { ...bytes, files: bytes.files.slice() };
    if (sc.act) { await sc.act(page); await settle(page); }
    const probe = sc.probe ? await sc.probe(page) : undefined;
    results[sc.name] = { ...(await fingerprint(page, !!sc.tip)), probe };
    await page.screenshot({ path: path.join(RUN, sc.name + '.png') });
    errors[sc.name] = errs;
    await ctx.close();
    process.stdout.write((errs.length ? 'E' : '.') + (process.env.VT_SMOKE_TIMES ? `${sc.name} ${Date.now() - t0}ms\n` : ''));
  }
  await browser.close();
}
server.close();
process.stdout.write('\n');
// Recording a subset (--only) updates those scenarios in the existing baseline and keeps the rest.
const prior = RECORD && ONLY && fs.existsSync(path.join(RUN, 'results.json')) ? JSON.parse(fs.readFileSync(path.join(RUN, 'results.json'), 'utf8')) : null;
fs.writeFileSync(path.join(RUN, 'results.json'), JSON.stringify(prior ? { results: { ...prior.results, ...results }, errors: { ...prior.errors, ...errors }, loadBytes: prior.loadBytes } : { results, errors, loadBytes }, null, 1));

const fb = loadBytes.firstLoad;
if (fb) console.log(`First load (t-default): ${(fb.local / 1e6).toFixed(2)} MB from the page folder (${(fb.localGzip / 1e6).toFixed(2)} MB gzipped), ${(fb.cdn / 1e6).toFixed(2)} MB from CDNs; files: ${fb.files.join(' ')}`);
const errCount = Object.values(errors).reduce((a, e) => a + e.length, 0);
for (const [n, e] of Object.entries(errors)) for (const x of e) console.log(`  ${n}: ${x}`);
if (RECORD) { console.log(`Recorded ${Object.keys(results).length} scenarios to ${RUN}${errCount ? `, with ${errCount} page errors` : ''}.`); process.exit(errCount ? 1 : 0); }

// ---------- compare with the baseline ----------
const base = JSON.parse(fs.readFileSync(path.join(BASE, 'results.json'), 'utf8')).results;
// Screenshot difference: share of pixels where any channel differs by more than 24, measured in the browser.
const browser = await chromium.launch(LAUNCH);
const page = await browser.newPage();
const pixelDiff = (a, b) => page.evaluate(async ([a, b]) => {
  const load = (src) => new Promise((r) => { const i = new Image(); i.onload = () => r(i); i.src = src; });
  const [ia, ib] = await Promise.all([load(a), load(b)]);
  if (ia.width !== ib.width || ia.height !== ib.height) return 1;
  const c = new OffscreenCanvas(ia.width, ia.height), x = c.getContext('2d');
  x.drawImage(ia, 0, 0); const da = x.getImageData(0, 0, ia.width, ia.height).data;
  x.clearRect(0, 0, ia.width, ia.height); x.drawImage(ib, 0, 0); const db = x.getImageData(0, 0, ia.width, ia.height).data;
  let n = 0; for (let i = 0; i < da.length; i += 4) if (Math.abs(da[i] - db[i]) > 24 || Math.abs(da[i + 1] - db[i + 1]) > 24 || Math.abs(da[i + 2] - db[i + 2]) > 24) n++;
  return n / (da.length / 4);
}, [a, b]);
const uri = (f) => 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
let fails = 0;
for (const [n, r] of Object.entries(results)) {
  const b = base[n]; const out = [];
  if (!b) { console.log(`${n}: not in the baseline`); fails++; continue; }
  const flat = (o, p = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? flat(v, p + k + '.') : [[p + k, JSON.stringify(v)]]));
  const fb2 = Object.fromEntries(flat(b));
  // Metro labels hide when they would collide, checked every 30 frames: which ones show can differ run to run.
  for (const [k, v] of flat(r)) if (fb2[k] !== v) out.push(`  ${k}:\n    was ${String(fb2[k]).slice(0, 300)}\n    now ${String(v).slice(0, 300)}${k === 'labels' ? ' (loose: reported only)' : ''}`);
  const d = await pixelDiff(uri(path.join(BASE, n + '.png')), uri(path.join(RUN, n + '.png')));
  const loose = LOOSE && n.startsWith(LOOSE);
  if (d > 0.002) out.push(`  screenshot: ${(d * 100).toFixed(2)}% of pixels differ${loose ? ' (loose: reported only)' : ''}`);
  const failing = out.filter((l) => !/loose: reported only/.test(l));
  if (out.length) console.log(`${n}${failing.length ? '' : ' (report only)'}:\n${out.join('\n')}`);
  if (failing.length || errors[n].length) fails++;
}
await browser.close();
console.log(fails ? `${fails} of ${Object.keys(results).length} scenarios differ from the baseline or logged errors.` : `All ${Object.keys(results).length} scenarios match the baseline, no page errors.`);
process.exit(fails ? 1 : 0);
