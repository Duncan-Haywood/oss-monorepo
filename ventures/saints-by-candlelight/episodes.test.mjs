import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, loadAudio, loadEpisodes } from './generate.mjs';
import { SITE, checkScript, formatDuration, parseEpisode, transcriptHtml, wordCount } from './episodes.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const episodes = loadEpisodes();
const audio = loadAudio();

test('every episode script follows PRODUCTION.md', () => {
  assert.ok(episodes.length >= 1);
  for (const ep of episodes) assert.deepEqual(checkScript(ep), [], ep.slug);
});

test('episode numbers run 1..n with no gaps or repeats', () => {
  assert.deepEqual(episodes.map((ep) => ep.number), episodes.map((_, i) => i + 1));
  assert.equal(new Set(episodes.map((ep) => ep.slug)).size, episodes.length);
});

test('every episode lists sources and says what is invented', () => {
  for (const ep of episodes) {
    assert.ok(ep.sources.length >= 1, ep.slug);
    assert.ok(ep.fiction.length > 20, ep.slug);
  }
});

test('generated files are current (run node generate.mjs)', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    assert.equal(readFileSync(path.join(ROOT, rel), 'utf8'), contents, rel);
  }
});

test('the audio manifest matches the MP3s on disk', () => {
  for (const [slug, entry] of Object.entries(audio)) {
    const file = path.join(ROOT, 'audio', `${slug}.mp3`);
    assert.ok(existsSync(file), file);
    assert.equal(statSync(file).size, entry.bytes, slug);
    assert.ok(entry.seconds > 60, slug);
    assert.ok(episodes.some((ep) => ep.slug === slug), `${slug} has no script`);
  }
});

test('the feed carries one enclosure per recorded episode, with the right length', () => {
  const feed = readFileSync(path.join(ROOT, 'feed.xml'), 'utf8');
  const enclosures = [...feed.matchAll(/<enclosure url="([^"]+)" length="(\d+)" type="audio\/mpeg"\/>/g)];
  assert.equal(enclosures.length, Object.keys(audio).length);
  for (const [, url, length] of enclosures) {
    const slug = url.slice(`${SITE}audio/`.length, -'.mp3'.length);
    assert.equal(Number(length), audio[slug].bytes);
  }
  assert.match(feed, /<itunes:image href="[^"]+cover\.png"\/>/);
  assert.match(feed, /<itunes:explicit>false<\/itunes:explicit>/);
  assert.doesNotMatch(feed, /&(?!amp;|lt;|gt;|quot;|#39;)/, 'unescaped ampersand');
});

test('every page carries the no-warranty clause and the AI disclosure', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    if (!rel.endsWith('.html')) continue;
    assert.match(contents, /No warranty\./, rel);
    assert.match(contents, /Written by an AI, read by a synthetic voice/, rel);
  }
});

test('parseEpisode and checkScript catch the common mistakes', () => {
  const ep = parseEpisode(
    '---\nnumber: 9\nslug: x\ntitle: X\npublished: 2026-01-01\nsummary: s\ntradition: t\nfeast: f\nhistory: h\nlegend: l\nfiction: invented things here\nsources:\n  - A book\n---\nSt. George met 3 dragons (allegedly).',
    'x.md',
  );
  assert.deepEqual(ep.sources, ['A book']);
  const problems = checkScript(ep).join(' | ');
  for (const fragment of ['words', 'digits', '"St."', 'parentheses', 'welcome', 'disclosure', 'sign-off']) {
    assert.ok(problems.includes(fragment), fragment);
  }
  assert.throws(() => parseEpisode('no front matter'), /front matter/);
});

test('transcripts drop [pause] and turn scene breaks into rules', () => {
  const html = transcriptHtml('One.\n\n[pause]\n\n* * *\n\nTwo & *three*.');
  assert.equal(html, '<p>One.</p>\n<hr>\n<p>Two &amp; <em>three</em>.</p>');
  assert.equal(wordCount('One two.\n\n[pause]\n\nThree.'), 3);
  assert.equal(formatDuration(3725.4), '1:02:05');
});

test('every page links its sibling audio venture (platform/pages/siblings.mjs)', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    if (rel.endsWith('.html')) assert.match(contents, /href="\.\.\/listen-and-learn-audio\/"/, rel);
  }
});
