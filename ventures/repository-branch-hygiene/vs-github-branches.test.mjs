import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-github-branches.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty and no-SLA disclaimers', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal, security, or compliance advice/i);
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with GitHub', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by GitHub, Inc\. or Microsoft/);
});

test('no unverifiable price is claimed for GitHub', () => {
  // GitHub's pricing page is not reachable from this session (network egress
  // here is proxied and does not permit fetching arbitrary vendor sites), so
  // no plan name or dollar figure could be confirmed against a primary
  // source -- the same discipline every other vs-* page in this repo uses.
  // Only well-documented, non-numeric behaviour of the Branches page is
  // stated, and no dollar amount appears anywhere on the page.
  assert.doesNotMatch(html, /\$\d/);
});

test('does not claim the tool can delete or reach a repository', () => {
  // The whole product promise is that it is read-only and credential-free.
  // A comparison page that blurred that line would be the single most
  // damaging copy error this venture could ship, so it is pinned.
  assert.match(html, /never deletes or writes anything/);
  assert.match(html, /no token,\s*no account, and no API access/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-github-branches\.html">/);
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

test('the FAQPage JSON-LD answers are verbatim on the page (word for word)', () => {
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('every visible FAQ question also appears in the FAQPage block, and vice versa', () => {
  // The regression this repo has hit repeatedly: the JSON-LD FAQ drifting
  // from the visible copy. Check both directions -- an orphaned visible
  // question is as much a drift as an orphaned schema answer.
  //
  // Only headings that end in a question mark count, which is the rule
  // `faqEntries()` in platform/pages/build.mjs actually applies (see the
  // header of platform/pages/faq-coverage.mjs, which records a session
  // wasted on measuring this a different way from the builder). Some
  // sibling vs-* tests match every `h3` instead; that is stricter than the
  // builder and would fail an ordinary prose subheading which ships no
  // schema entry and is not supposed to.
  const visible = [...html.matchAll(/<h3>([^<]+)<\/h3>/g)]
    .map((m) => m[1])
    .filter((text) => text.trim().endsWith('?'));
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  const schemaNames = schema.mainEntity.map((q) => q.name);
  assert.deepEqual([...visible].sort(), [...schemaNames].sort());
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="\.\/vs-github-branches\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-github-branches\.html/);
});

test('the comparison page links back to the scanner and to the explainer', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/is-it-safe-to-delete-this-branch\.html"/);
});
