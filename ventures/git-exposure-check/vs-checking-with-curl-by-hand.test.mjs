import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-with-curl-by-hand.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its curl-by-hand comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-checking-with-curl-by-hand\.html/);
  assert.match(sitemap, /vs-checking-with-curl-by-hand\.html/);
});

test('the vs-checking-with-curl-by-hand page names no competing product and carries the standard disclaimer', () => {
  assert.match(page, /<title>Git Exposure Checker vs\. checking with curl by hand/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":"FAQPage"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

// Generic-method comparison (curl by hand), not a named product -- see
// platform/pages/clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT, which this
// page's path is added to in the same commit.
test('the vs-checking-with-curl-by-hand page never claims a network call, matching every other static page on this site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-checking-with-curl-by-hand page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(page, /recordUsage/);
});

test('the vs-checking-with-curl-by-hand page is structured for a reader and a crawler', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-checking-with-curl-by-hand page is valid JSON', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const match = page.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

// Prose and classification logic drift apart silently, so the page's central
// claim -- that a real exposure and a soft-404 page return the same status
// but different verdicts -- is recomputed here from analyze.mjs directly,
// rather than asserted by eye.
test('the three-row comparison table matches buildReport on the stated scenarios', async () => {
  const { buildReport } = await import('./analyze.mjs');

  const softNotFoundBody = '<html><head><title>Page Not Found</title></head><body>Sorry, that page could not be found.</body></html>';
  const soft404 = buildReport('https://example.com/', {
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: softNotFoundBody, truncated: false, error: null },
    config: { ok: true, status: 200, url: 'https://example.com/.git/config', bodySample: softNotFoundBody, truncated: false, error: null },
  });
  assert.equal(soft404.dangerCount, 0);
  assert.equal(soft404.ok, true);

  const realExposure = buildReport('https://staging.example.com/', {
    head: { ok: true, status: 200, url: 'https://staging.example.com/.git/HEAD', bodySample: 'ref: refs/heads/main\n', truncated: false, error: null },
    config: { ok: true, status: 200, url: 'https://staging.example.com/.git/config', bodySample: '[core]\n\trepositoryformatversion = 0\n', truncated: false, error: null },
  });
  assert.equal(realExposure.dangerCount, 1);
  assert.equal(realExposure.ok, false);

  const protectedSite = buildReport('https://protected.example.com/', {
    head: { ok: true, status: 404, url: 'https://protected.example.com/.git/HEAD', bodySample: 'Not Found', truncated: false, error: null },
    config: { ok: true, status: 404, url: 'https://protected.example.com/.git/config', bodySample: 'Not Found', truncated: false, error: null },
  });
  assert.equal(protectedSite.dangerCount, 0);
  assert.equal(protectedSite.ok, true);

  // Real exposure and soft-404 both carry HTTP status 200 -- the page's
  // central claim that status alone cannot distinguish them.
  assert.equal(realExposure.head.status, soft404.head.status);
  // Yet the checker's own verdict differs between the two.
  assert.notEqual(realExposure.ok, soft404.ok);
});
