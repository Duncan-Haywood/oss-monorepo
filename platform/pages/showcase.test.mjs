import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { HOME_MOTION_SCRIPT, SHOWCASE_DIR, copyShowcase, loadShowcase, renderMarquee, renderShowcaseSection } from './showcase.mjs';

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
