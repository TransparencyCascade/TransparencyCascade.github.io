#!/usr/bin/env node
/* Smoke test for the vote-terrain page (static/maps/vote-terrain).

   Serves the page from disk, opens it in headless Chromium (playwright-core) with WebGL (SwiftShader)
   and again with WebGL off, walks a list of scenarios (tabs, lenses, offices, elections, shapes,
   selections, table, find, keys, phone width) and records for each: the hash, the text of the key,
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
  { name: 'n-nogl-house', hash: 'e=house2026&w=seats', gl: false },
  { name: 'n-nogl', hash: 'w=terrain', gl: false },
  { name: 'n-nogl-blocks', hash: 's=blocks', gl: false },
  { name: 'n-nogl-dots', hash: 'w=dots', gl: false },
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
      '#findList', '#about', '#rank', '.tour-caption'].map((q) => [q, txt(q)])),
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
    await page.goto(ORIGIN + (sc.hash ? '#' + sc.hash : ''), { waitUntil: 'domcontentloaded', timeout: 60000 });
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
