import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyFeed, APPLE_TOP_LEVEL_CATEGORIES } from './engine.mjs';

function validChannel(overrides = {}) {
  return {
    title: 'Example Podcast',
    description: 'A show about examples.',
    language: 'en-us',
    link: 'https://example.com',
    itunesCategories: ['Technology'],
    itunesExplicit: 'false',
    itunesImage: 'https://example.com/art.png',
    atomSelfLink: 'https://example.com/feed.xml',
    itunesOwnerEmail: 'owner@example.com',
    ...overrides,
  };
}

function validItem(overrides = {}) {
  return {
    title: 'Episode 1',
    guid: { value: 'https://example.com/ep1', isPermaLink: true },
    pubDate: 'Wed, 02 Oct 2024 15:00:00 GMT',
    enclosure: { url: 'https://example.com/ep1.mp3', type: 'audio/mpeg', length: '1000000' },
    itunesDuration: '30:00',
    itunesEpisodeType: 'full',
    ...overrides,
  };
}

test('a fully valid feed has zero findings', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem()], parseErrors: [] });
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.deepEqual(report.findings, []);
});

test('parse errors short-circuit into danger findings', () => {
  const report = classifyFeed({ channel: null, items: [], parseErrors: ['No <channel> element found.'] });
  assert.equal(report.ok, false);
  assert.equal(report.findings[0].id, 'unparseable-feed');
});

test('flags every missing required channel field', () => {
  const report = classifyFeed({
    channel: validChannel({ title: null, description: null, language: null, link: null, itunesImage: null, itunesCategories: [], itunesExplicit: null }),
    items: [validItem()],
    parseErrors: [],
  });
  const ids = report.findings.map((f) => f.id);
  assert.ok(ids.includes('missing-channel-title'));
  assert.ok(ids.includes('missing-channel-description'));
  assert.ok(ids.includes('missing-channel-language'));
  assert.ok(ids.includes('missing-channel-link'));
  assert.ok(ids.includes('missing-itunes-image'));
  assert.ok(ids.includes('missing-itunes-category'));
  assert.ok(ids.includes('missing-itunes-explicit'));
  assert.equal(report.ok, false);
});

