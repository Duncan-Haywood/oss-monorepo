import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { LISTEN, loadFiction, longDate, renderListen, renderStoriesPage, STORIES_PATH } from './stories.mjs';
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

test('a card leads with its hook: title, summary, then a one-line setting and a date/audio row', () => {
  const shelf = {
    id: 'demo', title: 'Demo', tagline: 't', description: 'd', audience: 'a', href: 'demo/', feed: 'demo/feed.xml',
    count: 2, withAudio: 1,
    items: [
      { title: 'Heard', href: 'demo/heard.html', summary: 'Hook one.', meta: 'Kilnavarra (invented), Ireland, 2049', published: '2026-11-15', minutes: 8 },
      { title: 'Read', href: 'demo/read.html', summary: 'Hook two.', meta: 'Episode 3', published: '2026-01-02', minutes: null },
    ],
  };
  const html = renderStoriesPage([shelf]);
  const card = html.slice(html.indexOf('>Heard</a>'), html.indexOf('</li>', html.indexOf('>Heard</a>')));
  assert.ok(card.indexOf('Hook one.') < card.indexOf('class="where"'), 'hook comes before the setting');
  assert.match(card, /<div class="where" title="Kilnavarra \(invented\), Ireland, 2049">/);
  assert.match(card, /<time datetime="2026-11-15">15 November 2026<\/time><span class="audio">Audio, about 8 min<\/span>/);
  const read = html.slice(html.indexOf('>Read</a>'));
  assert.doesNotMatch(read.slice(0, read.indexOf('</li>')), /· text|class="audio"/, 'no "text" label and no audio badge without audio');
});

test('longDate writes ISO dates long and leaves anything else alone', () => {
  assert.equal(longDate('2026-11-05'), '5 November 2026');
  assert.equal(longDate('2026-13-05'), '2026-13-05');
  assert.equal(longDate('soon'), 'soon');
});

test('each shelf with recordings has a Listen panel: its newest recorded pieces, players that download nothing until pressed', () => {
  const shelf = {
    id: 'demo', title: 'Demo', tagline: 't', description: 'd', audience: 'a', href: 'demo/', feed: 'demo/feed.xml',
    count: 4, withAudio: 3,
    items: [
      { title: 'Unread', href: 'demo/unread.html', summary: 's', meta: 'm', published: '2026-11-16', minutes: null, audio: null },
      { title: 'Newest heard', href: 'demo/a.html', summary: 's', meta: 'm', published: '2026-11-15', minutes: 8, audio: 'demo/audio/a.mp3' },
      { title: 'Next heard', href: 'demo/b.html', summary: 's', meta: 'm', published: '2026-11-01', minutes: 12, audio: 'demo/audio/b.mp3' },
      { title: 'Old heard', href: 'demo/c.html', summary: 's', meta: 'm', published: '2026-10-01', minutes: 9, audio: 'demo/audio/c.mp3' },
    ],
  };
  const html = renderListen(shelf, '../');
  assert.equal((html.match(/<audio /g) || []).length, LISTEN);
  assert.ok(html.indexOf('Newest heard') < html.indexOf('Next heard'));
  assert.doesNotMatch(html, /Unread|Old heard/);
  assert.match(html, /<audio controls preload="none" src="\.\.\/demo\/audio\/a\.mp3" aria-label="Listen to Newest heard"><\/audio>/);
  assert.match(html, /About 8 min · <time datetime="2026-11-15">15 November 2026<\/time>/);
  const page = renderStoriesPage([shelf]);
  assert.match(page, /<div class="shelf-head has-listen">/);
  assert.equal(renderListen({ ...shelf, items: shelf.items.slice(0, 1) }, '../'), '', 'no panel without recordings');
});

test('every real shelf with audio gets a panel whose files are the ones its venture ships', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..', 'ventures');
  for (const shelf of loadFiction()) {
    const html = renderListen(shelf, '../');
    assert.equal(Boolean(html), shelf.withAudio > 0, shelf.id);
    for (const [, src] of html.matchAll(/<audio [^>]*src="\.\.\/([^"]+)"/g)) {
      const [venture, , file] = src.split('/');
      assert.ok(existsSync(path.join(root, venture, 'audio', file)), `${shelf.id}: ${src} is committed`);
    }
  }
});

test('the hero shows each shelf as its cover: small thumbnails the ventures ship, lazy, no alt text repeating the label', () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  const shelves = loadFiction();
  for (const shelf of shelves) {
    assert.ok(shelf.cover, `${shelf.id} has a cover thumbnail`);
    assert.ok(existsSync(path.join(root, 'ventures', shelf.cover)), `${shelf.cover} is a file the venture ships`);
  }
  const html = renderStoriesPage(shelves);
  assert.match(html, /<header class="pf-hero has-covers">/);
  const jump = /<ul class="jump">([\s\S]*?)<\/ul>/.exec(html)[1];
  const imgs = jump.match(/<img [^>]*>/g) || [];
  assert.equal(imgs.length, shelves.length, 'one cover per shelf link');
  for (const img of imgs) {
    assert.match(img, /alt=""/, 'decorative: the link text names the shelf');
    assert.match(img, /loading="lazy"/, 'a phone, where the covers are display:none, never fetches them');
    assert.match(img, /width="\d+" height="\d+"/, 'sized, so nothing shifts as it loads');
  }
  for (const shelf of shelves) assert.ok(jump.includes(`href="#${shelf.id}"`), shelf.id);
  // A shelf without a thumbnail keeps the chip row: no half-empty grid.
  const bare = shelves.map((s, i) => (i ? s : { ...s, cover: null }));
  assert.doesNotMatch(renderStoriesPage(bare), /pf-hero has-covers/);
});
