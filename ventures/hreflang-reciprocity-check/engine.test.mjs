import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractHreflangLinks,
  validateHreflangCode,
  normalizeUrl,
  buildReport,
} from './engine.mjs';

function linkTag(hreflang, href) {
  return `<link rel="alternate" hreflang="${hreflang}" href="${href}">`;
}

function page(links, { url } = {}) {
  const head = links.map((l) => linkTag(l.hreflang, l.href)).join('\n');
  return `<!doctype html><html><head>${url ? `<link rel="canonical" href="${url}">` : ''}${head}</head><body>hi</body></html>`;
}

// --- extractHreflangLinks ---------------------------------------------------

test('extractHreflangLinks finds a well-formed tag', () => {
  const html = page([{ hreflang: 'en-US', href: 'https://example.com/en/' }]);
  const links = extractHreflangLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].hreflang, 'en-US');
  assert.equal(links[0].href, 'https://example.com/en/');
});

test('extractHreflangLinks ignores link tags that are not rel=alternate', () => {
  const html = `<link rel="stylesheet" hreflang="en" href="https://example.com/en/">`;
  assert.deepEqual(extractHreflangLinks(html), []);
});

test('extractHreflangLinks ignores alternate links with no hreflang (e.g. RSS)', () => {
  const html = `<link rel="alternate" type="application/rss+xml" href="/feed.xml">`;
  assert.deepEqual(extractHreflangLinks(html), []);
});

test('extractHreflangLinks handles attributes in any order and single quotes', () => {
  const html = `<link href='https://example.com/fr/' hreflang='fr' rel='alternate'>`;
  const links = extractHreflangLinks(html);
  assert.equal(links.length, 1);
  assert.equal(links[0].hreflang, 'fr');
});

test('extractHreflangLinks handles rel with multiple space-separated tokens', () => {
  const html = `<link rel="alternate nofollow" hreflang="de" href="https://example.com/de/">`;
  assert.equal(extractHreflangLinks(html).length, 1);
});

test('extractHreflangLinks decodes entities in href', () => {
  const html = `<link rel="alternate" hreflang="en" href="https://example.com/?a=1&amp;b=2">`;
  const links = extractHreflangLinks(html);
  assert.equal(links[0].href, 'https://example.com/?a=1&b=2');
});

test('extractHreflangLinks finds every tag, in document order, including duplicates', () => {
  const html = page([
    { hreflang: 'en', href: 'https://example.com/en/' },
    { hreflang: 'fr', href: 'https://example.com/fr/' },
    { hreflang: 'en', href: 'https://example.com/en/' },
  ]);
  const links = extractHreflangLinks(html);
  assert.equal(links.length, 3);
});

test('extractHreflangLinks returns an empty array for a page with no hreflang tags', () => {
  assert.deepEqual(extractHreflangLinks('<html><head></head><body>hi</body></html>'), []);
});

// --- validateHreflangCode ----------------------------------------------------

test('validateHreflangCode accepts a plain valid language code', () => {
  const r = validateHreflangCode('en');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, 'en');
  assert.deepEqual(r.issues, []);
});

test('validateHreflangCode accepts a valid language-region code', () => {
  const r = validateHreflangCode('en-US');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, 'en-US');
  assert.deepEqual(r.issues, []);
});

test('validateHreflangCode accepts x-default exactly', () => {
  const r = validateHreflangCode('x-default');
  assert.equal(r.valid, true);
  assert.equal(r.normalized, 'x-default');
  assert.deepEqual(r.issues, []);
});

test('validateHreflangCode flags X-DEFAULT as a case issue but still valid', () => {
  const r = validateHreflangCode('X-DEFAULT');
  assert.equal(r.valid, true);
  assert.equal(r.issues.length, 1);
  assert.equal(r.issues[0].kind, 'case');
});

test('validateHreflangCode rejects "en-uk" and names the fix (en-GB)', () => {
  const r = validateHreflangCode('en-uk');
  assert.equal(r.valid, false);
  assert.ok(r.issues.some((i) => i.kind === 'region'));
  const regionIssue = r.issues.find((i) => i.kind === 'region');
  assert.match(regionIssue.message, /GB/);
  assert.match(regionIssue.message, /en-GB/);
});

test('validateHreflangCode rejects "en-eu" with an explanation that EU is not a country code', () => {
  const r = validateHreflangCode('en-eu');
  assert.equal(r.valid, false);
  assert.match(r.issues.find((i) => i.kind === 'region').message, /not an ISO 3166-1 country code/);
});

