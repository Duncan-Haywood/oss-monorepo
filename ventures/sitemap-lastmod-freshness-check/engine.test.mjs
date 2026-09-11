import test from 'node:test';
import assert from 'node:assert/strict';

import {
  decodeEntities,
  parseSitemap,
  validateLastmod,
  classifyEntries,
  buildReport,
} from './engine.mjs';

// --- decodeEntities ----------------------------------------------------

test('decodeEntities handles named and numeric entities', () => {
  assert.equal(decodeEntities('a &amp; b'), 'a & b');
  assert.equal(decodeEntities('&lt;tag&gt;'), '<tag>');
  assert.equal(decodeEntities('&#65;&#x42;'), 'AB');
  assert.equal(decodeEntities('no entities here'), 'no entities here');
});

test('decodeEntities leaves an unknown entity and an invalid surrogate alone', () => {
  assert.equal(decodeEntities('&unknownEntity;'), '&unknownEntity;');
  assert.equal(decodeEntities('&#xD800;'), '&#xD800;'); // lone surrogate, rejected
});

// --- parseSitemap --------------------------------------------------------

test('parseSitemap extracts loc/lastmod pairs from a urlset', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://example.com/a</loc><lastmod>2026-01-01</lastmod></url>
  <url><loc>https://example.com/b</loc><lastmod>2026-01-02T10:00:00Z</lastmod></url>
  <url><loc>https://example.com/c</loc></url>
</urlset>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.kind, 'urlset');
  assert.equal(parsed.parseError, null);
  assert.equal(parsed.entries.length, 3);
  assert.equal(parsed.entries[0].loc, 'https://example.com/a');
  assert.equal(parsed.entries[0].lastmodRaw, '2026-01-01');
  assert.equal(parsed.entries[2].lastmodRaw, null);
});

test('parseSitemap extracts loc/lastmod pairs from a sitemapindex', () => {
  const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://example.com/sitemap-a.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
  <sitemap><loc>https://example.com/sitemap-b.xml</loc><lastmod>2026-01-01</lastmod></sitemap>
</sitemapindex>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.kind, 'sitemapindex');
  assert.equal(parsed.entries.length, 2);
});

test('parseSitemap decodes entities in loc and lastmod text', () => {
  const xml = `<urlset><url><loc>https://example.com/a?x=1&amp;y=2</loc><lastmod>2026-01-01</lastmod></url></urlset>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.entries[0].loc, 'https://example.com/a?x=1&y=2');
});

test('parseSitemap reports a parse error for a document with no recognized root', () => {
  const parsed = parseSitemap('<not-a-sitemap><foo>bar</foo></not-a-sitemap>');
  assert.equal(parsed.kind, null);
  assert.match(parsed.parseError, /No <urlset> or <sitemapindex>/);
  assert.deepEqual(parsed.entries, []);
});

test('parseSitemap on empty/garbage input reports a parse error rather than throwing', () => {
  assert.doesNotThrow(() => parseSitemap(''));
  assert.doesNotThrow(() => parseSitemap(null));
  assert.doesNotThrow(() => parseSitemap('not xml at all'));
  assert.equal(parseSitemap('').kind, null);
});

test('parseSitemap skips a <url> entry with no <loc>', () => {
  const xml = `<urlset><url><lastmod>2026-01-01</lastmod></url><url><loc>https://example.com/a</loc></url></urlset>`;
  const parsed = parseSitemap(xml);
  assert.equal(parsed.entries.length, 1);
  assert.equal(parsed.entries[0].loc, 'https://example.com/a');
});

// --- validateLastmod -------------------------------------------------------

test('validateLastmod: empty/missing value is "present: false", not invalid', () => {
  const r = validateLastmod(null);
  assert.equal(r.present, false);
  assert.equal(r.valid, null);
  assert.equal(r.date, null);
});

test('validateLastmod: bare date is valid', () => {
  const r = validateLastmod('2026-03-15');
  assert.equal(r.present, true);
  assert.equal(r.valid, true);
  assert.equal(r.date.toISOString(), '2026-03-15T00:00:00.000Z');
});

test('validateLastmod: full datetime with Z is valid', () => {
  const r = validateLastmod('2026-03-15T08:30:00Z');
  assert.equal(r.valid, true);
  assert.equal(r.date.toISOString(), '2026-03-15T08:30:00.000Z');
});

test('validateLastmod: full datetime with a numeric offset applies it correctly', () => {
  const r = validateLastmod('2026-03-15T08:30:00-05:00');
  assert.equal(r.valid, true);
  assert.equal(r.date.toISOString(), '2026-03-15T13:30:00.000Z');
});

