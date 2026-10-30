// The pictures in renders/ must match the designs and renderer that drew them,
// stay within their size budget, and carry alt text. Redraw with
//   node ventures/shed-designer/make-renders.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BUDGET, VIEWS, altFor, renderFor, renderTargets } from './renders.mjs';
import { MANIFEST, OUT, openStage, readManifest, sceneHash, staleTargets } from './make-renders.mjs';

const FIX = 'redraw them with: node ventures/shed-designer/make-renders.mjs (needs Playwright; see the README, "Pictures of the designs")';

/** Width and height from a WebP header (VP8, VP8L or VP8X). */
function webpSize(buf) {
  assert.equal(buf.toString('ascii', 0, 4), 'RIFF');
  assert.equal(buf.toString('ascii', 8, 12), 'WEBP');
  const kind = buf.toString('ascii', 12, 16);
  if (kind === 'VP8 ') return [buf.readUInt16LE(26) & 0x3fff, buf.readUInt16LE(28) & 0x3fff];
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return [(b & 0x3fff) + 1, ((b >> 14) & 0x3fff) + 1]; }
  if (kind === 'VP8X') return [buf.readUIntLE(24, 3) + 1, buf.readUIntLE(27, 3) + 1];
  throw new Error(`unknown WebP chunk ${kind}`);
}

test('every starting design has up-to-date pictures', () => {
  assert.ok(existsSync(MANIFEST), `renders/manifest.json is missing; ${FIX}`);
  const stale = staleTargets();
  assert.deepEqual(stale.map((t) => t.slug), [], `These designs changed since their pictures were drawn; ${FIX}`);
});

test('the scene hash moves with what is drawn and nothing else', () => {
  const [t] = renderTargets();
  const h = sceneHash(t.design);
  assert.equal(sceneHash(structuredClone(t.design)), h);
  // A price or a name is not in the picture.
  assert.equal(sceneHash({ ...t.design, name: 'renamed', laborRate: 99, taxRate: 0 }), h);
  // Colour and size are.
  assert.notEqual(sceneHash({ ...t.design, sidingColor: 'blue' }), h);
  assert.notEqual(sceneHash({ ...t.design, length: t.design.length + 12 }), h);
  // So is the renderer.
  assert.notEqual(sceneHash(t.design, 'some other shader'), h);
});

test('each picture is a WebP of the size the manifest says, within budget, with alt text', () => {
  const m = readManifest();
  let total = 0;
  for (const t of renderTargets()) {
    const entry = m.designs[t.slug];
    assert.ok(entry, `${t.slug} has no pictures; ${FIX}`);
    for (const view of Object.keys(VIEWS)) {
      const f = entry.files[view];
      const buf = readFileSync(join(OUT, f.file));
      total += buf.length;
      assert.deepEqual(webpSize(buf), [VIEWS[view].w, VIEWS[view].h], f.file);
      assert.equal(buf.length, f.bytes, `${f.file} size in the manifest`);
      assert.ok(buf.length <= (view === 'hero' ? BUDGET.hero : BUDGET.other), `${f.file} is ${buf.length} bytes, over its budget`);
      assert.ok(f.alt.length > 40 && f.alt.length < 400, `${f.file} alt text`);
      assert.equal(f.alt, altFor(t.design, view), `${f.file} alt text is out of date; ${FIX}`);
      assert.deepEqual(renderFor(m, t.slug, view), { src: `renders/${f.file}`, width: f.w, height: f.h, alt: f.alt });
    }
  }
  assert.ok(total <= BUDGET.total, `renders/ is ${total} bytes, over the ${BUDGET.total} budget`);
});

test('renders/ holds nothing the manifest does not name', () => {
  const m = readManifest();
  const named = new Set(Object.values(m.designs).flatMap((d) => Object.values(d.files).map((f) => f.file)));
  for (const f of readdirSync(OUT)) {
    if (f === 'manifest.json') continue;
    assert.ok(named.has(f), `stray file renders/${f}`);
    assert.ok(statSync(join(OUT, f)).isFile());
  }
});

test('alt text says what each view shows', () => {
  const d = renderTargets().find((t) => t.slug === '8x12').design;
  assert.match(altFor(d, 'front'), /seen front: .*door/);
  assert.match(altFor(d, 'back'), /seen back: .*window/);
  assert.doesNotMatch(altFor(d, 'side'), /window|door/);
  assert.match(altFor(d, 'framing'), /^Framing of .*studs at 16" on centre/);
  assert.match(altFor(d, 'hero'), /8 by 12 ft/);
});

// Draws one view for real. Skips where Playwright is missing; the
// shed-designer-browser workflow has it.
const hasPw = ['/opt/node-tools/node_modules/playwright/index.js', process.env.PLAYWRIGHT].some((p) => p && existsSync(p));
test('the viewer draws a design in headless Chromium', { skip: hasPw ? false : 'Playwright not found (set PLAYWRIGHT to its index.js)', timeout: 120000 }, async () => {
  const stage = await openStage();
  try {
    const t = renderTargets().find((x) => x.slug === '8x8-lean');
    const buf = await stage.draw(t.design, 'front');
    assert.deepEqual(webpSize(buf), [VIEWS.front.w, VIEWS.front.h]);
    // A blank canvas compresses to a few hundred bytes; a drawn shed does not.
    assert.ok(buf.length > 1200, `only ${buf.length} bytes: the canvas looks empty`);
  } finally { await stage.close(); }
});

test('pages that show a picture use its current file and alt text', () => {
  const m = readManifest();
  const byFile = new Map(Object.values(m.designs).flatMap((d) => Object.values(d.files).map((f) => [f.file, f])));
  const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  let seen = 0;
  for (const page of readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.html'))) {
    const html = readFileSync(new URL(`./${page}`, import.meta.url), 'utf8');
    for (const [tag] of html.matchAll(/<img\b[^>]*\bsrc="renders\/[^"]+"[^>]*>/g)) {
      const file = /src="renders\/([^"]+)"/.exec(tag)[1];
      const f = byFile.get(file);
      assert.ok(f, `${page} shows renders/${file}, which make-renders.mjs no longer draws`);
      assert.equal(unesc(/alt="([^"]*)"/.exec(tag)?.[1] ?? ''), f.alt, `${page}: alt text of ${file} differs from the manifest`);
      assert.match(tag, new RegExp(`width="${f.w}" height="${f.h}"`), `${page}: ${file} width and height`);
      seen++;
    }
  }
  assert.ok(seen >= 2, 'the marketing page shows the 8x12 classic');
});
