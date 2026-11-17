import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HERO_TOOLS, HOME_MOTION_CSS, HOME_MOTION_SCRIPT, SHOWCASE_DIR, copyShowcase, loadShowcase, renderHeroArt, renderMarquee, renderShowcaseSection } from './showcase.mjs';

function fixture() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'showcase-test-'));
  for (const f of ['a.webp', 'gone.webp', 'reel.webm', 'reel.mp4', 'poster.webp']) writeFileSync(path.join(dir, f), 'x');
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    shots: [
      { slug: 'a', file: 'a.webp', caption: 'Does <a> thing' },
      { slug: 'gone', file: 'gone.webp', caption: 'Withdrawn' },
      { slug: 'b', file: 'missing.webp', caption: 'File never captured' },
    ],
    reel: { webm: 'reel.webm', mp4: 'reel.mp4', poster: 'poster.webp', tools: ['a', 'gone'] },
  }));
  return dir;
}

test('the showcase keeps only tools this build publishes, with files on disk', () => {
  const showcase = loadShowcase(['a', 'b'], fixture());
  assert.deepEqual(showcase.shots.map((s) => s.slug), ['a']);
  assert.deepEqual(showcase.reel.tools, ['a']);
});

test('a missing manifest renders nothing rather than failing the build', () => {
  const empty = loadShowcase(['a'], mkdtempSync(path.join(os.tmpdir(), 'showcase-none-')));
  assert.deepEqual(empty, { shots: [], reel: null });
  assert.equal(renderShowcaseSection(empty), '');
  assert.equal(renderMarquee([[], []]), '');
});

test('only the files the showcase names are published', async () => {
  const source = fixture();
  const out = mkdtempSync(path.join(os.tmpdir(), 'showcase-out-'));
  const count = await copyShowcase(out, loadShowcase(['a'], source), source);
  assert.equal(count, 4);
  assert.deepEqual((await fs.readdir(path.join(out, SHOWCASE_DIR))).sort(), ['a.webp', 'poster.webp', 'reel.mp4', 'reel.webm']);
});

test('the showcase links each still to its tool and escapes captions', () => {
  const html = renderShowcaseSection(loadShowcase(['a'], fixture()), () => 'Tool A');
  assert.match(html, /<a href="a\/" data-tool="a">/);
  assert.match(html, /alt="Tool A with its worked example loaded"/);
  assert.match(html, /Does &lt;a&gt; thing/);
  // Muted, inline and not fetched until the script sees it on screen.
  assert.match(html, /<video class="reel-video" muted loop playsinline preload="none"/);
});

test("the marquee's loop copy is hidden from assistive technology and carries no links", () => {
  const html = renderMarquee([[{ slug: 'a', name: 'A' }], [{ slug: 'b', name: 'B' }]]);
  assert.equal((html.match(/data-tool=/g) || []).length, 2, 'each tool is counted as a hub link once');
  // One link per tool: the copy that makes the loop seamless is plain text, so
  // neither a crawler nor the tab order meets each name twice.
  assert.equal((html.match(/<a\b/g) || []).length, 2);
  assert.equal((html.match(/aria-hidden="true"/g) || []).length, 2);
  const hidden = [...html.matchAll(/<ul class="marquee-track" aria-hidden="true">([\s\S]*?)<\/ul>/g)].map((m) => m[1]);
  assert.equal(hidden.length, 2);
  for (const copy of hidden) assert.doesNotMatch(copy, /<a\b/);
});

test('scroll reveals hide only what starts below the fold, and never for good', () => {
  // A reader that does not scroll (a full-page capture, a link-preview or
  // search-engine renderer, print) must not be left with empty sections.
  assert.match(HOME_MOTION_SCRIPT, /getBoundingClientRect\(\)\.top > fold/);
  assert.match(HOME_MOTION_SCRIPT, /setTimeout\(showAll, \d+\)/);
  assert.match(HOME_MOTION_SCRIPT, /addEventListener\('beforeprint', showAll\)/);
});

test('the motion script parses and honours reduced motion', () => {
  assert.doesNotThrow(() => new Function(HOME_MOTION_SCRIPT));
  assert.match(HOME_MOTION_SCRIPT, /prefers-reduced-motion: reduce/);
});

