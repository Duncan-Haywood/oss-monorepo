import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./why-two-canonical-tags-is-worse-than-none.html', import.meta.url), 'utf8');
const indexHtml = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to this guide page and the sitemap lists it', () => {
  assert.match(indexHtml, /href="why-two-canonical-tags-is-worse-than-none\.html"|href="\.\/why-two-canonical-tags-is-worse-than-none\.html"/);
  assert.match(sitemap, /why-two-canonical-tags-is-worse-than-none\.html/);
});

test('the guide page names its subject and links back to the checker', () => {
  assert.match(html, /<title>Why two canonical tags on one page is worse than none/);
  assert.match(html, /<h1>Why two canonical tags on one page is worse than none<\/h1>/);
  assert.match(html, /name="description"/);
  assert.match(html, /href="index\.html"/);
});

test('names no vendor or competing product in its own title or h1', () => {
  // Unlike vs-screaming-frog.html, this page compares no product -- it
  // explains a finding the checker itself reports -- so it carries no
  // "not affiliated" clause, matching the exemption reasoning on this
  // venture's own vs-checking-canonicals-by-view-source.html sibling.
  const h1 = html.match(/<h1[^>]*>[\s\S]*?<\/h1>/i)[0];
  assert.doesNotMatch(h1, /Screaming Frog/i);
});

// The central claim -- two canonical tags naming different URLs is a danger
// finding, one missing tag is only a notice -- is recomputed against the
// module the checker itself runs, so a change to the shipped classification
// logic makes this page's worked example false (and this test red) instead
// of merely stale.
test('the worked example matches buildReport() on a page with two conflicting canonical tags', async () => {
  const { buildReport } = await import('./analyze.mjs');

  const page = {
    requestedUrl: 'https://example.com/guide/',
    finalUrl: 'https://example.com/guide/',
    redirectCount: 0,
    ok: true,
    status: 200,
    error: null,
    xRobotsTag: null,
    metaRobots: null,
    canonicalLinks: [
      { href: 'https://example.com/guide/', raw: '' },
      { href: 'https://example.com/blog/guide/', raw: '' },
    ],
  };

  const report = buildReport('https://example.com/guide/', page);

  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 0);
  assert.equal(report.findings.length, 1);
  assert.equal(report.findings[0].id, 'multiple-conflicting-canonical');
  assert.equal(report.findings[0].severity, 'danger');
  assert.equal(report.findings[0].title, '2 canonical tags naming 2 different URLs');

  // Pin the exact URLs and finding title the page's copy states as prose, so
  // a future analyze.mjs change that alters either fails this test rather
  // than only going stale in the page's copy.
  assert.match(html, /https:\/\/example\.com\/guide\//);
  assert.match(html, /https:\/\/example\.com\/blog\/guide\//);
  assert.match(html, new RegExp(report.findings[0].title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('a page with a missing canonical is contrasted as a notice, not a danger', () => {
  assert.match(html, /notice/);
  assert.match(html, /danger/);
  assert.match(html, /infer a reasonable one on their own/i);
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

// The JSON-LD carries real "<" and ">" characters where the visible markup
// spells the same tag names as HTML entities (&lt;/&gt;) so the page stays
// valid HTML -- a browser renders both identically, but a raw string
// comparison needs the visible side decoded first. See
// platform/pages/faq-visible.test.mjs for the whole-portfolio version of
// this check.
const decodeEntities = (text) => text
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&mdash;/g, '—')
  .replace(/&amp;/g, '&');

test('the FAQPage answers appear verbatim on the visible page, not only in the script tag', () => {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  const schema = JSON.parse(match[1]);
  const visible = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/g, ''));
  for (const { acceptedAnswer } of schema.mainEntity) {
    assert.ok(
      visible.includes(acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});
