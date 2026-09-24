import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-checking-canonicals-by-eye-in-devtools.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its devtools comparison page and the sitemap lists it', () => {
  assert.match(html, /href="vs-checking-canonicals-by-eye-in-devtools\.html"/);
  assert.match(sitemap, /vs-checking-canonicals-by-eye-in-devtools\.html/);
});

test('the comparison page names both tools and links back to the checker', () => {
  assert.match(page, /<title>Canonical Tag Checker vs\. Checking Canonicals by Eye in DevTools/);
  assert.match(page, /<h1>This checker vs\. checking canonicals by eye in DevTools<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /href="index\.html"/);
});

test('the comparison page names no specific product or company as its comparison subject', () => {
  // The page cross-links to vs-screaming-frog.html by name -- a pointer to a
  // sibling page, not a claim about Screaming Frog here -- so only browser
  // vendor names (which would make DevTools itself read as a named product)
  // are excluded.
  assert.doesNotMatch(page, /Chrome DevTools|Firefox DevTools|Safari Web Inspector/i);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /href="LICENSE"/);
  assert.match(page, /MIT licen[cs]e/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('the "only check what you are authorised to" caution carries onto this page too', () => {
  assert.match(page, /authoris(?:ed|ation)/i);
});

test('the page is static: no script src, no network call', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage schema question has a matching visible heading and answer', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ question "${question.name}" has no matching <h3>`);
    assert.ok(
      page.replace(/<script[\s\S]*?<\/script>/g, '').includes(question.acceptedAnswer.text),
      `answer not found verbatim outside the JSON-LD: ${question.acceptedAnswer.text.slice(0, 60)}...`,
    );
  }
});

// The page's worked example describes a relative canonical that resolves to
// a 404 left behind by a rename. Asserted against buildReport() directly,
// not transcribed, so the two named findings the prose claims are real.
test('the worked example (relative canonical resolving to a dead target) produces exactly the findings the page describes', () => {
  const target = 'https://shop.example.com/products/kids-rain-boots';
  const report = buildReport(
    target,
    { ok: true, finalUrl: target, canonicalLinks: [{ href: '/products/rain-boots-kids-old-name' }] },
    { ok: false, status: 404 },
  );
  assert.equal(report.ok, false);
  assert.ok(report.findings.some((f) => f.id === 'relative-canonical-url' && f.severity === 'notice'));
  assert.ok(report.findings.some((f) => f.id === 'canonical-target-unreachable' && f.severity === 'danger'));
  assert.equal(report.dangerCount, 1);
  assert.equal(report.noticeCount, 1);
});
