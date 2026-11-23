import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, loadAudio, loadEpisodes } from './generate.mjs';
import { SITE, TITLE_MAX, episodeTitle, audioStatusLine, checkScript, numberRanges, withAudioStatus, formatDuration, parseEpisode, transcriptHtml, wordCount } from './episodes.mjs';

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

test('every page links Sed Contra, the Aquinas series (platform/pages/siblings.mjs)', () => {
  for (const [rel, contents] of Object.entries(buildAll())) {
    if (rel.endsWith('.html')) assert.match(contents, /href="\.\.\/sed-contra\/"/, rel);
  }
});

test('the footer links its sibling Catholic Shorts', async () => {
  const { renderIndex } = await import('./episodes.mjs');
  assert.match(renderIndex([], {}), /href="\.\.\/catholic-shorts\/"/);
});

test('PRODUCTION.md holds no Done entries (run node list_done.mjs)', async () => {
  const { split } = await import('./list_done.mjs');
  const { moved } = split(readFileSync(path.join(ROOT, 'PRODUCTION.md'), 'utf8'));
  assert.deepEqual(moved.map((e) => e[0].slice(0, 80)), []);
});

test('list_done moves a Done entry with its continuation lines and keeps quoted markers', async () => {
  const { split, appendDone, DONE_HEAD } = await import('./list_done.mjs');
  const text = 'Mark one `- *(Done: episode N, Title.)*`:\n\n- *(Done: episode 9, A.)* x\n  more\n- open idea\n';
  const { production, moved } = split(text);
  assert.equal(production, 'Mark one `- *(Done: episode N, Title.)*`:\n\n- open idea\n');
  assert.deepEqual(moved, [['- *(Done: episode 9, A.)* x', '  more']]);
  const once = appendDone('', moved);
  assert.ok(once.startsWith(DONE_HEAD) && once.endsWith('\n\n- *(Done: episode 9, A.)* x\n  more\n'));
  assert.ok(appendDone(once, [['- *(Done: episode 10, B.)*']]).endsWith('  more\n- *(Done: episode 10, B.)*\n'));
});

test('numberRanges joins runs of episode numbers', () => {
  assert.equal(numberRanges([]), 'none');
  assert.equal(numberRanges([4]), '4');
  assert.equal(numberRanges([1, 2, 3]), '1 to 3');
  assert.equal(numberRanges([1, 2, 3, 5, 8, 9]), '1 to 3, 5 and 8 to 9');
});

test('the audio-status line follows the manifest, so a new render or episode needs no hand edit', () => {
  const eps = [1, 2, 3].map((number) => ({ number, slug: `s${number}` }));
  assert.equal(audioStatusLine(eps, {}), 'Audio: 0 of 3 episodes, numbers none. Text only: episodes 1 to 3.');
  assert.equal(audioStatusLine(eps, { s1: { seconds: 1640.5 }, s3: { seconds: 1800 } }),
    'Audio: 2 of 3 episodes, numbers 1 and 3 (27 to 30 minutes each). Text only: episode 2.');
  const doc = 'a\n<!-- audio-status: written by node generate.mjs from episodes/ and audio/manifest.json -->\nold\n<!-- /audio-status -->\nb';
  assert.match(withAudioStatus(doc, eps, {}), /-->\nAudio: 0 of 3 episodes, numbers none\. Text only: episodes 1 to 3\.\n<!-- \/audio-status -->\nb$/);
  assert.throws(() => withAudioStatus('no markers', eps, {}), /markers missing/);
});

test('llms.txt lists every episode, the licence and the AI disclosure', async () => {
  const { renderLlmsTxt } = await import('./episodes.mjs');
  const { loadEpisodes, loadAudio } = await import('./generate.mjs');
  const episodes = loadEpisodes();
  const text = renderLlmsTxt(episodes, loadAudio());
  for (const ep of episodes) assert.ok(text.includes(`${ep.slug}.html`), ep.slug);
  assert.match(text, /CC BY-SA 4\.0/);
  assert.match(text, /written by an AI/);
  assert.doesNotMatch(text, /MIT|financial or professional advice|github\.io/);
});

test('every episode page title fits a search result, keeping the longest suffix that fits', () => {
  for (const ep of episodes) assert.ok(episodeTitle(ep).length <= Math.max(TITLE_MAX, ep.title.length), ep.slug);
  assert.equal(episodeTitle({ title: 'Kevin and the Blackbird' }), 'Kevin and the Blackbird | Saints by Candlelight, bedtime podcast');
  assert.equal(episodeTitle({ title: 'Jonah' }), 'Jonah | Saints by Candlelight, a bedtime saints podcast');
  const long = 'Priscilla and Aquila and the Preacher from Alexandria';
  assert.equal(episodeTitle({ title: long }), long);
});
