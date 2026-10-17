import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { looksLikeGitHead, looksLikeGitConfig, buildReport } from './analyze.mjs';

const page = (name) => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

const html = page('how-to-tell-a-real-exposed-git-directory-from-a-soft-404.html');
const indexHtml = page('index.html');

test('carries the no-warranty disclaimer', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not security advice/i);
});

test('the canonical tag names this file', () => {
  assert.match(
    html,
    /<link rel="canonical" href="https:\/\/example\.invalid\/git-exposure-check\/how-to-tell-a-real-exposed-git-directory-from-a-soft-404\.html">/,
  );
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
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});

test('the guide page is linked from the tool page, not orphaned', () => {
  assert.match(indexHtml, /href="how-to-tell-a-real-exposed-git-directory-from-a-soft-404\.html"/);
});

test('the guide page links back to the checker', () => {
  assert.match(html, /<a href="\.\/">/);
});

// The worked-example bodies quoted in the copy are checked here against the
// real classifier, not asserted by eye -- prose and code drift apart silently.
test('the worked-example bodies match analyze.mjs on both the exposed and soft-404 cases', () => {
  const realHead = 'ref: refs/heads/main';
  const realConfig = '[core]\n\trepositoryformatversion = 0\n';
  const detachedSha = 'da39a3ee5e6b4b0d3255bfef95601890afd80709';
  const softNotFound = '<html><body>404 Not Found</body></html>';

  assert.equal(looksLikeGitHead(realHead), true);
  assert.equal(looksLikeGitConfig(realConfig), true);
  assert.equal(looksLikeGitHead(detachedSha), true);
  assert.equal(looksLikeGitHead(softNotFound), false);
  assert.equal(looksLikeGitConfig(softNotFound), false);

  const exposedReport = buildReport('https://example.com/', {
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: realHead },
    config: { ok: true, status: 200, url: 'https://example.com/.git/config', bodySample: realConfig },
  });
  assert.equal(exposedReport.dangerCount, 1);
  assert.equal(exposedReport.ok, false);

  const softReport = buildReport('https://example.com/', {
    head: { ok: true, status: 200, url: 'https://example.com/.git/HEAD', bodySample: softNotFound },
    config: { ok: true, status: 200, url: 'https://example.com/.git/config', bodySample: softNotFound },
  });
  assert.equal(softReport.dangerCount, 0);
  assert.equal(softReport.ok, true);

  assert.match(html, /da39a3ee5e6b4b0d3255bfef95601890afd80709/);
  assert.match(html, /ref: refs\/heads\/main/);
  assert.match(html, /404 Not Found/);
});
