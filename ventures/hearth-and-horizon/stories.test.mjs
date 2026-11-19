import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { buildAll, loadAudio, loadStories, speechFor } from './generate.mjs';
import { SHELVES, markdownToHtml, markdownToSpeech, parseStory, renderFeed, spliceReadme } from './stories.mjs';

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

test('every "<weekday> <day> <month> <year>" in a story is a real weekday', () => {
  // A revision pass on 2026-11-10 found 21 of 165 such claims wrong, several
  // beside a note saying "checked with a calendar routine". This is that routine.
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const re = new RegExp(`\\b(${days.join('|')}),? (?:the )?(\\d{1,2})(?:st|nd|rd|th)? (?:of )?(${months.join('|')}),? (\\d{4})\\b`, 'g');
  const wrong = [];
  let checked = 0;
  for (const s of stories) {
    const text = readFileSync(new URL(`stories/${s.slug}.md`, import.meta.url), 'utf8');
    for (const m of text.matchAll(re)) {
      checked += 1;
      const actual = days[new Date(Date.UTC(Number(m[4]), months.indexOf(m[3]), Number(m[2]))).getUTCDay()];
      if (actual !== m[1]) wrong.push(`${s.slug}: "${m[0]}" is a ${actual}`);
    }
  }
  assert.ok(checked > 100, `only ${checked} dated weekdays found; is the pattern still matching?`);
  assert.deepEqual(wrong, []);
});

test('the README lists every story, once, from the generated block', () => {
  const readme = buildAll()['README.md'];
  for (const s of stories) {
    const hits = readme.split(`](stories/${s.slug}.md)`).length - 1;
    assert.equal(hits, 1, `${s.slug} listed ${hits} times`);
  }
  assert.throws(() => spliceReadme('# no markers', stories), /markers/);
});

