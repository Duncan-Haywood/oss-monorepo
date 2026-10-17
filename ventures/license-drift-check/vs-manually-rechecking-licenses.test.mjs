import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-manually-rechecking-licenses.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing platform in its own title or comparison', () => {
  // This page compares against a generic manual habit (re-checking each
  // dependency's license by hand), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. The "More:" footnote legitimately cross-links to this
  // venture's own vs-fossa.html sibling page, so the check is scoped to the
  // title and the h1/comparison body rather than the whole document.
  assert.doesNotMatch(html, /<title>[^<]*FOSSA/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /FOSSA/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-manually-rechecking-licenses\.html">/);
});

test('the FAQPage schema is valid JSON and matches the visible FAQ headings', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
  }
});

test('the worked example matches parseSnapshot/diffSnapshots on the actual snapshots described', async () => {
  const { parseSnapshot, diffSnapshots, classifyLicenseFamily } = await import('./engine.mjs');

  const baseline = parseSnapshot(JSON.stringify([
    { name: 'left-pad', version: '1.3.0', license: 'MIT' },
    { name: 'infra-tool', version: '1.9.0', license: 'MPL-2.0' },
    { name: 'stable-lib', version: '2.1.0', license: 'Apache-2.0' },
  ]));
  const current = parseSnapshot(JSON.stringify([
    { name: 'left-pad', version: '1.3.0', license: 'MIT' },
    { name: 'infra-tool', version: '2.0.0', license: 'BUSL-1.1' },
    { name: 'stable-lib', version: '2.2.0', license: 'Apache-2.0' },
  ]));

  const result = diffSnapshots(baseline, current);
  assert.equal(result.changed.length, 1);
  assert.equal(result.changed[0].name, 'infra-tool');
  assert.equal(result.changed[0].beforeLicense, 'MPL-2.0');
  assert.equal(result.changed[0].afterLicense, 'BUSL-1.1');
  assert.equal(classifyLicenseFamily(result.changed[0].beforeLicense), 'copyleft');
  assert.equal(classifyLicenseFamily(result.changed[0].afterLicense), 'source-available');
  assert.equal(result.unchanged, 2);

  assert.match(html, /infra-tool/);
  assert.match(html, /stable-lib/);
  assert.match(html, /MPL-2\.0/);
  assert.match(html, /BUSL-1\.1/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-manually-rechecking-licenses\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-manually-rechecking-licenses\.html/);
});

test('the comparison page links back to the tool, the guide, and vs-fossa', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="how-a-dependency-license-change-reaches-your-lockfile\.html"/);
  assert.match(html, /href="vs-fossa\.html"/);
});