test('flags an itunes:category not on Apple\'s documented list, as a notice', () => {
  const report = classifyFeed({ channel: validChannel({ itunesCategories: ['Not A Real Category'] }), items: [validItem()], parseErrors: [] });
  const f = report.findings.find((x) => x.id === 'unrecognized-itunes-category');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('every category in the hardcoded list is accepted (sanity: no self-contradiction)', () => {
  for (const cat of APPLE_TOP_LEVEL_CATEGORIES) {
    const report = classifyFeed({ channel: validChannel({ itunesCategories: [cat] }), items: [validItem()], parseErrors: [] });
    assert.ok(!report.findings.some((f) => f.id === 'unrecognized-itunes-category'), `${cat} should be recognized`);
  }
});

test('flags a deprecated itunes:explicit value as a notice, an unrecognized one as a danger', () => {
  const deprecated = classifyFeed({ channel: validChannel({ itunesExplicit: 'yes' }), items: [validItem()], parseErrors: [] });
  const dep = deprecated.findings.find((f) => f.id === 'deprecated-itunes-explicit-value');
  assert.ok(dep);
  assert.equal(dep.severity, 'notice');

  const invalid = classifyFeed({ channel: validChannel({ itunesExplicit: 'maybe' }), items: [validItem()], parseErrors: [] });
  const inv = invalid.findings.find((f) => f.id === 'invalid-itunes-explicit-value');
  assert.ok(inv);
  assert.equal(inv.severity, 'danger');
});

test('itunes:explicit is case-insensitive', () => {
  const report = classifyFeed({ channel: validChannel({ itunesExplicit: 'FALSE' }), items: [validItem()], parseErrors: [] });
  assert.ok(!report.findings.some((f) => f.id.includes('explicit')));
});

test('flags a missing atom:link rel=self and owner email as notices only', () => {
  const report = classifyFeed({ channel: validChannel({ atomSelfLink: null, itunesOwnerEmail: null }), items: [validItem()], parseErrors: [] });
  const self = report.findings.find((f) => f.id === 'missing-atom-self-link');
  const owner = report.findings.find((f) => f.id === 'missing-itunes-owner-email');
  assert.ok(self && self.severity === 'notice');
  assert.ok(owner && owner.severity === 'notice');
  assert.equal(report.ok, true, 'notices alone must not fail the check');
});

test('flags a feed with zero items', () => {
  const report = classifyFeed({ channel: validChannel(), items: [], parseErrors: [] });
  assert.ok(report.findings.some((f) => f.id === 'no-items'));
  assert.equal(report.ok, false);
});

test('flags an item missing title, enclosure, and pubDate', () => {
  const report = classifyFeed({
    channel: validChannel(),
    items: [validItem({ title: null, enclosure: null, pubDate: null })],
    parseErrors: [],
  });
  const ids = report.findings.map((f) => f.id);
  assert.ok(ids.includes('item-missing-title'));
  assert.ok(ids.includes('item-missing-enclosure'));
  assert.ok(ids.includes('item-missing-pubdate'));
});

test('flags an enclosure missing its type attribute, and an unrecognized type as a notice', () => {
  const missingType = classifyFeed({ channel: validChannel(), items: [validItem({ enclosure: { url: 'https://example.com/e.mp3', type: null, length: '1' } })], parseErrors: [] });
  assert.ok(missingType.findings.some((f) => f.id === 'item-enclosure-missing-type'));

  const weirdType = classifyFeed({ channel: validChannel(), items: [validItem({ enclosure: { url: 'https://example.com/e.mp3', type: 'application/x-weird', length: '1' } })], parseErrors: [] });
  const f = weirdType.findings.find((x) => x.id === 'item-enclosure-unrecognized-type');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('flags a zero-length enclosure as a notice, not a danger', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem({ enclosure: { url: 'https://example.com/e.mp3', type: 'audio/mpeg', length: '0' } })], parseErrors: [] });
  const f = report.findings.find((x) => x.id === 'item-enclosure-zero-length');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('accepts a valid RFC 822 pubDate and rejects an ISO date', () => {
  const valid = classifyFeed({ channel: validChannel(), items: [validItem({ pubDate: 'Wed, 02 Oct 2024 15:00:00 +0000' })], parseErrors: [] });
  assert.ok(!valid.findings.some((f) => f.id === 'item-invalid-pubdate-format'));

  const iso = classifyFeed({ channel: validChannel(), items: [validItem({ pubDate: '2024-10-02T15:00:00Z' })], parseErrors: [] });
  const f = iso.findings.find((x) => x.id === 'item-invalid-pubdate-format');
  assert.ok(f, 'an ISO 8601 date is not valid RFC 822 and must be flagged');
  assert.equal(f.severity, 'danger');
});

test('flags duplicate guids across items, naming both episode numbers', () => {
  const report = classifyFeed({
    channel: validChannel(),
    items: [
      validItem({ title: 'Ep 1', guid: { value: 'same-guid', isPermaLink: false } }),
      validItem({ title: 'Ep 2', guid: { value: 'same-guid', isPermaLink: false } }),
    ],
    parseErrors: [],
  });
  const f = report.findings.find((x) => x.id === 'duplicate-guid');
  assert.ok(f);
  assert.match(f.title, /episodes 1, 2/);
});

test('does not flag distinct guids as duplicates', () => {
  const report = classifyFeed({
    channel: validChannel(),
    items: [validItem({ guid: { value: 'a', isPermaLink: false } }), validItem({ guid: { value: 'b', isPermaLink: false } })],
    parseErrors: [],
  });
  assert.ok(!report.findings.some((f) => f.id === 'duplicate-guid'));
});

test('flags a permalink guid that is not an absolute URL', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem({ guid: { value: 'not-a-url-123', isPermaLink: true } })], parseErrors: [] });
  const f = report.findings.find((x) => x.id === 'item-guid-permalink-not-url');
  assert.ok(f);
});

test('does not flag a non-permalink guid that is not a URL', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem({ guid: { value: 'ep-123-uuid', isPermaLink: false } })], parseErrors: [] });
  assert.ok(!report.findings.some((f) => f.id === 'item-guid-permalink-not-url'));
});

test('flags an invalid itunes:episodeType', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem({ itunesEpisodeType: 'special' })], parseErrors: [] });
  assert.ok(report.findings.some((f) => f.id === 'item-invalid-episode-type'));
});

test('itemCount reflects the number of items regardless of findings', () => {
  const report = classifyFeed({ channel: validChannel(), items: [validItem(), validItem()], parseErrors: [] });
  assert.equal(report.itemCount, 2);
});
