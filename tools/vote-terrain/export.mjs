#!/usr/bin/env node
/* Export saved views (static/maps/vote-terrain/views.json) as RAMM cards, and tours or plausible-swing sweeps as
   GIF and MP4, by driving the page in headless Chromium (?view=<slug>&export=1 hides the page's controls).

     node tools/vote-terrain/export.mjs --view <slug>                    card: master (2400 × 1500) + link + square
     node tools/vote-terrain/export.mjs --tour <slug> [--gif] [--mp4]    one card per step, then the animation
     node tools/vote-terrain/export.mjs --sweep <slug> [--from 2] [--to 14] [--step 1] [--gif] [--mp4]
                                                                        a House view at each plausible swing
     options: --out <dir> (default tools/vote-terrain/.export, never the published folder)  --hold <seconds per step, 3>
              --scale <device pixels per page pixel in the map, 1.4>  --root <page folder>

   The card follows the RAMM design system (article-images skill, design-system/images.md): onionskin ground,
   carbon-blue ink, a typed file line in Courier Prime, the view, one caption, and a foot with the source and
   the tag. Caption and source come from the view's record, resolved from the data by the page itself, so the
   card says exactly what the page says. Shapes: the master is the card's own shape; link (1.905) and square are
   padded with the ground colour by the article-images skill's export_sizes.py, never cropped.
   Needs playwright-core and Chromium (as smoke.mjs), python3 with Pillow, and ffmpeg for --gif and --mp4. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2), flag = (k) => argv.includes(k), opt = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const ROOT = path.resolve(opt('--root', path.join(HERE, '../../static/maps/vote-terrain')));
const OUT = path.resolve(opt('--out', path.join(HERE, '.export')));
if (OUT.startsWith(path.resolve(HERE, '../../static'))) { console.error('export.mjs: --out must be outside the published folder (static/).'); process.exit(2); }
const VIEW = opt('--view'), TOUR = opt('--tour'), SWEEP = opt('--sweep');
if (!VIEW && !TOUR && !SWEEP) { console.error('usage: export.mjs --view <slug> | --tour <slug> [--gif] [--mp4] | --sweep <slug> [--gif] [--mp4]'); process.exit(2); }
const HOLD = +opt('--hold', 3), SCALE = +opt('--scale', 1.4);
const ART = path.join(process.env.HOME, 'tcp-skills/plugins/tcp-skills/skills/article-images/scripts');
const PW = process.env.VT_PLAYWRIGHT || path.join(ART, 'node_modules/playwright-core');
const { chromium } = createRequire(PW + '/')(PW);
const CHROME = process.env.VT_CHROME || [path.join(process.env.HOME, 'Library/Caches/ms-playwright/chromium-1248/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing')].find((f) => fs.existsSync(f));
const LAUNCH = CHROME ? { executablePath: CHROME, headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] }
  : { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

// Design-system values (images.md): stage 2400 × 1500, margins 180 / 120, body from 240, foot hairline 240 from the bottom.
const C = { ground: '#E8ECEC', ink: '#23306B', graphite: '#5B6168', W: 2400, H: 1500 };

// ---------- static server: the page folder, as the site serves it ----------
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.bin': 'application/octet-stream', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname), file = path.join(ROOT, p === '/' ? 'index.html' : p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const ORIGIN = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch(LAUNCH);
const done = async (code) => { await browser.close(); server.close(); process.exit(code); };

const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cardHtml = (x, img) => `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&display=block">
<style>
  html, body { margin:0; }
  body { width:${C.W}px; height:${C.H}px; background:${C.ground}; color:${C.ink}; font-family:'Courier Prime', monospace; position:relative; overflow:hidden; }
  .file { position:absolute; left:180px; top:132px; width:2040px; font-size:36px; line-height:44px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .main { position:absolute; left:180px; top:240px; width:2040px; height:972px; display:flex; flex-direction:column; gap:32px; }
  .img { flex:1; min-height:0; display:flex; align-items:center; justify-content:center; }
  .img img { max-width:100%; max-height:100%; display:block; }
  .cap { font-size:40px; line-height:56px; max-width:1692px; margin:0; }
  .foot { position:absolute; left:180px; right:180px; top:${C.H - 240}px; border-top:2px solid rgba(35,48,107,.6); padding-top:40px; display:flex; justify-content:space-between; gap:60px; }
  .src { font-size:28px; line-height:30px; color:${C.graphite}; max-width:1860px; overflow-wrap:anywhere; }
  .tag { font-size:28px; line-height:30px; font-weight:700; white-space:nowrap; }
</style></head><body>
<div class="file">${esc(x.file)}</div>
<div class="main"><div class="img" id="img">${img ? `<img src="${img}" alt="">` : ''}</div><p class="cap">${esc(x.caption)}</p></div>
<div class="foot"><div class="src">${esc(x.sources)}</div><div class="tag">The RAMM</div></div>
</body></html>`;

// ---------- the page, in export mode ----------
const card = await (await browser.newContext({ viewport: { width: C.W, height: C.H }, deviceScaleFactor: 1 })).newPage();
let mapPage = null, mapCtx = null;
const settle = async (page, ms = 150) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.evaluate((ms) => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, ms)))), ms);
};
const openMap = async (slug, box) => {
  if (mapCtx) await mapCtx.close();
  mapCtx = await browser.newContext({ viewport: { width: Math.round(box.w / SCALE), height: Math.round(box.h / SCALE) }, deviceScaleFactor: SCALE, reducedMotion: 'reduce' });
  mapPage = await mapCtx.newPage();
  const errs = []; mapPage.on('pageerror', (e) => errs.push(e.message)); mapPage.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g/.test(m.text())) errs.push(m.text()); });
  await mapPage.goto(`${ORIGIN}?view=${slug}&export=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await mapPage.waitForFunction(() => { const v = window.__vt; return v && v.saved() && (v.effW() !== 'terrain' || (v.state.s === 'terrain' ? !!v.terrain() : !!v.blocks())); }, null, { timeout: 30000 });
  await settle(mapPage, 900);
  if (errs.length) { console.error('page errors:\n  ' + errs.join('\n  ')); await done(1); }
};
// The view's text as the page resolves it, and the card's image box for that text.
const textOf = (slug) => mapPage.evaluate((s) => window.__vt.saved().text(s), slug);
const boxFor = async (x) => {
  await card.setContent(cardHtml(x, ''), { waitUntil: 'networkidle' });
  const ok = await card.evaluate(async () => { await Promise.all([document.fonts.load('40px "Courier Prime"'), document.fonts.load('700 28px "Courier Prime"')]);
    return document.fonts.check('40px "Courier Prime"') && document.fonts.check('700 28px "Courier Prime"'); });
  if (!ok) { console.error('export.mjs: the design system\'s Courier Prime did not load; check the network and run again.'); await done(3); }
  const r = await card.$eval('#img', (e) => { const b = e.getBoundingClientRect(); return { w: Math.floor(b.width), h: Math.floor(b.height) }; });
  return r;
};
const renderCard = async (x, file) => {
  const png = await mapPage.screenshot({ type: 'png' });
  await card.setContent(cardHtml(x, 'data:image/png;base64,' + png.toString('base64')), { waitUntil: 'networkidle' });
  await card.evaluate(() => document.fonts.ready);
  await card.screenshot({ path: file });
  return file;
};
const shapes = (file) => {
  execFileSync('python3', [path.join(ART, 'export_sizes.py'), file, '--ground', C.ground, '--sizes', 'link,square'], { stdio: 'inherit' });
};
const animate = (frames, base) => {
  const have = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); return true; } catch (e) { return false; } })();
  if (!have) { fs.writeFileSync(base + '.README.txt', `ffmpeg was not found, so no animation was made. The frames are ${frames.map((f) => path.basename(f)).join(', ')}; each is meant to be held ${HOLD} seconds.\n`); console.log('ffmpeg not found: frames written, see ' + base + '.README.txt'); return; }
  const list = base + '.frames.txt';
  fs.writeFileSync(list, frames.map((f) => `file '${f}'\nduration ${HOLD}`).join('\n') + `\nfile '${frames[frames.length - 1]}'\n`);
  if (flag('--mp4')) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=1920:-2:flags=lanczos,format=yuv420p', '-r', '30', '-c:v', 'libx264', '-crf', '20', '-movflags', '+faststart', base + '.mp4']);
  if (flag('--gif')) execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-vf', 'scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=none', '-r', '10', base + '.gif']);
  fs.unlinkSync(list);
};

fs.mkdirSync(OUT, { recursive: true });
const written = [];
if (VIEW) {
  await openMap(VIEW, { w: 2040, h: 600 });               // first load: read the text, then size the map to its box
  const x = await textOf(VIEW), box = await boxFor(x);
  await openMap(VIEW, box);
  const f = await renderCard(x, path.join(OUT, `${VIEW}.png`)); shapes(f);
  written.push(f, f.replace(/\.png$/, '.link.png'), f.replace(/\.png$/, '.square.png'));
}
if (TOUR) {
  const reg = JSON.parse(fs.readFileSync(path.join(ROOT, 'views.json'), 'utf8')), t = reg.tours.find((x) => x.slug === TOUR);
  if (!t) { console.error(`no tour ${TOUR} in views.json`); await done(2); }
  // One map size for every step (the tallest caption decides it), so the animation does not jump.
  await openMap(t.steps[0].view, { w: 2040, h: 600 });
  const texts = []; for (const s of t.steps) texts.push(await mapPage.evaluate(([v, c]) => window.__vt.saved().text(v, c), [s.view, s.caption]));
  let box = null; for (const x of texts) { const b = await boxFor(x); if (!box || b.h < box.h) box = b; }
  await openMap(t.steps[0].view, box);
  const frames = [];
  for (const [i, s] of t.steps.entries()) {
    await mapPage.evaluate((v) => window.__vt.saved().open({ view: v }), s.view); await settle(mapPage, 900);
    frames.push(await renderCard(texts[i], path.join(OUT, `${TOUR}-${String(i + 1).padStart(2, '0')}.png`)));
  }
  written.push(...frames); animate(frames, path.join(OUT, TOUR));
  for (const e of ['.gif', '.mp4']) if (fs.existsSync(path.join(OUT, TOUR + e))) written.push(path.join(OUT, TOUR + e));
}
if (SWEEP) {
  // A House view at each plausible swing; the caption is the band count the page computes at that swing.
  const from = +opt('--from', 2), to = +opt('--to', 14), step = +opt('--step', 1);
  await openMap(SWEEP, { w: 2040, h: 600 });
  if (!(await mapPage.evaluate(() => window.__vt.house && window.__vt.elections[window.__vt.state.e].house))) { console.error(`--sweep needs a House view; ${SWEEP} is not one`); await done(2); }
  const base = await textOf(SWEEP);
  const capAt = () => mapPage.evaluate(() => { const h = window.__vt.house(), c = { captured: 0, contestable: 0, 'at risk': 0 };
    for (const d of h.districts) if (c[d.band] != null) c[d.band] += 1;
    return `Plausible swing ${h.plausible.value} points, ${h.label}${h.unofficial ? ' (unofficial)' : ''}: ${c.captured} seats captured, ${c.contestable} contestable, ${c['at risk']} at risk.`; });
  const box = await boxFor({ ...base, caption: await capAt() });
  await openMap(SWEEP, box);
  const frames = [];
  for (let ps = from, i = 1; ps <= to + 1e-9; ps += step, i++) {
    await mapPage.evaluate((v) => { const q = new URLSearchParams(location.hash.slice(1)); q.set('ps', String(v)); location.hash = q.toString(); }, Math.round(ps * 10) / 10);
    await settle(mapPage, 300);
    frames.push(await renderCard({ ...base, caption: await capAt() }, path.join(OUT, `${SWEEP}-ps-${String(i).padStart(2, '0')}.png`)));
  }
  written.push(...frames); animate(frames, path.join(OUT, `${SWEEP}-sweep`));
  for (const e of ['.gif', '.mp4']) if (fs.existsSync(path.join(OUT, `${SWEEP}-sweep${e}`))) written.push(path.join(OUT, `${SWEEP}-sweep${e}`));
}
for (const f of written) console.log(`${(fs.statSync(f).size / 1024).toFixed(0).padStart(6)} KB  ${f}`);
await done(0);
