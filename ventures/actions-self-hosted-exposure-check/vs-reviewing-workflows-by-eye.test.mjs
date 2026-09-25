import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-reviewing-workflows-by-eye.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its by-eye comparison page and the sitemap lists it', () => {
  assert.match(html, /href="vs-reviewing-workflows-by-eye\.html"/);
  assert.match(sitemap, /vs-reviewing-workflows-by-eye\.html/);
});

test('the comparison page names no product and links back to the checker', () => {
  assert.match(page, /<title>Actions Self-Hosted Exposure Check vs\. reviewing workflows by eye/);
  assert.match(page, /<h1>Actions Self-Hosted Exposure Check vs\. reviewing workflows by eye<\/h1>/);
  assert.match(page, /name="description"/);
  assert.match(page, /href="\.\/"/);
  assert.match(page, /names no product or company/i);
});

test('the page never disparages manual review or claims it always fails', () => {
  const prose = page.replace(/<script[\s\S]*?<\/script>/g, '');
  assert.doesNotMatch(prose, /\b(worse|inferior) than\b/i);
  assert.doesNotMatch(prose, /(reviewing|manual review)[^.]*\b(useless|worthless|pointless)\b/i);
});

test('no unverifiable price, subscription figure, or traction claim', () => {
  assert.doesNotMatch(page, /\$\d/);
  assert.doesNotMatch(page, /\d+\s*(users|customers|companies|downloads)/i);
});

test('the page is static: no script src, no network call', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the standard clauses and the sponsor link are present', () => {
  assert.match(page, /No warranty/);
  assert.match(page, /provided free and as-is, without warranty/);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /href="LICENSE"/);
  assert.match(page, /MIT licen[cs]e/);
  assert.match(page, /https:\/\/github\.com\/sponsors\/Duncan-Haywood/);
});

test('every FAQPage schema question has a matching visible heading', () => {
  const match = page.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  assert.ok(match, 'no JSON-LD found');
  const schema = JSON.parse(match[1]);
  assert.equal(schema['@type'], 'FAQPage');
  assert.ok(schema.mainEntity.length >= 3);
  for (const question of schema.mainEntity) {
    assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ question "${question.name}" has no matching <h3>`);
  }
});

// The stricter tag-aware verbatim match (inline tags like <code> closed up,
// entities decoded) is covered fleet-wide by platform/pages/faq-visible.test.mjs.
