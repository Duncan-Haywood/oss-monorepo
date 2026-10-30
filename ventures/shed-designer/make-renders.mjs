// @ts-check
// Draws every starting design with the tool's own WebGL viewer in headless
// Chromium and saves the pictures to `renders/` as small WebP files, with
// `renders/manifest.json` (scene hash, alt text, size of each file).
//
//   node make-renders.mjs            redraw the designs whose scene changed
//   node make-renders.mjs --all      redraw everything
//   node make-renders.mjs --check    exit 1 if any picture is stale (no browser)
//   node make-renders.mjs --only=gallery-   redraw only the stale targets with that slug prefix
//
// Needs Playwright with Chromium: set PLAYWRIGHT to its index.js, or the cloud
// session's /opt/node-tools copy is found on its own. The scene hash covers
// the built geometry and colours (the same triangles the viewer uploads), the
// renderer's shaders and draw loop, the view list and RENDER_VERSION, so a
// change anywhere else in the tool does not mark the pictures stale.

import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildShed } from './model.mjs';
import { meshOf, solidsOf } from './render3d.mjs';
import { BUDGET, COVERINGS, RENDER_VERSION, VIEWS, altFor, designKey, renderTargets } from './renders.mjs';
import { GALLERY_DESIGNS } from './gallery-data.mjs';
import { SIZES, design as sizeDesign } from './make-size-pages.mjs';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
export const OUT = join(ROOT, 'renders');
export const MANIFEST = join(OUT, 'manifest.json');

/**
 * The parts of `render3d.mjs` that decide what a picture looks like: the
 * shaders and the draw loop. Falls back to the whole file if the markers move.
 */
export function rendererSource() {
  const src = readFileSync(join(ROOT, 'render3d.mjs'), 'utf8');
  const a = src.indexOf('const VS');
  const b = src.indexOf('export function createViewer');
  const c = src.indexOf('function draw()');
  const e = src.indexOf('requestDraw', c);
  if (a < 0 || b < a || c < 0 || e < c) return src;
  return src.slice(a, b) + src.slice(c, e);
}

/**
 * One hash for everything that shows in a design's pictures.
 * @param {any} design
 * @param {string} [renderer] from `rendererSource()`
 */
export function sceneHash(design, renderer = rendererSource()) {
  const h = createHash('sha256');
  h.update(JSON.stringify({ v: RENDER_VERSION, views: VIEWS, coverings: COVERINGS }));
  h.update(renderer);
  const solids = solidsOf(buildShed(design));
  for (const layer of new Set(solids.map((s) => s.layer))) {
    const m = meshOf(solids.filter((s) => s.layer === layer));
    h.update(layer);
    // Rounded to a thousandth so last-bit trig differences between Node
    // builds do not read as a change.
    for (const arr of [m.pos, m.nor, m.col, m.lines]) h.update(Int32Array.from(arr, (x) => Math.round(x * 1000)));
  }
  return h.digest('hex').slice(0, 16);
}

/** The designs behind the per-size lumber pages: a hero each (the framing view is the preset's). */
export function sizeTargets() {
  return SIZES.map(([w, l, base]) => ({ slug: `size-${w}x${l}`, key: `${w}x${l} size page`, design: sizeDesign(w, l, base), views: ['hero'] }));
}

/** The ready-design gallery (gallery-data.mjs): the strip's card picture each; the detail draws the rest live. */
export function galleryTargets() {
  return GALLERY_DESIGNS.map((g) => ({ slug: `gallery-${g.id}`, key: g.title, design: g.design, views: ['card'] }));
}

/** Everything `make-renders.mjs` draws: the presets (every view), the size pages' designs and the gallery's cards. */
export function allTargets() {
  return [...renderTargets(), ...sizeTargets(), ...galleryTargets()];
}

export function readManifest() {
  try { return JSON.parse(readFileSync(MANIFEST, 'utf8')); } catch { return { designs: {} }; }
}

