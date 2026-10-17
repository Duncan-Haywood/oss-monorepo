import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./vs-checking-canonicals-by-view-source.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to this comparison page and the sitemap lists it', () => {
  assert.match(indexHtml, /href="vs-checking-canonicals-by-view-source\.html"|href="\.\/vs-checking-canonicals-by-view-source\.html"/);
  assert.match(sitemap, /vs-checking-canonicals-by-view-source\.html/);
});

test('the comparison page names what each method does and links back to the checker', () => {
  assert.match(html, /<title>Canonical Tag Checker vs\. checking canonicals by view-source/);
  assert.match(html, /<h1>Canonical Tag Checker vs\. checking canonicals by view-source<\/h1>/);
  assert.match(html, /name="description"/);
  assert.match(html, /href="index\.html"/);
});

test('names no vendor or competing product in its own title or h1', () => {
  // Compares against "checking canonicals by view-source" -- a manual habit
  // every web developer already has, not a company or product this could be
  // mistaken for, so this page is listed in platform/pages/clauses.mjs's
  // COMPARISON_DISCLAIMER_EXEMPT rather than carrying a "not affiliated"
  // clause. Its own vs-screaming-frog.html sibling does name a product and
  // separately carries that clause. Same shape as this venture's own
  // reasoning for that exemption set (e.g. license-drift-check's
  // vs-manually-rechecking-licenses.html).
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Screaming Frog/i);
});

test('the worked example matches buildReport() on a canonical whose target is noindexed', async () => {
  const { buildReport } = await import('./analyze.mjs');

  const page = {
    requestedUrl: 'https://example.com/old-guide/',
    finalUrl: 'https://example.com/old-guide/',
    redirectCount: 0,
    ok: true,
    status: 200,
    error: null,
    xRobotsTag: null,
    metaRobots: null,
    canonicalLinks: [{ href: 'https://example.com/guide/', raw: '<link rel=canonical href="https://example.com/guide/">' }],
  };
  const canonicalTarget = {
    requestedUrl: 'https://example.com/guide/',
    finalUrl: 'https://example.com/guide/',
    ok: true,
    status: 200,
    error: null,
    redirectCount: 0,
    metaRobots: 'noindex, follow',
    xRobotsTag: null,
  };

  const report = buildReport('https://example.com/old-guide/', page, canonicalTarget);

  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 0);
  assert.equal(report.findings[0].id, 'canonical-target-noindex');
  assert.equal(report.findings[0].severity, 'danger');

  // Pin the exact URLs and finding title the page's copy states as prose, so
  // a future analyze.mjs change that alters either fails this test rather
  // than only going stale in the page's copy.
  assert.match(html, /\/old-guide\//);
  assert.match(html, /\/guide\//);
  assert.match(html, /noindex/);
  assert.match(html, new RegExp(report.findings[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(html, /No warranty/);
  assert.match(html, /provided free and as-is, without warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /MIT licen[cs]e/);
  assert.match(html, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the "only check what you are authorised to" caution carries onto this page too', () => {
  assert.match(html, /authoris(?:ed|ation)/i);
});

test('no unverifiable price, subscription figure, or traction claim', () => {
  assert.doesNotMatch(html, /\$\d/);
  assert.doesNotMatch(html, /\d+\s*(users|customers|companies|downloads)/i);
});

test('the page is static: no script src, no network call', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage schema question has a matching visible heading', () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${question.name}</h3>`), `FAQ question "${question.name}" has no matching <h3>`);
  }
});

test('the FAQPage answers appear verbatim on the visible page, not only in the script tag', () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  const visible = html.replace(/<script[\s\S]*?<\/script>/g, '');
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});

// platform/pages/build.mjs derives the compared product for the catalogue's
// /compare/ index from the text after the last "vs." in the <h1>. This page
// is exempt from that index the same way the generic-method sibling pages
// are (no named product), so it deliberately does not need that check --
// covered instead by the exemption test above.
