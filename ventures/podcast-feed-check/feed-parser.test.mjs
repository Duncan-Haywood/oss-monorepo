import test from 'node:test';
import assert from 'node:assert/strict';
import { decodeText, extractAll, extractFirst, extractCategoryTexts, parseFeed } from './feed-parser.mjs';

test('decodeText unwraps CDATA and decodes entities', () => {
  assert.equal(decodeText('<![CDATA[Tom & Jerry]]>'), 'Tom & Jerry');
  assert.equal(decodeText('AT&amp;T &lt;show&gt;'), 'AT&T <show>');
  assert.equal(decodeText('&#65;&#x42;'), 'AB');
});

test('decodeText returns null for null/undefined', () => {
  assert.equal(decodeText(null), null);
  assert.equal(decodeText(undefined), null);
});

test('extractFirst finds a simple element and its text', () => {
  const xml = '<channel><title>My Show</title></channel>';
  assert.equal(extractFirst(xml, 'title').text, 'My Show');
});

test('extractAll finds a self-closing element and its attributes', () => {
  const xml = '<itunes:image href="https://example.com/art.jpg"/>';
  const all = extractAll(xml, 'itunes:image');
  assert.equal(all.length, 1);
  assert.equal(all[0].attrs.href, 'https://example.com/art.jpg');
});

test('extractCategoryTexts finds a nested subcategory (Apple\'s documented category syntax)', () => {
  const xml = '<itunes:category text="Society &amp; Culture"><itunes:category text="Documentary"/></itunes:category>';
  const texts = extractCategoryTexts(xml);
  assert.deepEqual(texts, ['Society & Culture', 'Documentary']);
});

test('extractCategoryTexts finds multiple independent top-level categories', () => {
  const xml = '<itunes:category text="Technology"/><itunes:category text="Business"/>';
  assert.deepEqual(extractCategoryTexts(xml), ['Technology', 'Business']);
});

const SAMPLE_FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>Example Podcast</title>
  <description>A show about examples.</description>
  <language>en-us</language>
  <link>https://example.com</link>
  <atom:link href="https://example.com/feed.xml" rel="self" type="application/rss+xml"/>
  <itunes:image href="https://example.com/art.png"/>
  <itunes:category text="Technology"/>
  <itunes:explicit>false</itunes:explicit>
  <itunes:owner><itunes:email>owner@example.com</itunes:email></itunes:owner>
  <item>
    <title>Episode 1</title>
    <guid isPermaLink="false">ep-1-uuid</guid>
    <pubDate>Wed, 02 Oct 2024 15:00:00 GMT</pubDate>
    <enclosure url="https://example.com/ep1.mp3" type="audio/mpeg" length="1000000"/>
    <itunes:episodeType>full</itunes:episodeType>
  </item>
  <item>
    <title>Episode 2</title>
    <guid>https://example.com/ep2</guid>
    <pubDate>Wed, 09 Oct 2024 15:00:00 GMT</pubDate>
    <enclosure url="https://example.com/ep2.mp3" type="audio/mpeg" length="1100000"/>
  </item>
</channel>
</rss>`;

test('parseFeed reads channel-level fields correctly', () => {
  const { channel, parseErrors } = parseFeed(SAMPLE_FEED);
  assert.deepEqual(parseErrors, []);
  assert.equal(channel.title, 'Example Podcast');
  assert.equal(channel.description, 'A show about examples.');
  assert.equal(channel.language, 'en-us');
  assert.equal(channel.link, 'https://example.com');
  assert.equal(channel.atomSelfLink, 'https://example.com/feed.xml');
  assert.equal(channel.itunesImage, 'https://example.com/art.png');
  assert.deepEqual(channel.itunesCategories, ['Technology']);
  assert.equal(channel.itunesExplicit, 'false');
  assert.equal(channel.itunesOwnerEmail, 'owner@example.com');
});

test('parseFeed does not leak item-level <title> into the channel title', () => {
  const { channel } = parseFeed(SAMPLE_FEED);
  assert.equal(channel.title, 'Example Podcast', 'must not pick up the first item\'s title instead');
});

test('parseFeed reads item-level fields correctly, in order', () => {
  const { items } = parseFeed(SAMPLE_FEED);
  assert.equal(items.length, 2);
  assert.equal(items[0].title, 'Episode 1');
  assert.equal(items[0].guid.value, 'ep-1-uuid');
  assert.equal(items[0].guid.isPermaLink, false);
  assert.equal(items[0].enclosure.url, 'https://example.com/ep1.mp3');
  assert.equal(items[0].enclosure.type, 'audio/mpeg');
  assert.equal(items[0].itunesEpisodeType, 'full');
  assert.equal(items[1].title, 'Episode 2');
  assert.equal(items[1].guid.isPermaLink, true, 'isPermaLink defaults to true when omitted');
});

test('parseFeed reports a parse error for XML with no <channel>', () => {
  const { channel, items, parseErrors } = parseFeed('<rss version="2.0"></rss>');
  assert.equal(channel, null);
  assert.deepEqual(items, []);
  assert.ok(parseErrors.length > 0);
});

test('parseFeed never throws on garbage input', () => {
  assert.doesNotThrow(() => parseFeed('not xml at all { }'));
  assert.doesNotThrow(() => parseFeed(''));
  assert.doesNotThrow(() => parseFeed(null));
});

test('parseFeed falls back to itunes:summary when <description> is absent', () => {
  const xml = `<rss><channel><title>T</title><itunes:summary>Summary text</itunes:summary></channel></rss>`;
  const { channel } = parseFeed(xml);
  assert.equal(channel.description, 'Summary text');
});