test('BIBLE.md holds no Done entries (run node bible_done.mjs)', async () => {
  const { split, appendDone } = await import('./bible_done.mjs');
  const { moved } = split(readFileSync(new URL('BIBLE.md', import.meta.url), 'utf8'));
  assert.deepEqual(moved.map((m) => m.lines[0].slice(0, 60)), []);
  const sample = '# B\n\n## Next up\n\nIntro.\n\n**Shelf A**\n\n- *(Done: X.)* a\n  b\n- *Open:* c\n  d\n\n**Shelf B**\n\n- *(Done: Y.)* e\n\n## After\n';
  const out = split(sample);
  assert.equal(out.bible, '# B\n\n## Next up\n\nIntro.\n\n**Shelf A**\n\n- *Open:* c\n  d\n\n**Shelf B**\n\n## After\n');
  const done = appendDone(appendDone('', out.moved), [{ shelf: 'Shelf A', lines: ['- *(Done: Z.)* f'] }]);
  assert.match(done, /## Shelf A\n\n- \*\(Done: X\.\)\* a\n  b\n- \*\(Done: Z\.\)\* f\n\n## Shelf B\n\n- \*\(Done: Y\.\)\* e\n$/);
});

test('BIBLE.md\'s setting timeline is in year order (run node bible_done.mjs)', async () => {
  const { sortTimeline } = await import('./bible_done.mjs');
  const bible = readFileSync(new URL('BIBLE.md', import.meta.url), 'utf8');
  assert.ok(sortTimeline(bible) === bible, 'run node ventures/hearth-and-horizon/bible_done.mjs to sort it');
  const sample = '## Setting timeline\n\nIntro.\n\n| Year | Fact |\n|---|---|\n| 2060s | a |\n| 2045-46 | b |\n| 2045 | c |\n| 1954 | d |\n\n## Next\n| 1 | x |\n';
  assert.equal(sortTimeline(sample), '## Setting timeline\n\nIntro.\n\n| Year | Fact |\n|---|---|\n| 1954 | d |\n| 2045-46 | b |\n| 2045 | c |\n| 2060s | a |\n\n## Next\n| 1 | x |\n');
});

test('bible_done moves a Done marker written at the end of a proposal', async () => {
  const { split, leadDone } = await import('./bible_done.mjs');
  assert.deepEqual(leadDone(['- *Open:* c *(Done: Q, here, 2050.)*']), ['- *(Done: Q, here, 2050.)* *Open:* c']);
  assert.deepEqual(leadDone(['- *Open:* c', '  d', '  *(Done: R,', '  there.)*']), ['- *(Done: R, there.)* *Open:* c', '  d']);
  assert.equal(leadDone(['- mark it `*(Done: Title.)*` like this']), null);
  assert.equal(leadDone(['- *Open:* nothing done']), null);
  const out = split('## Next up\n\n**Shelf A**\n\n- *Open:* c *(Done: Q.)*\n- *Still:* e\n');
  assert.equal(out.bible, '## Next up\n\n**Shelf A**\n\n- *Still:* e\n');
  assert.deepEqual(out.moved, [{ shelf: 'Shelf A', lines: ['- *(Done: Q.)* *Open:* c'] }]);
});

// A proposal that carries its own "close to a finished story" note reads as
// available but is not: The Wet Bulb sat flagged as the headline shelf's only
// proposal from 2026-11-13, and nine run records in two days said they found
// it unusable and had to invent a subject (doc friction on BIBLE.md). A run
// that finds an overlap rewrites the angle or deletes the proposal instead.
const OVERLAP_FLAG = /\b(?:too )?close to (?:the |a )?finished\b|\boverlaps? (?:with )?(?:the |a )?finished\b|\bduplicates? (?:the |a )?finished\b|\b(?:main )?angle (?:is|was) already done\b/i;

test('no Next up proposal is flagged as overlapping a finished story', () => {
  const bible = readFileSync(new URL('BIBLE.md', import.meta.url), 'utf8');
  const next = bible.split(/^## Next up$/m)[1].split(/^## /m)[0];
  const entries = next.split(/\n(?=- )/).filter((e) => e.startsWith('- '));
  const flagged = entries.filter((e) => OVERLAP_FLAG.test(e)).map((e) => e.slice(0, 70));
  assert.deepEqual(flagged, [], 'rewrite the angle or delete the proposal (node overlap.mjs <terms> finds overlaps)');
  assert.ok(OVERLAP_FLAG.test('(note: close to the finished *The Stone*)'));
  assert.ok(!OVERLAP_FLAG.test('Keep clear of length bias (*Gone Before Thursday*)'));
});

test('overlap.mjs finds terms in stories and DONE-only entries', async () => {
  const { overlap, doneEntries } = await import('./overlap.mjs');
  const done = doneEntries('- *(Done: Old One, Somewhere, 2050.)* uses the capstan\n  and a winch\n- *(Done: New, X.)* y');
  assert.deepEqual(done.map((d) => d.title), ['Old One', 'New']);
  const stories = [{ title: 'New', shelf: 'a', slug: 'new', setting: '', summary: '', body: 'a winch' }];
  const [winch, capstan, none] = overlap(['WINCH', 'capstan', 'peukert'], stories, done);
  assert.deepEqual([winch.stories.length, winch.done], [1, ['Old One']]);
  assert.deepEqual([capstan.stories.length, capstan.done], [0, ['Old One']]);
  assert.deepEqual([none.stories.length, none.done.length], [0, 0]);
  const [sump, cap] = overlap(['sump', 'caps*'], [{ ...stories[0], body: 'an assumption' }], done);
  assert.deepEqual([sump.stories.length, cap.done], [0, ['Old One']]);
});

test('overlap.mjs --unused drops a subject a story, DONE entry or proposal uses', async () => {
  const { parseSubjects, unusedSubjects, doneEntries, nextUpText, overlap } = await import('./overlap.mjs');
  const pool = parseSubjects('# c\nhearth-and-horizon | winch, capstan | a\nhearth-and-horizon | weir | b\nhearth-and-horizon | sluice | c\nhearth-and-horizon | Venturi | d\nlittle-lamps | Martha | e\n');
  assert.equal(pool.length, 5);
  assert.deepEqual(pool[0].terms, ['winch', 'capstan']);
  const stories = [{ title: 'S', shelf: 'hearth-and-horizon', slug: 's', setting: '', summary: '', body: 'a weir and Martha the welder' }];
  const done = doneEntries('## Hearth & Horizon\n- *(Done: Old, X.)* a capstan\n');
  assert.equal(done[0].shelf, 'hearth-and-horizon');
  const next = nextUpText('## Next up\n- *Sluice* proposed\n## What not to do\n- Venturi\n');
  // winch via synonym in DONE, weir in a story, sluice proposed; Venturi is
  // outside Next up; Martha is a science fiction name, not a Little Lamp.
  assert.deepEqual(unusedSubjects(pool, stories, done, next).map((c) => c.terms[0]), ['Venturi', 'Martha']);
  assert.deepEqual(unusedSubjects(pool, stories, done, next, 'little-lamps').map((c) => c.terms[0]), ['Martha']);
  const [inBody] = overlap(['weir'], stories, done, null, { titles: true });
  assert.equal(inBody.stories.length, 0);
});

test('subjects.txt lines parse into a known shelf, terms and an angle', async () => {
  const { parseSubjects } = await import('./overlap.mjs');
  const { SHELVES } = await import('./stories.mjs');
  const ids = new Set(SHELVES.map((s) => s.id));
  const pool = parseSubjects(readFileSync(new URL('subjects.txt', import.meta.url), 'utf8'));
  const bad = pool.filter((c) => !ids.has(c.shelf) || !c.terms.length || !c.angle).map((c) => c.terms.join(','));
  assert.deepEqual(bad, []);
});