test('validateHreflangCode rejects a made-up language code', () => {
  const r = validateHreflangCode('zz');
  assert.equal(r.valid, false);
  assert.match(r.issues.find((i) => i.kind === 'language').message, /not a recognized ISO 639-1/);
});

test('validateHreflangCode flags a case-mismatched but otherwise valid code as a notice-level issue only', () => {
  const r = validateHreflangCode('EN-us');
  assert.equal(r.valid, true, 'BCP 47 is case-insensitive; wrong casing is a style issue, not invalidity');
  const kinds = r.issues.map((i) => i.kind).sort();
  assert.deepEqual(kinds, ['case', 'case']);
});

test('validateHreflangCode rejects a real region with an invalid language', () => {
  const r = validateHreflangCode('xx-US');
  assert.equal(r.valid, false);
});

test('validateHreflangCode rejects a valid language with a garbage region', () => {
  const r = validateHreflangCode('en-ZZ');
  assert.equal(r.valid, false);
  assert.match(r.issues.find((i) => i.kind === 'region').message, /not a recognized ISO 3166-1/);
});

test('validateHreflangCode recognizes but does not validate a script subtag', () => {
  const r = validateHreflangCode('zh-Hans-CN');
  assert.equal(r.valid, true);
  assert.deepEqual(r.issues, []);
});

test('validateHreflangCode recognizes but does not validate a numeric UN M49 region', () => {
  const r = validateHreflangCode('en-419');
  assert.equal(r.valid, true);
});

test('validateHreflangCode flags an unrecognized extra subtag without failing the whole code', () => {
  const r = validateHreflangCode('en-us-toolong');
  assert.ok(r.issues.some((i) => i.kind === 'extra'));
});

test('validateHreflangCode reports a three-letter language as unsupported, not silently valid', () => {
  const r = validateHreflangCode('eng');
  assert.equal(r.valid, false);
  assert.match(r.issues[0].message, /three-letter code/);
});

test('validateHreflangCode rejects an empty string', () => {
  const r = validateHreflangCode('');
  assert.equal(r.valid, false);
});

// --- normalizeUrl ------------------------------------------------------------

test('normalizeUrl resolves a relative href against a base', () => {
  assert.equal(normalizeUrl('/fr/', 'https://example.com/en/'), 'https://example.com/fr/');
});

test('normalizeUrl strips the fragment', () => {
  assert.equal(normalizeUrl('https://example.com/en/#section'), 'https://example.com/en/');
});

test('normalizeUrl returns null for an unresolvable string', () => {
  assert.equal(normalizeUrl('not a url'), null);
});

// --- buildReport: validity + duplicates + self-reference + x-default -------

test('buildReport on a clean two-language page with reciprocal content reports ok', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const enHtml = page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: en });
  const frHtml = page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: fr });

  const report = buildReport({ url: en, html: enHtml, alternates: [{ href: fr, html: frHtml }] });
  assert.equal(report.ok, true, JSON.stringify(report.findings));
  assert.equal(report.dangerCount, 0);
  assert.equal(report.incomplete, false);
});

test('buildReport flags a missing reciprocal link', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const enHtml = page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: en });
  // fr page exists but only references itself -- no link back to en.
  const frHtml = page([{ hreflang: 'fr', href: fr }], { url: fr });

  const report = buildReport({ url: en, html: enHtml, alternates: [{ href: fr, html: frHtml }] });
  assert.equal(report.ok, false);
  const finding = report.findings.find((f) => f.id === 'missing-reciprocal-confirmation');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
  assert.equal(report.reciprocity.find((r) => r.href === fr).status, 'missing');
});

test('buildReport marks an alternate with no fetched content as unchecked, not passing', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const enHtml = page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: en });

  const report = buildReport({ url: en, html: enHtml, alternates: [] });
  assert.equal(report.incomplete, true);
  assert.equal(report.ok, false);
  assert.equal(report.reciprocity.find((r) => r.href === fr).status, 'unchecked');
  assert.ok(!report.findings.some((f) => f.id === 'missing-reciprocal-confirmation'),
    'an unchecked alternate must never be reported as a failed finding');
});

test('buildReport with no target URL cannot check self-reference and marks reciprocity unchecked', () => {
  const fr = 'https://example.com/fr/';
  const html = page([{ hreflang: 'fr', href: fr }]);
  const report = buildReport({ url: null, html });
  assert.equal(report.selfReferenceChecked, false);
  assert.ok(!report.findings.some((f) => f.id === 'missing-self-reference'));
  assert.equal(report.reciprocity[0].status, 'unchecked');
  assert.equal(report.reciprocity[0].reason, 'no-target-url');
});

