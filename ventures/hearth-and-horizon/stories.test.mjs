import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildAll, loadAudio, loadStories, speechFor } from './generate.mjs';
import { SHELVES, markdownToHtml, markdownToSpeech, parseStory, renderFeed } from './stories.mjs';

const stories = loadStories();

test('every shelf has at least one story, and every story parses', () => {
  for (const shelf of SHELVES) assert.ok(stories.some((s) => s.shelf === shelf.id), shelf.id);
  for (const s of stories) assert.ok(s.words > 500, `${s.slug} is ${s.words} words`);
  assert.throws(() => parseStory('no front matter', 'x'), /front matter/);
  assert.throws(() => parseStory('---\ntitle: a\nshelf: nope\nsetting: s\npublished: 2026-01-01\nsummary: s\n---\nbody', 'x'), /unknown shelf/);
});

test('generated files are current (run node generate.mjs)', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    assert.ok(existsSync(new URL(rel, import.meta.url)), `${rel} missing`);
    assert.equal(readFileSync(new URL(rel, import.meta.url), 'utf8'), contents, `${rel} is stale`);
  }
});

test('markdown subset: scene breaks, quotes keep lines, inline marks, escaping', () => {
  const html = markdownToHtml('One *two* **three** `four` <five>\n\n* * *\n\n> line a\n> line b\n\n**Label:**\n- x\n- y');
  assert.match(html, /<em>two<\/em> <strong>three<\/strong> <code>four<\/code> &lt;five&gt;/);
  assert.match(html, /<hr class="break"/);
  assert.match(html, /<blockquote>\n<p>line a<br>\nline b<\/p>/);
  assert.match(html, /<p><strong>Label:<\/strong><\/p>\n<ul><li>x<\/li><li>y<\/li><\/ul>/);
  assert.equal(markdownToSpeech('Hi *there*.\n\n* * *\n\n> ## Quote'), 'Hi there.\n\n[pause]\n\nQuote');
});

test('markdown subset: pipe tables and links to sibling stories', () => {
  const html = markdownToHtml('See [Ten Percent](ten-percent.md) and [x](https://example.org/a.md).\n\n| | Said | Loss |\n|---|---|---|\n| 1 | 0.85 | **0.0225** |');
  assert.match(html, /<a href="ten-percent\.html">Ten Percent<\/a>/);
  assert.match(html, /<a href="https:\/\/example\.org\/a\.md">x<\/a>/);
  assert.match(html, /<th>Said<\/th>/);
  assert.match(html, /<td><strong>0\.0225<\/strong><\/td>/);
  assert.doesNotMatch(html, /---/);
  assert.equal(markdownToSpeech('See [Ten Percent](ten-percent.md).\n\n| | Said |\n|---|---|\n| 1 | 0.85 |'), 'See Ten Percent.\n\n1, Said: 0.85.');
});

test('every podcast feed is valid enough for directories: absolute URLs, licence, AI disclosure, enclosures match audio', () => {
  const audio = loadAudio();
  const files = buildAll();
  for (const shelf of SHELVES) {
    const xml = files[`feeds/${shelf.id}.xml`];
    assert.match(xml, /<itunes:image href="https:\/\/example\.invalid\/hearth-and-horizon\/covers\/[a-z-]+\.png"\/>/);
    assert.match(xml, /<podcast:license url="https:\/\/creativecommons\.org\/licenses\/by-sa\/4\.0\/">/);
    assert.match(xml, /Written by Claude, an AI model made by Anthropic/);
    assert.doesNotMatch(xml, /href="\.\.?\//, 'feeds need absolute URLs');
    for (const s of stories.filter((st) => st.shelf === shelf.id)) {
      assert.equal(xml.includes(`audio/${s.slug}.mp3`), Boolean(audio[s.slug]), s.slug);
      if (audio[s.slug]) assert.ok(existsSync(new URL(`audio/${s.slug}.mp3`, import.meta.url)), `${s.slug}.mp3 missing`);
    }
  }
  assert.doesNotMatch(renderFeed(SHELVES[0], stories, {}, {}), /itunes:owner/, 'no owner email until the owner gives one');
  assert.match(renderFeed(SHELVES[0], stories, {}, { ownerEmail: 'a@b.c' }), /<itunes:email>a@b\.c<\/itunes:email>/);
});

test('audio script credits the AI author and the licence', () => {
  const speech = speechFor(stories[0].slug);
  assert.match(speech, /Written by Claude, an A\.I\. model made by Anthropic/);
  assert.match(speech, /Creative Commons Attribution Share-Alike/);
});

test('every page carries the disclaimer, licence, usage switch and structured data', () => {
  for (const [rel, html] of Object.entries(buildAll()).filter(([r]) => r.endsWith('.html'))) {
    assert.match(html, /Fiction, written by an AI\./, rel);
    assert.match(html, /creativecommons\.org\/licenses\/by-sa\/4\.0/, rel);
    assert.match(html, /id="usageToggle"/, rel);
    assert.match(html, /application\/ld\+json/, rel);
    assert.match(html, /<link rel="canonical" href="https:\/\/example\.invalid\/hearth-and-horizon\//, rel);
  }
});

test('the index links its sibling audio-story venture (platform/pages/siblings.mjs)', () => {
  assert.match(buildAll()['index.html'], /href="\.\.\/listen-and-learn-audio\/"/);
});

test('llms.txt lists every story once, with honest audio status and no placeholder-only links to .txt', () => {
  const llms = readFileSync(new URL('./llms.txt', import.meta.url), 'utf8');
  const audio = loadAudio();
  for (const s of stories) {
    assert.equal(llms.split(`stories/${s.slug}.md)`).length - 1, 1, s.slug);
  }
  assert.match(llms, /^# Hearth & Horizon/);
  assert.match(llms, /written by an AI/);
  assert.equal((llms.match(/audio to follow/g) || []).length, stories.filter((s) => !audio[s.slug]).length);
});
