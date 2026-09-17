import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const page = readFileSync(new URL('./vs-screamingfrog.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the checker links to its Screaming Frog comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-screamingfrog\.html/);
  assert.match(sitemap, /vs-screamingfrog\.html/);
});

test('the vs-Screaming-Frog comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(page, /<title>Social Preview Checker vs\. Screaming Frog SEO Spider/);
  assert.match(page, /name="description"/);
  assert.match(page, /"@type":\s*"FAQPage"/);
  assert.match(page, /href="index\.html"/);
  assert.match(page, /screamingfrog\.co\.uk/);
  assert.match(page, /rel="nofollow noopener"/);
  assert.match(page, /not affiliated with, endorsed by, or sponsored by Screaming Frog/i);
  // Screaming Frog publishes a per-license price, but this fleet's discipline
  // (see vs-tempworks.html and vs-sitelink.html) is to state only durable,
  // non-numeric identity facts about a competitor rather than a price that
  // can drift out from under a static page with no way to refresh it.
  assert.doesNotMatch(page, /Screaming Frog[^.]*\$\d/);
  assert.doesNotMatch(page, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|seat|license)/i);
  assert.match(page, /Best-effort hosting, no SLA/);
  assert.match(page, /No warranty/);
  assert.match(page, /GitHub Sponsors/);
});

test('the vs-Screaming-Frog page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(page, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-Screaming-Frog page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(page, /recordUsage/);
});

test('the vs-Screaming-Frog page is structured for a reader and a crawler', () => {
  assert.match(page, /<html lang="en">/);
  assert.match(page, /<meta name="viewport"/);
  assert.match(page, /<link rel="canonical"/);
  assert.match(page, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((page.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-Screaming-Frog page is valid JSON', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const blocks = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(([, body]) => JSON.parse(body))
    .filter((b) => b['@type'] === 'FAQPage');
  assert.ok(blocks.length > 0, 'no FAQPage schema found');
  for (const schema of blocks) {
    assert.ok(schema.mainEntity.length >= 3);
    for (const question of schema.mainEntity) {
      assert.ok(page.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
      assert.ok(page.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
    }
  }
});