/** Designs whose pictures are missing or out of date. */
export function staleTargets(manifest = readManifest(), targets = allTargets()) {
  const renderer = rendererSource();
  return targets.filter((t) => {
    const m = manifest.designs?.[t.slug];
    if (!m || m.hash !== sceneHash(t.design, renderer) || m.designKey !== designKey(t.design)) return true;
    if (Object.keys(m.files || {}).some((v) => !t.views.includes(v))) return true;
    return t.views.some((v) => !m.files?.[v] || !existsSync(join(OUT, m.files[v].file)));
  });
}

function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT, '/opt/node-tools/node_modules/playwright/index.js'].filter(Boolean);
  for (const p of tries) {
    if (!existsSync(/** @type {string} */ (p))) continue;
    try { return createRequire(import.meta.url)(/** @type {string} */ (p)); } catch { /* try the next */ }
  }
  try { return createRequire(import.meta.url)('playwright'); } catch { return null; }
}

const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.json': 'application/json' };
const STAGE = '<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:#eef2f7}canvas{display:block}</style><body></body>';

/**
 * Start a static server and a browser page that can draw designs.
 * @returns {Promise<{ draw: (design: any, view: string) => Promise<Buffer>, close: () => Promise<void> }>}
 */
export async function openStage() {
  const pw = loadPlaywright();
  if (!pw) throw new Error('Playwright not found: set PLAYWRIGHT to its index.js');
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url || '/', 'http://x').pathname)).replace(/^([/\\])+/, '');
    if (path === '__stage.html') { res.writeHead(200, { 'content-type': 'text/html' }); res.end(STAGE); return; }
    const file = join(ROOT, path);
    if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
  const port = /** @type {any} */ (server.address()).port;
  const browser = await pw.chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 2000, height: 1400 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${port}/__stage.html`);
  await page.evaluate(async () => {
    const [{ createViewer }, { buildShed }] = await Promise.all([import('./render3d.mjs'), import('./model.mjs')]);
    /** @type {any} */ (window).__draw = (design, v, coverings) => {
      // Drawn at twice the size and scaled down: SwiftShader's lines and
      // edges come out jagged otherwise.
      const ss = 2;
      document.body.innerHTML = '';
      const c = document.createElement('canvas');
      c.style.width = `${v.w * ss}px`; c.style.height = `${v.h * ss}px`;
      document.body.append(c);
      const viewer = createViewer(c, { presentation: v.presentation });
      if (!viewer) throw new Error('no WebGL');
      viewer.setDimensions(false);
      viewer.show(buildShed(design), { refit: true });
      for (const name of coverings) viewer.setLayer(name, v.layers !== 'framing');
      viewer.view(v.theta, v.phi);
      viewer.zoom(v.zoom);
      viewer.draw();
      const out = document.createElement('canvas'); out.width = v.w; out.height = v.h;
      const g = /** @type {CanvasRenderingContext2D} */ (out.getContext('2d'));
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      g.drawImage(c, 0, 0, v.w, v.h);
      // Lower the quality until the file fits its budget.
      const sizes = [];
      for (const q of [0.8, 0.72, 0.64, 0.56, 0.48]) {
        const url = out.toDataURL('image/webp', q);
        sizes.push(url);
        if (url.length * 0.75 <= v.budget) break;
      }
      return sizes[sizes.length - 1];
    };
  });
  return {
    async draw(design, view) {
      const v = { ...VIEWS[view], budget: view === 'hero' ? BUDGET.hero : BUDGET.other };
      const url = await page.evaluate(([d, vv, cov]) => /** @type {any} */ (window).__draw(d, vv, cov), [design, v, COVERINGS]);
      if (errors.length) throw new Error(`page error: ${errors.join('; ')}`);
      if (!String(url).startsWith('data:image/webp')) throw new Error('this Chromium cannot encode WebP');
      return Buffer.from(String(url).split(',')[1], 'base64');
    },
    async close() { await browser.close(); server.close(); },
  };
}

const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Rewrite the alt, width and height of every `<img src="renders/...">` in the
 * venture's pages from the manifest, so a redraw never leaves a stale alt.
 * Returns the pages it changed.
 */
export function syncPages(manifest = readManifest()) {
  const byFile = new Map(Object.values(manifest.designs).flatMap((d) => Object.values(d.files).map((f) => [f.file, f])));
  const changed = [];
  for (const page of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
    const path = join(ROOT, page);
    const html = readFileSync(path, 'utf8');
    const next = html.replace(/<img\b[^>]*\bsrc="renders\/([^"]+)"[^>]*>/g, (tag, file) => {
      const f = byFile.get(file);
      if (!f) return tag;
      return tag.replace(/\balt="[^"]*"/, `alt="${escAttr(f.alt)}"`).replace(/\bwidth="\d+"/, `width="${f.w}"`).replace(/\bheight="\d+"/, `height="${f.h}"`);
    });
    if (next !== html) { writeFileSync(path, next); changed.push(page); }
  }
  return changed;
}

async function main(argv) {
  if (argv.includes('--check')) {
    const stale = staleTargets();
    if (stale.length) {
      console.error(`Stale renders: ${stale.map((t) => t.slug).join(', ')}. Run: node ventures/shed-designer/make-renders.mjs`);
      process.exit(1);
    }
    console.log('renders: all up to date');
    return;
  }
  const targets = allTargets();
  // --only=<prefix> redraws just the targets whose slug starts with it (say
  // gallery- after make-gallery.mjs), leaving other lanes' stale pictures alone.
  const only = argv.find((a) => a.startsWith('--only='))?.slice(7);
  const todo = (argv.includes('--all') ? targets : staleTargets()).filter((t) => !only || t.slug.startsWith(only));
  const manifest = readManifest();
  manifest.designs ||= {};
  mkdirSync(OUT, { recursive: true });
  if (todo.length) {
    const stage = await openStage();
    try {
      const renderer = rendererSource();
      for (const t of todo) {
        const files = {};
        for (const view of t.views) {
          const png = await stage.draw(t.design, view);
          const file = `${t.slug}-${view}.webp`;
          writeFileSync(join(OUT, file), png);
          files[view] = { file, w: VIEWS[view].w, h: VIEWS[view].h, bytes: png.length, alt: altFor(t.design, view) };
        }
        manifest.designs[t.slug] = { key: t.key, name: t.design.name, hash: sceneHash(t.design, renderer), designKey: designKey(t.design), files };
        console.log(`${t.slug}: ${Object.values(files).map((f) => `${f.file} ${(f.bytes / 1024).toFixed(1)} KB`).join(', ')}`);
      }
    } finally { await stage.close(); }
  }
  // Designs that are no longer targets lose their pictures.
  const keep = new Set(targets.map((t) => t.slug));
  for (const slug of Object.keys(manifest.designs)) if (!keep.has(slug)) delete manifest.designs[slug];
  const wanted = new Set(Object.values(manifest.designs).flatMap((d) => Object.values(d.files).map((f) => f.file)));
  for (const f of readdirSync(OUT)) if (f.endsWith('.webp') && !wanted.has(f)) rmSync(join(OUT, f));
  const sorted = Object.fromEntries(Object.entries(manifest.designs).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(MANIFEST, `${JSON.stringify({ note: 'Written by make-renders.mjs; do not edit by hand.', renderVersion: RENDER_VERSION, designs: sorted }, null, 1)}\n`);
  const total = Object.values(sorted).flatMap((d) => Object.values(d.files)).reduce((s, f) => s + f.bytes, 0);
  const pages = syncPages();
  if (pages.length) console.log(`alt text refreshed in ${pages.join(', ')}`);
  console.log(`${todo.length} redrawn; renders/ holds ${(total / 1024).toFixed(0)} KB of ${(BUDGET.total / 1024).toFixed(0)} KB budget`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));
