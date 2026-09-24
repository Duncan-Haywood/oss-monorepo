import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-eyeballing-two-ci-logs-by-hand.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
});

test('names no vendor or competing platform in its own title or comparison', () => {
  // This page compares against a generic manual habit (eyeballing two CI
  // console logs), not a named product, so it is listed in
  // platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT rather than
  // carrying a "not affiliated" clause -- there is no company to disclaim a
  // relationship with. Same discipline as source-map-leak-check's
  // vs-checking-devtools-by-hand.html. The "More:" footnote legitimately
  // cross-links to this venture's own vs-buildpulse.html sibling page, so
  // the check is scoped to the title and the h1/comparison body rather than
  // the whole document.
  assert.doesNotMatch(html, /<title>[^<]*BuildPulse/i);
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /BuildPulse/i);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-eyeballing-two-ci-logs-by-hand\.html">/);
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

test('the worked example matches classifyRuns/summarizeRuns on the actual reports described', async () => {
  const { classifyRuns, summarizeRuns } = await import('./classify.mjs');

  const run1 = `<?xml version="1.0"?>
<testsuite name="suite" tests="4">
  <testcase classname="tests.checkout" name="test_login"></testcase>
  <testcase classname="tests.checkout" name="test_checkout"><failure message="AssertionError: cart total mismatch"/></testcase>
  <testcase classname="tests.checkout" name="test_export"><failure message="TimeoutError: export never completed"/></testcase>
  <testcase classname="tests.checkout" name="test_search"></testcase>
</testsuite>`;

  const run2 = `<?xml version="1.0"?>
<testsuite name="suite" tests="2">
  <testcase classname="tests.checkout" name="test_checkout"></testcase>
  <testcase classname="tests.checkout" name="test_export"><failure message="TimeoutError: export never completed"/></testcase>
</testsuite>`;

  const rows = classifyRuns([
    { label: 'run 1 (full suite)', xml: run1 },
    { label: 'run 2 (--lf rerun)', xml: run2 },
  ]);

  const checkout = rows.find((r) => r.name === 'test_checkout');
  const exportTest = rows.find((r) => r.name === 'test_export');
  assert.equal(checkout.verdict, 'flaky');
  assert.equal(checkout.passed, 1);
  assert.equal(checkout.failed, 1);
  assert.equal(exportTest.verdict, 'broken');
  assert.equal(exportTest.passed, 0);
  assert.equal(exportTest.failed, 2);

  const summary = summarizeRuns(rows, 2);
  assert.equal(summary.status, 'flaky');
  assert.equal(summary.text, '1 of 4 test(s) flipped between pass and fail — that is flakiness, not a real regression by itself.');

  assert.match(html, /test_checkout/);
  assert.match(html, /test_export/);
  assert.match(html, /1 pass, 1 fail/);
  assert.match(html, /2 fails, 0 passes/);
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="vs-eyeballing-two-ci-logs-by-hand\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-eyeballing-two-ci-logs-by-hand\.html/);
});

test('the comparison page links back to the tool and to the flaky-causes guide', () => {
  assert.match(html, /href="\.\/">/);
  assert.match(html, /href="why-are-my-tests-flaky-in-ci\.html"/);
});
