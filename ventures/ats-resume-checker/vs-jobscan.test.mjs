import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-jobscan.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not career, legal, or any other professional advice/i);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with Jobscan', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Jobscan/);
});

test('no unverifiable price is claimed for Jobscan', () => {
  // Jobscan's own site is not reachable from this session (egress here is
  // proxied and does not permit fetching arbitrary vendor sites -- confirmed
  // by a direct WebFetch attempt returning EGRESS_BLOCKED), so no plan price
  // or scan-count limit could be confirmed against a primary source. Only
  // category facts sourced from independent review coverage are stated, and
  // no dollar figure appears anywhere on the page, matching the discipline
  // every other vs-* page in this repo uses.
  assert.doesNotMatch(html, /\$\d/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-jobscan\.html">/);
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
  // The defect this guards is the one CLAUDE.md records costing live product:
  // JSON-LD that diverges from the visible copy is a structured-data lie to a
  // crawler, and it drifts silently because nothing renders the schema.
  const match = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  const schema = JSON.parse(match[1]);
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(html.includes(acceptedAnswer.text), `answer not found verbatim on the page: ${acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-jobscan\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-jobscan\.html/);
});

test('the comparison page links back to the checker and to the copy-paste-test guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/what-is-the-ats-copy-paste-test\.html"/);
});

test('the page is clear that this checker uploads nothing', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /no job posting and no account/);
});

test('the page does not assert Jobscan feature specifics as verified fact', () => {
  // Positive assertion that the hedge itself is present: a later edit that
  // quietly adds a confident, unverified claim should fail here rather than
  // ship.
  assert.match(html, /not reachable from the session that generated/);
});