test('the hero stays cheap to draw: no blur filters, no canvas shadows, a 1x canvas', () => {
  // On 2026-11-03 these four together held the homepage at 7 fps on a
  // throttled laptop CPU ("tons of lag on the site"): a filter: blur() over
  // moving, blended circles, backdrop-filter over the animated hero, a canvas
  // shadowBlur on every dot, and a 2x canvas redrawn every frame. Each one
  // repaints a large area every frame. framerate.mjs measures the result in a
  // browser; this catches the patterns before anything is built.
  const css = HOME_MOTION_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /(^|[^-])filter:\s*blur\(/, 'filter: blur() on the hero repaints it every frame');
  assert.doesNotMatch(css, /backdrop-filter/, 'backdrop-filter over animated content re-blurs every frame');
  assert.doesNotMatch(css, /mix-blend-mode/, 'blend modes force the layer under them to repaint');
  assert.doesNotMatch(css, /@keyframes[^{]*\{[^}]*background-position/, 'animating background-position repaints every frame');
  const script = HOME_MOTION_SCRIPT.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(script, /shadowBlur\s*=\s*[1-9]/, 'canvas shadowBlur is a blur per draw call');
  assert.match(script, /\bdpr = 1;/, 'the decorative canvas is drawn at CSS pixels');
});

test("the hero's art shows three linked stills, preferred tools first, and is hidden where there is no column", () => {
  const shot = (slug) => ({ slug, file: `${slug}.webp`, caption: `${slug} <caption>` });
  const shots = ['x', HERO_TOOLS[1], 'y', HERO_TOOLS[0]].map(shot);
  const html = renderHeroArt(shots, (slug) => slug.toUpperCase());
  const order = [...html.matchAll(/data-tool="([^"]+)"/g)].map((m) => m[1]);
  // Two preferred tools in HERO_TOOLS order, then the first other still fills the third place.
  assert.deepEqual(order, [HERO_TOOLS[0], HERO_TOOLS[1], 'x']);
  assert.equal((html.match(/<img /g) || []).length, 3);
  assert.equal((html.match(/loading="lazy"/g) || []).length, 3, 'a phone, where the art is hidden, must not fetch it');
  assert.match(html, /&lt;caption&gt;/);
  assert.match(html, /href="#showcase"/);
  // Fewer than two stills: no art rather than a lone card.
  assert.equal(renderHeroArt([shot('x')]), '');
  // Hidden by default, shown only in the wide-screen query; card motion stops under reduced motion.
  assert.match(HOME_MOTION_CSS, /\.hero-art \{ display: none; \}/);
  assert.match(HOME_MOTION_CSS, /@media \(min-width: 1180px\) \{\s*\.hero-grid/);
  assert.match(HOME_MOTION_CSS, /prefers-reduced-motion: reduce\) \{\s*\.hero-card \{ transition: none; \}/);
});

test('the published manifest has a still for every preferred hero tool', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('./showcase/manifest.json', import.meta.url), 'utf8'));
  const slugs = new Set(manifest.shots.map((s) => s.slug));
  assert.deepEqual(HERO_TOOLS.filter((slug) => !slugs.has(slug)), []);
});

test("the hero uses a still's close crop when it has one, publishes it, and falls back to the full still", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'showcase-hero-'));
  for (const f of ['a.webp', 'a-hero.webp', 'b.webp']) writeFileSync(path.join(dir, f), 'x');
  writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    shots: [
      { slug: 'a', file: 'a.webp', caption: 'A', hero: 'a-hero.webp' },
      { slug: 'b', file: 'b.webp', caption: 'B', hero: 'b-hero-never-captured.webp' },
    ],
  }));
  const showcase = loadShowcase(['a', 'b'], dir);
  assert.equal(showcase.shots[0].hero, 'a-hero.webp');
  assert.equal('hero' in showcase.shots[1], false, 'a crop missing on disk drops out');
  const html = renderHeroArt(showcase.shots, (slug) => slug, ['a', 'b']);
  assert.match(html, /src="showcase\/a-hero\.webp" width="600" height="375"/);
  assert.match(html, /src="showcase\/b\.webp" width="960" height="600"/);
  // The gallery further down uses the crop too, and the full still where there is none.
  const gallery = renderShowcaseSection(showcase);
  assert.match(gallery, /src="showcase\/a-hero\.webp" width="600" height="375"/);
  assert.match(gallery, /src="showcase\/b\.webp" width="960" height="600"/);
  const out = mkdtempSync(path.join(os.tmpdir(), 'showcase-hero-out-'));
  assert.equal(await copyShowcase(out, showcase, dir), 3);
  assert.deepEqual((await fs.readdir(path.join(out, SHOWCASE_DIR))).sort(), ['a-hero.webp', 'a.webp', 'b.webp']);
});

test('every preferred hero tool has a close crop on disk (polish-2026-11-16-hero-crops.md)', async () => {
  const manifest = JSON.parse(await fs.readFile(new URL('./showcase/manifest.json', import.meta.url), 'utf8'));
  const missing = HERO_TOOLS.filter((slug) => {
    const hero = manifest.shots.find((s) => s.slug === slug)?.hero;
    return !hero || !existsSync(new URL(`./showcase/${hero}`, import.meta.url));
  });
  assert.deepEqual(missing, []);
});

test('every gallery still has a close crop on disk (polish-2026-11-17-gallery-crops.md)', async () => {
  // The gallery's cards are 280 to 440 px wide; a full 1,280 px still drops its
  // text to about 3 px there. A new SHOTS entry needs a `hero` selector too.
  const manifest = JSON.parse(await fs.readFile(new URL('./showcase/manifest.json', import.meta.url), 'utf8'));
  const missing = manifest.shots
    .filter((s) => !s.hero || !existsSync(new URL(`./showcase/${s.hero}`, import.meta.url)))
    .map((s) => s.slug);
  assert.deepEqual(missing, []);
});