test('validateLastmod: datetime with seconds and fractional seconds', () => {
  const r = validateLastmod('2026-03-15T08:30:45.123Z');
  assert.equal(r.valid, true);
  assert.equal(r.date.getUTCSeconds(), 45);
});

test('validateLastmod: a bare time with no timezone is invalid per the protocol', () => {
  const r = validateLastmod('2026-03-15T08:30:00');
  assert.equal(r.valid, false);
  assert.match(r.issues[0].message, /not a valid W3C Datetime/);
});

test('validateLastmod: a slash-separated date is invalid', () => {
  const r = validateLastmod('03/15/2026');
  assert.equal(r.valid, false);
});

test('validateLastmod: a two-digit year is invalid', () => {
  const r = validateLastmod('26-03-15');
  assert.equal(r.valid, false);
});

test('validateLastmod: an impossible month is invalid despite matching the format regex', () => {
  const r = validateLastmod('2026-13-01');
  assert.equal(r.valid, false);
  assert.match(r.issues[0].message, /month 13/);
});

test('validateLastmod: an impossible day for its month is invalid (not silently rolled over)', () => {
  const r = validateLastmod('2026-02-30');
  assert.equal(r.valid, false);
  assert.match(r.issues[0].message, /day 30/);
});

test('validateLastmod: Feb 29 is valid in a leap year and invalid otherwise', () => {
  assert.equal(validateLastmod('2024-02-29').valid, true); // 2024 is a leap year
  assert.equal(validateLastmod('2026-02-29').valid, false); // 2026 is not
});

test('validateLastmod: an impossible hour/minute/second is invalid', () => {
  assert.equal(validateLastmod('2026-03-15T24:00:00Z').valid, false);
  assert.equal(validateLastmod('2026-03-15T10:60:00Z').valid, false);
  assert.equal(validateLastmod('2026-03-15T10:00:61Z').valid, false);
});

// --- classifyEntries -------------------------------------------------------

const NOW = new Date('2026-06-15T00:00:00Z');

test('classifyEntries: clean input with no lastmod claims is ok (nothing to be wrong about)', () => {
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: null }], { now: NOW });
  assert.equal(report.dangerCount, 0);
  assert.equal(report.uncheckedCount, 0); // no claim, so nothing pending verification either
  assert.equal(report.ok, true);
});

test('classifyEntries: invalid format is a danger finding', () => {
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: 'not-a-date' }], { now: NOW });
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].id, 'invalid-lastmod-format');
});

test('classifyEntries: future-dated lastmod is a danger finding', () => {
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2030-01-01' }], { now: NOW });
  assert.ok(report.findings.some((f) => f.id === 'future-dated-lastmod' && f.severity === 'danger'));
});

test('classifyEntries: a lastmod a few hours ahead is within the clock-skew tolerance', () => {
  const now = new Date('2026-06-15T20:00:00Z');
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-06-16T02:00:00Z' }], { now });
  assert.equal(report.findings.filter((f) => f.id === 'future-dated-lastmod').length, 0);
});

