import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadFiction, renderStoriesPage, STORIES_PATH } from './stories.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAudio as loadStoryAudio } from '../../ventures/hearth-and-horizon/generate.mjs';
import { loadAudio as loadEpisodeAudio } from '../../ventures/saints-by-candlelight/generate.mjs';
import { SITE_NAV } from './site-nav.mjs';

test('the Stories page is in the top navigation', () => {
  assert.ok(SITE_NAV.some((item) => item.id === 'stories' && item.href === STORIES_PATH));
});

test('every shelf of both fiction ventures is listed, newest first, linking into the venture', () => {
  const shelves = loadFiction();
  assert.deepEqual(shelves.map((s) => s.id), ['hearth-and-horizon', 'for-other-minds', 'little-lamps', 'saints-by-candlelight']);
  for (const shelf of shelves) {
    assert.ok(shelf.count > 0, shelf.id);
    assert.equal(shelf.items.length, shelf.count);
    const dates = shelf.items.map((i) => i.published);
    assert.deepEqual(dates, [...dates].sort().reverse(), `${shelf.id} newest first`);
    for (const i of shelf.items) assert.match(i.href, /^(hearth-and-horizon|saints-by-candlelight)\/[a-z0-9-]+\.html$/);
  }
});

test('the page links each shelf, its feed and its newest pieces, and says it is AI-written fiction', () => {
  const shelves = loadFiction();
  const html = renderStoriesPage(shelves, { baseUrl: 'https://example.org/' });
  assert.match(html, /<link rel="canonical" href="https:\/\/example.org\/stories\/">/);
  assert.match(html, /data-pfs-nav="stories" href="..\/stories\/" aria-current="page"/);
  for (const s of shelves) {
    assert.ok(html.includes(`href="../${s.feed}"`), s.id);
    assert.ok(html.includes(`href="../${s.items[0].href}"`), s.id);
  }
  assert.match(html, /written by Claude/);
  assert.match(html, /CC BY-SA 4\.0/);
});

test('no piece appears on two shelves, and each shelf holds only its own', () => {
  const shelves = loadFiction();
  const hrefs = shelves.flatMap((s) => s.items.map((i) => i.href));
  assert.equal(new Set(hrefs).size, hrefs.length);
  const [hearth, other, lamps] = shelves;
  assert.ok(hearth.items.every((i) => !other.items.some((o) => o.href === i.href) && !lamps.items.some((o) => o.href === i.href)));
});

test('minutes is a whole number where audio exists and null elsewhere, and withAudio counts it', () => {
  for (const shelf of loadFiction()) {
    for (const i of shelf.items) assert.ok(i.minutes === null || Number.isInteger(i.minutes), `${shelf.id} ${i.href}`);
    assert.equal(shelf.withAudio, shelf.items.filter((i) => i.minutes !== null).length, shelf.id);
  }
});

test('minutes is the venture audio manifest length in seconds over 60, rounded', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'ventures');
  const audio = {
    'hearth-and-horizon': loadStoryAudio(path.join(root, 'hearth-and-horizon')),
    'saints-by-candlelight': loadEpisodeAudio(path.join(root, 'saints-by-candlelight')),
  };
  let checked = 0;
  for (const shelf of loadFiction()) {
    for (const i of shelf.items) {
      const [venture, file] = i.href.split('/');
      const a = audio[venture][file.replace(/\.html$/, '')];
      if (!a) continue;
      assert.equal(i.minutes, Math.round(a.seconds / 60), i.href);
      checked++;
    }
  }
  assert.ok(checked > 0, 'some audio exists to check');
});
