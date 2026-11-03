import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkEpisode, citation, normalise, parseEpisode, segments } from './script.mjs';
import { buildAll, loadEpisodes, renderFeed, vtt } from './generate.mjs';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

function fixture(body, sourceText = 'Header\n---\nNow whatever is in _motion_ is put in\nmotion by another, for nothing can be in motion.') {
  const root = mkdtempSync(path.join(tmpdir(), 'sed-contra-'));
  mkdirSync(path.join(root, 'sources'));
  writeFileSync(path.join(root, 'sources', 'I-q2-a3.txt'), sourceText);
  const meta = { number: 1, slug: 'x', title: 'X', fiction: 'All invented.', cast: { NARRATOR: { name: 'Narrator', voice: 'bf_emma' }, READER: { name: 'Thomas', voice: 'am_michael' } } };
  return { root, ep: parseEpisode(`---\n${JSON.stringify(meta)}\n---\n${body}`) };
}

test('every episode on disk passes its checks: known speakers, verbatim quotes, shorts under a minute', () => {
  const eps = loadEpisodes();
  assert.ok(eps.length >= 1);
  for (const ep of eps) assert.deepEqual(checkEpisode(ep, ROOT), [], ep.slug);
});

test('a quote matches across line breaks and italics, but a full stop Thomas did not write is a change', () => {
  const ok = fixture('## A {#a}\nREADER [I-q2-a3]: Now whatever is in motion is put in motion by another …\n');
  assert.deepEqual(checkEpisode(ok.ep, ok.root), []);
  const stop = fixture('## A {#a}\nREADER [I-q2-a3]: Now whatever is in motion is put in motion by another.\n');
  assert.match(checkEpisode(stop.ep, stop.root).join(), /not verbatim/);
});

test('quotes are checked strictly, with " … " marking a cut and pieces in order', () => {
  const good = fixture('## A {#a}\nREADER [I-q2-a3]: Now whatever is in motion is put in motion by another … nothing can be in motion.\n');
  assert.deepEqual(checkEpisode(good.ep, good.root), []);
  const changed = fixture('## A {#a}\nREADER [I-q2-a3]: Now whatever moves is put in motion by another\n');
  assert.match(checkEpisode(changed.ep, changed.root).join(), /not verbatim/);
  const reordered = fixture('## A {#a}\nREADER [I-q2-a3]: nothing can be in motion … Now whatever is in motion\n');
  assert.match(checkEpisode(reordered.ep, reordered.root).join(), /not verbatim/);
});

test('a READER line must name its source, and speakers must be in the cast', () => {
  const { root, ep } = fixture('## A {#a}\nREADER: unsourced words\nMAREN: who is this\n');
  const problems = checkEpisode(ep, root).join('\n');
  assert.match(problems, /READER line without a \[source\]/);
  assert.match(problems, /unknown speaker MAREN/);
});

test('a short over 150 words is refused, and shorts stay out of the long-form chapters', () => {
  const long = Array(160).fill('word').join(' ');
  const { root, ep } = fixture(`## A {#a}\nNARRATOR: hello\n## Short: Too long {#short-long}\nNARRATOR: ${long}\n`);
  assert.equal(ep.chapters.length, 1);
  assert.equal(ep.shorts.length, 1);
  assert.match(checkEpisode(ep, root).join(), /too long for a 60 s short/);
  assert.equal(segments(ep).shorts[0].kind, 'short');
});

test('normalise and citation', () => {
  assert.equal(normalise('a  _b_\n“c”--d'), 'a b "c"—d');
  assert.equal(citation('I-q46-a2'), 'Summa Theologiae I, q. 46, a. 2');
  assert.equal(citation('II-II-q10-a1'), 'Summa Theologiae II-II, q. 10, a. 1');
});

test('generated pages carry the disclaimer, the usage counter and cited quotes', () => {
  const files = buildAll();
  for (const [name, html] of Object.entries(files).filter(([n]) => n.endsWith('.html'))) {
    assert.match(html, /Written by an AI, around a real text/, name);
    assert.match(html, /countUsage\(/, name);
    assert.match(html, /<link rel="canonical" href="https:\/\/marisstella\.app\/sed-contra\//, name);
  }
  assert.match(files['the-first-mover.html'], /<cite>Thomas Aquinas, Summa Theologiae I, q\. 2, a\. 3/);
});

test('the feed lists only episodes with audio, with an exact enclosure length', () => {
  const ep = loadEpisodes()[0];
  assert.doesNotMatch(renderFeed([ep], {}), /<item>/);
  const feed = renderFeed([ep], { [ep.slug]: { audio: { file: 'x.mp3', bytes: 1234, seconds: 61 } } });
  assert.match(feed, /<enclosure url="https:\/\/marisstella\.app\/sed-contra\/media\/x\.mp3" length="1234" type="audio\/mpeg"\/>/);
  assert.match(feed, /<itunes:duration>61<\/itunes:duration>/);
});

test('SRT converts to WebVTT for the browser', () => {
  assert.equal(vtt('1\n00:00:01,250 --> 00:00:02,000\nHi\n'), 'WEBVTT\n\n00:00:01.250 --> 00:00:02.000\nHi\n');
});

test('pages link their sibling Saints by Candlelight, carry the no-warranty clause and a tab icon', () => {
  for (const [name, html] of Object.entries(buildAll()).filter(([n]) => n.endsWith('.html'))) {
    assert.match(html, /href="\.\.\/saints-by-candlelight\/"/, name);
    assert.match(html, /No warranty\./, name);
    assert.match(html, /<link rel="icon"/, name);
  }
});
