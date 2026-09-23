import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./vs-zizmor.html', import.meta.url), 'utf8');
const indexHtml = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = fs.readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not a security audit/);
});

test('carries the best-effort hosting disclaimer', () => {
  assert.match(html, /<strong>Best-effort hosting, no SLA\.<\/strong>/);
});

test('states it is not affiliated with zizmor', () => {
  assert.match(html, /not affiliated with, endorsed by, or sponsored by zizmor/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/vs-zizmor\.html">/);
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

test('the comparison page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="(\.\/)?vs-zizmor\.html"/);
});

test('the comparison page is listed in the sitemap', () => {
  assert.match(sitemap, /vs-zizmor\.html/);
});

test('the comparison page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

test('the page is clear that this checker uploads nothing and makes no network call', () => {
  assert.match(html, /never uploaded/);
});

test('does not claim this tool needs a GitHub token when it never does', () => {
  assert.match(html, /No, never\./);
});

test('the page is honest that one finding overlaps zizmor rather than claiming full novelty', () => {
  // The central factual claim of this page is that zizmor's secrets-inherit
  // audit already covers the external-workflow finding (and covers it more
  // broadly, including local calls) -- only the untrusted-trigger finding is
  // outside zizmor's stated scope. A later edit that dropped this admission
  // in favour of claiming both findings are novel would misrepresent a
  // competitor's actual coverage.
  assert.match(html, /zizmor's secrets-inherit audit already covers/);
  assert.match(html, /covers less of it/);
});

test('sources the scope claim, not asserted as this page\'s own unqualified finding', () => {
  assert.match(html, /per its own documentation/);
  assert.match(html, /Per its published documentation and source/);
  assert.match(html, /github\.com\/zizmorcore\/zizmor/);
});

test('names the specific scope difference: reachability, not just the inherit pattern', () => {
  assert.match(html, /pull_request_target/);
  assert.match(html, /workflow_run/);
  assert.match(html, /secrets-inherit-untrusted-trigger/);
});
