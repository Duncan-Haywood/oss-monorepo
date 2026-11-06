import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const read = (n) => fs.readFileSync(new URL(`./${n}`, import.meta.url), 'utf8');
const html = read('how-do-i-check-a-3pl-invoice-for-overcharges.html');
const indexHtml = read('index.html');
const sitemap = read('sitemap.xml');

test('carries the no-warranty disclaimer and the hosting paragraph', () => {
  assert.match(html, /<strong>No warranty\.<\/strong>/);
  assert.match(html, /not legal or financial advice/i);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the canonical tag names this file', () => {
  assert.match(html, /<link rel="canonical" href="\.\/how-do-i-check-a-3pl-invoice-for-overcharges\.html">/);
});

test('the <h1> is the question the page answers', () => {
  assert.equal(html.match(/<h1>([^<]+)<\/h1>/)[1], 'How do I check a 3PL invoice for overcharges?');
});

test('names no competing product or company', () => {
  assert.doesNotMatch(html, /Extensiv|ShipBob|ShipMonk|Flexport|Deliverr|Amazon FBA|Cass|Trax/);
});

test('the FAQPage schema matches the visible FAQ verbatim', () => {
  const m = html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?\})<\/script>/s);
  assert.ok(m, 'no FAQPage schema');
  const schema = JSON.parse(m[1]);
  assert.ok(schema.mainEntity.length >= 3);
  const squash = (t) => t.replace(/\s+/g, ' ').trim().toLowerCase();
  const visible = squash(html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&'));
  for (const q of schema.mainEntity) {
    assert.ok(html.includes(`<h3>${q.name}</h3>`), `no <h3> for "${q.name}"`);
    assert.ok(visible.includes(squash(q.acceptedAnswer.text)), `answer for "${q.name}" is not visible verbatim`);
  }
});

test('linked from the tool page and listed in the sitemap, and links back', () => {
  assert.match(indexHtml, /href="how-do-i-check-a-3pl-invoice-for-overcharges\.html"/);
  assert.match(sitemap, /how-do-i-check-a-3pl-invoice-for-overcharges\.html/);
  assert.match(html, /<a href="\.\/">/);
  assert.match(read('llms.txt'), /how-do-i-check-a-3pl-invoice-for-overcharges\.html/);
});

test('names the checks the steps cover', () => {
  assert.match(html, /duplicate/i);
  assert.match(html, /account minimum/i);
  assert.match(html, /no fee at all|no matching fee/i);
  assert.match(html, /never uploaded/);
  assert.match(html, /<ol>/);
});

test('adds no third-party script, font, stylesheet or network call', () => {
  assert.equal(/<script[^>]+src=/i.test(html), false);
  assert.equal(/<link[^>]+href="https?:/i.test(html), false);
  assert.equal(/@import|fonts\.googleapis|cdn\./i.test(html), false);
});

test('structured for a reader and a crawler', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});