test('classifyEntries: duplicate loc with identical lastmod is a notice, not a danger', () => {
  const entries = [
    { loc: 'https://example.com/a', lastmodRaw: '2026-01-01' },
    { loc: 'https://example.com/a', lastmodRaw: '2026-01-01' },
  ];
  const report = classifyEntries(entries, { now: NOW });
  const f = report.findings.find((x) => x.id === 'duplicate-loc');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('classifyEntries: duplicate loc with conflicting lastmod is a danger', () => {
  const entries = [
    { loc: 'https://example.com/a', lastmodRaw: '2026-01-01' },
    { loc: 'https://example.com/a', lastmodRaw: '2026-01-02' },
  ];
  const report = classifyEntries(entries, { now: NOW });
  const f = report.findings.find((x) => x.id === 'duplicate-loc-conflicting-lastmod');
  assert.ok(f);
  assert.equal(f.severity, 'danger');
});

function makeUniformEntries(count, date) {
  return Array.from({ length: count }, (_, i) => ({ loc: `https://example.com/${i}`, lastmodRaw: date }));
}

test('classifyEntries: flags a uniform lastmod pattern above the threshold', () => {
  const entries = makeUniformEntries(10, '2026-06-14');
  const report = classifyEntries(entries, { now: NOW, uniformMinCount: 5, uniformThreshold: 0.9 });
  const f = report.findings.find((x) => x.id === 'uniform-lastmod-pattern');
  assert.ok(f, 'expected uniform-lastmod-pattern finding');
  assert.equal(f.severity, 'notice');
  assert.equal(f.count, 10);
});

test('classifyEntries: does not flag a uniform pattern below uniformMinCount', () => {
  const entries = makeUniformEntries(3, '2026-06-14');
  const report = classifyEntries(entries, { now: NOW, uniformMinCount: 5, uniformThreshold: 0.9 });
  assert.equal(report.findings.filter((f) => f.id === 'uniform-lastmod-pattern').length, 0);
});

test('classifyEntries: does not flag a healthy spread of distinct dates', () => {
  const entries = [
    { loc: 'https://example.com/a', lastmodRaw: '2026-01-01' },
    { loc: 'https://example.com/b', lastmodRaw: '2026-02-15' },
    { loc: 'https://example.com/c', lastmodRaw: '2026-03-20' },
    { loc: 'https://example.com/d', lastmodRaw: '2026-04-10' },
    { loc: 'https://example.com/e', lastmodRaw: '2026-05-05' },
    { loc: 'https://example.com/f', lastmodRaw: '2026-06-01' },
  ];
  const report = classifyEntries(entries, { now: NOW, uniformMinCount: 5, uniformThreshold: 0.9 });
  assert.equal(report.findings.filter((f) => f.id === 'uniform-lastmod-pattern').length, 0);
});

test('classifyEntries: an entry with no live result is unverified (uncheckedCount, incomplete)', () => {
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-01-01' }], { now: NOW });
  assert.equal(report.uncheckedCount, 1);
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
});

test('classifyEntries: server Last-Modified confirms the sitemap claim -> no finding, verified', () => {
  const liveResults = new Map([
    ['https://example.com/a', { ok: true, lastModified: new Date('2026-01-01T00:00:00Z') }],
  ]);
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-01-01' }], { now: NOW, liveResults });
  assert.equal(report.uncheckedCount, 0);
  assert.equal(report.findings.filter((f) => f.id === 'lastmod-not-confirmed-by-server').length, 0);
  assert.equal(report.ok, true);
});

test('classifyEntries: server Last-Modified earlier than the sitemap claim is a notice finding', () => {
  const liveResults = new Map([
    ['https://example.com/a', { ok: true, lastModified: new Date('2025-01-01T00:00:00Z') }],
  ]);
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-01-01' }], { now: NOW, liveResults });
  const f = report.findings.find((x) => x.id === 'lastmod-not-confirmed-by-server');
  assert.ok(f);
  assert.equal(f.severity, 'notice');
});

test('classifyEntries: a live result with no Last-Modified header is unverified, not a finding', () => {
  const liveResults = new Map([['https://example.com/a', { ok: true, lastModified: null }]]);
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-01-01' }], { now: NOW, liveResults });
  assert.equal(report.uncheckedCount, 1);
  assert.equal(report.findings.filter((f) => f.id === 'lastmod-not-confirmed-by-server').length, 0);
});

test('classifyEntries: a live fetch failure is unverified, not a finding', () => {
  const liveResults = new Map([['https://example.com/a', { ok: false, lastModified: null }]]);
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: '2026-01-01' }], { now: NOW, liveResults });
  assert.equal(report.uncheckedCount, 1);
});

test('classifyEntries: an invalid lastmod is never sent to the live cross-check (nothing valid to confirm)', () => {
  const liveResults = new Map([['https://example.com/a', { ok: true, lastModified: new Date('2026-01-01') }]]);
  const report = classifyEntries([{ loc: 'https://example.com/a', lastmodRaw: 'garbage' }], { now: NOW, liveResults });
  assert.equal(report.uncheckedCount, 0); // no valid claim means nothing pending, not "unverified"
  assert.equal(report.dangerCount, 1); // still flagged as invalid format
});

// --- buildReport -------------------------------------------------------

test('buildReport: a parse error is reported as incomplete/not-ok with parseError set', () => {
  const report = buildReport({ xml: 'nonsense' });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
  assert.match(report.parseError, /No <urlset>/);
});

test('buildReport: parses and classifies in one call', () => {
  const xml = `<urlset><url><loc>https://example.com/a</loc><lastmod>2099-01-01</lastmod></url></urlset>`;
  const report = buildReport({ xml, now: NOW });
  assert.equal(report.parseError, null);
  assert.equal(report.kind, 'urlset');
  assert.ok(report.findings.some((f) => f.id === 'future-dated-lastmod'));
});