test('buildReport flags a page missing its own self-reference', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const html = page([{ hreflang: 'fr', href: fr }], { url: en }); // no entry for `en` itself
  const report = buildReport({ url: en, html, alternates: [] });
  assert.ok(report.findings.some((f) => f.id === 'missing-self-reference'));
});

test('buildReport does not flag self-reference when the page lists itself', () => {
  const en = 'https://example.com/en/';
  const html = page([{ hreflang: 'en', href: en }], { url: en });
  const report = buildReport({ url: en, html, alternates: [] });
  assert.ok(!report.findings.some((f) => f.id === 'missing-self-reference'));
});

test('buildReport flags conflicting hreflang values (same code, different URLs)', () => {
  const en = 'https://example.com/en/';
  const html = page([
    { hreflang: 'en', href: en },
    { hreflang: 'en', href: 'https://example.com/en-alt/' },
  ], { url: en });
  const report = buildReport({ url: en, html });
  const finding = report.findings.find((f) => f.id === 'conflicting-hreflang');
  assert.ok(finding);
  assert.equal(finding.severity, 'danger');
});

test('buildReport flags a harmless exact duplicate as a notice, not a danger', () => {
  const en = 'https://example.com/en/';
  const html = page([{ hreflang: 'en', href: en }, { hreflang: 'en', href: en }], { url: en });
  const report = buildReport({ url: en, html });
  const finding = report.findings.find((f) => f.id === 'duplicate-hreflang');
  assert.ok(finding);
  assert.equal(finding.severity, 'notice');
  assert.ok(!report.findings.some((f) => f.id === 'conflicting-hreflang'));
});

test('buildReport flags a missing x-default when 2+ real variants exist', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const html = page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: en });
  const report = buildReport({ url: en, html, alternates: [{ href: fr, html: page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: fr }) }] });
  assert.ok(report.findings.some((f) => f.id === 'missing-x-default'));
  assert.equal(report.findings.find((f) => f.id === 'missing-x-default').severity, 'notice');
});

test('buildReport does not require x-default with only one language variant', () => {
  const en = 'https://example.com/en/';
  const html = page([{ hreflang: 'en', href: en }], { url: en });
  const report = buildReport({ url: en, html });
  assert.ok(!report.findings.some((f) => f.id === 'missing-x-default'));
});

test('buildReport does not flag missing x-default when one is already present', () => {
  const en = 'https://example.com/en/';
  const fr = 'https://example.com/fr/';
  const html = page([
    { hreflang: 'en', href: en },
    { hreflang: 'fr', href: fr },
    { hreflang: 'x-default', href: en },
  ], { url: en });
  const report = buildReport({ url: en, html, alternates: [{ href: fr, html: page([{ hreflang: 'en', href: en }, { hreflang: 'fr', href: fr }], { url: fr }) }] });
  assert.ok(!report.findings.some((f) => f.id === 'missing-x-default'));
});

test('buildReport flags an invalid hreflang code as a danger finding', () => {
  const html = page([{ hreflang: 'en-uk', href: 'https://example.com/en/' }]);
  const report = buildReport({ html });
  assert.ok(report.findings.some((f) => f.id === 'invalid-hreflang-code'));
  assert.equal(report.findings.find((f) => f.id === 'invalid-hreflang-code').severity, 'danger');
});

test('buildReport on a page with no hreflang tags at all is clean and complete', () => {
  const report = buildReport({ url: 'https://example.com/', html: '<html><body>hi</body></html>' });
  assert.equal(report.ok, true);
  assert.equal(report.incomplete, false);
  assert.deepEqual(report.findings, []);
});

test('buildReport with no html/url given does not throw', () => {
  assert.doesNotThrow(() => buildReport({}));
  assert.doesNotThrow(() => buildReport());
});

test('every finding carries the fields the CLI and browser page render', () => {
  const en = 'https://example.com/en/';
  const html = page([{ hreflang: 'en-uk', href: en }, { hreflang: 'en', href: en }, { hreflang: 'en', href: en + 'x' }]);
  const report = buildReport({ html });
  assert.ok(report.findings.length > 0);
  for (const f of report.findings) {
    assert.equal(typeof f.id, 'string');
    assert.ok(f.severity === 'danger' || f.severity === 'notice');
    assert.equal(typeof f.title, 'string');
    assert.equal(typeof f.detail, 'string');
  }
});
