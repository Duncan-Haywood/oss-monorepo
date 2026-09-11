import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const booqablePage = readFileSync(new URL('./vs-booqable.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Booqable comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-booqable\.html/);
  assert.match(sitemap, /vs-booqable\.html/);
});

test('the vs-Booqable comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(booqablePage, /<title>Bounce House Rental Calculator vs\. Booqable/);
  assert.match(booqablePage, /name="description"/);
  assert.match(booqablePage, /"@type":"FAQPage"/);
  assert.match(booqablePage, /href="\.\/"/);
  assert.match(booqablePage, /booqable\.com/);
  assert.match(booqablePage, /rel="nofollow noopener"/);
  assert.match(booqablePage, /not affiliated with, endorsed by, or sponsored by Booqable/i);
  // Booqable publishes plan pricing, but this fleet's discipline (see
  // vs-tempworks.html and vs-sitelink.html) is to state only non-numeric,
  // durable identity facts about a competitor rather than a price that can
  // drift out from under a static page with no way to refresh it.
  assert.doesNotMatch(booqablePage, /Booqable[^.]*\$\d/);
  assert.doesNotMatch(booqablePage, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|seat)/i);
  assert.match(booqablePage, /Best-effort hosting, no SLA/);
  assert.match(booqablePage, /No warranty/);
  assert.match(booqablePage, /GitHub Sponsors/);
});

test('the vs-Booqable page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(booqablePage, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-Booqable page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(booqablePage, /recordUsage/);
});

test('the vs-Booqable page is structured for a reader and a crawler', () => {
  assert.match(booqablePage, /<html lang="en">/);
  assert.match(booqablePage, /<meta name="viewport"/);
  assert.match(booqablePage, /<link rel="canonical"/);
  assert.match(booqablePage, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((booqablePage.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-Booqable page is valid JSON', () => {
  const blocks = [...booqablePage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});

test('every FAQ answer in the JSON-LD is also visible, verbatim, as page copy', () => {
  const match = booqablePage.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(match, 'no FAQPage schema found');
  const schema = JSON.parse(match[1]);
  assert.ok(schema.mainEntity.length > 0);
  for (const question of schema.mainEntity) {
    assert.ok(booqablePage.includes(`<h3>${question.name}</h3>`), `FAQ schema question "${question.name}" has no matching <h3> on the page`);
    assert.ok(booqablePage.includes(question.acceptedAnswer.text), `answer not found verbatim on the page: ${question.acceptedAnswer.text.slice(0, 60)}...`);
  }
});
