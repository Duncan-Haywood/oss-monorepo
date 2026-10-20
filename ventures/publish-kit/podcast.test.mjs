import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lintPodcast, buildPodcastFeed, buildShowPage, enclosureUrl } from './podcast.mjs';
import { sha1, podcastGuid, rfc822, crc32, xml } from './util.mjs';
import { parseFeed } from '../podcast-feed-check/feed-parser.mjs';
import { classifyFeed } from '../podcast-feed-check/engine.mjs';

const show = () => ({
  title: 'Night & Day', description: 'A show about <b>time</b>.', author: 'Ada',
  owner: { name: 'Ada', email: 'ada@example.com' }, language: 'en',
  link: 'https://example.com/show/', feedUrl: 'https://example.com/show/feed.xml',
  baseUrl: 'https://example.com/show/audio', image: 'https://example.com/show/cover.jpg',
  categories: ['Technology', 'Arts > Books'], explicit: false,
});
const ep = (n, extra = {}) => ({
  title: `Episode ${n}`, file: `audio/ep ${n}.mp3`, bytes: 1000 * n, duration: 61 * n, mime: 'audio/mpeg',
  pubDate: `2026-10-0${n}T09:00:00Z`, guid: `guid-${n}`, episode: n, ...extra,
});

test('sha1 matches node:crypto; podcast:guid matches the Podcasting 2.0 spec example', () => {
  for (const s of ['', 'abc', 'x'.repeat(200)]) {
    assert.equal(Buffer.from(sha1(new TextEncoder().encode(s))).toString('hex'), createHash('sha1').update(s).digest('hex'));
  }
  // The example the podcast namespace documents for podcast:guid.
  assert.equal(podcastGuid('https://podnews.net/rss'), '9b024349-ccf0-5f69-a609-6b82873eab3c');
  assert.equal(podcastGuid('podnews.net/rss/'), '9b024349-ccf0-5f69-a609-6b82873eab3c');
});

test('rfc822, crc32 and xml escaping', () => {
  assert.equal(rfc822('2024-10-02T15:00:00Z'), 'Wed, 02 Oct 2024 15:00:00 GMT');
  assert.throws(() => rfc822('not a date'));
  assert.equal(crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926');
  assert.equal(xml(`<a href="x">'&'</a>`), '&lt;a href=&quot;x&quot;&gt;&apos;&amp;&apos;&lt;/a&gt;');
});

test('a complete project lints clean and its feed passes the Podcast Feed Validator', () => {
  const project = { show: show(), episodes: [ep(1), ep(2, { transcript: { url: 'https://example.com/t.vtt', type: 'text/vtt' } })] };
  assert.deepEqual(lintPodcast(project), []);
  const feed = buildPodcastFeed(project, { now: new Date('2026-10-20T00:00:00Z') });
  const report = classifyFeed(parseFeed(feed));
  assert.deepEqual(report.findings, []);
  assert.equal(report.itemCount, 2);
  assert.match(feed, /<itunes:category text="Arts"><itunes:category text="Books"\/><\/itunes:category>/);
  assert.match(feed, /<podcast:guid>[0-9a-f-]{36}<\/podcast:guid>/);
  assert.match(feed, /<podcast:locked owner="ada@example.com">yes<\/podcast:locked>/);
  assert.match(feed, /<title>Night &amp; Day<\/title>/);
  assert.match(feed, /<itunes:duration>00:02:02<\/itunes:duration>/);
  assert.match(feed, /url="https:\/\/example.com\/show\/audio\/ep%201.mp3" length="1000"/);
  assert.ok(feed.indexOf('Episode 2') < feed.indexOf('Episode 1'), 'newest first');
});

test('lint names each missing piece, with a fix where there is one', () => {
  const findings = lintPodcast({ show: { ...show(), title: '', categories: ['Tech', 'Arts > Cooking'] }, episodes: [] });
  const fields = findings.map((f) => f.field);
  assert.ok(fields.includes('show.title'));
  assert.ok(fields.includes('episodes'));
  assert.equal(findings.filter((f) => f.field === 'show.categories').length, 2);
  assert.ok(findings.every((f) => f.severity === 'danger' || f.severity === 'notice'));
  assert.equal(findings[0].severity, 'danger', 'danger first');
});

test('lint catches duplicate guids, missing sizes and a bad date', () => {
  const findings = lintPodcast({ show: show(), episodes: [ep(1), ep(2, { guid: 'guid-1', bytes: 0, pubDate: 'soon' })] });
  assert.ok(findings.some((f) => /also used by episodes\[0\]/.test(f.message)));
  assert.ok(findings.some((f) => f.field === 'episodes[1].bytes'));
  assert.ok(findings.some((f) => f.field === 'episodes[1].pubDate'));
});

test('show notes with "]]>" stay inside CDATA', () => {
  const feed = buildPodcastFeed({ show: show(), episodes: [ep(1, { description: 'a ]]> b' })] });
  assert.ok(feed.includes('<![CDATA[a ]]]]><![CDATA[> b]]>'));
});

test('enclosureUrl prefers the episode url, then baseUrl + file name', () => {
  assert.equal(enclosureUrl(show(), ep(1, { url: 'https://cdn/x.mp3' })), 'https://cdn/x.mp3');
  assert.equal(enclosureUrl(show(), ep(3)), 'https://example.com/show/audio/ep%203.mp3');
  assert.equal(enclosureUrl({ ...show(), baseUrl: undefined }, ep(3)), '');
});

test('show page links the feed and carries PodcastSeries JSON-LD', () => {
  const html = buildShowPage({ show: show(), episodes: [ep(1)] });
  assert.match(html, /<link rel="alternate" type="application\/rss\+xml"/);
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(.*?)<\/script>/s)[1]);
  assert.equal(ld['@type'], 'PodcastSeries');
  assert.equal(ld.webFeed, 'https://example.com/show/feed.xml');
});
