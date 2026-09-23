import test from 'node:test';
import assert from 'node:assert/strict';
import { runCheck } from './check.mjs';

const VALID_FEED_XML = `<rss><channel>
  <title>T</title><description>D</description><language>en-us</language><link>https://example.com</link>
  <itunes:image href="https://example.com/a.png"/>
  <itunes:category text="Technology"/>
  <itunes:explicit>false</itunes:explicit>
  <item>
    <title>E1</title>
    <guid isPermaLink="false">g1</guid>
    <pubDate>Wed, 02 Oct 2024 15:00:00 GMT</pubDate>
    <enclosure url="https://example.com/e1.mp3" type="audio/mpeg" length="1"/>
  </item>
</channel></rss>`;

function fakeFetch(result) {
  return async () => result;
}

test('runCheck reports ok for a clean feed', async () => {
  const result = await runCheck('https://example.com/feed.xml', {
    fetchFeedXmlFn: fakeFetch({ ok: true, status: 200, body: VALID_FEED_XML, error: null }),
  });
  assert.equal(result.report.ok, true);
  assert.equal(result.report.dangerCount, 0);
});

test('runCheck surfaces a fetch failure as a single danger finding, without parsing', async () => {
  const result = await runCheck('https://example.com/feed.xml', {
    fetchFeedXmlFn: fakeFetch({ ok: false, status: null, body: null, error: 'timed out' }),
  });
  assert.equal(result.report.ok, false);
  assert.equal(result.report.findings.length, 1);
  assert.equal(result.report.findings[0].id, 'fetch-failed');
  assert.equal(result.feed, null);
});

test('runCheck classifies a fetched feed with a missing field', async () => {
  const brokenFeed = VALID_FEED_XML.replace('<language>en-us</language>', '');
  const result = await runCheck('https://example.com/feed.xml', {
    fetchFeedXmlFn: fakeFetch({ ok: true, status: 200, body: brokenFeed, error: null }),
  });
  assert.ok(result.report.findings.some((f) => f.id === 'missing-channel-language'));
  assert.equal(result.report.ok, false);
});
