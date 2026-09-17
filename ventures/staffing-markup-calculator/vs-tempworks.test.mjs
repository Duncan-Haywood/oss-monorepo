import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const tempworksPage = readFileSync(new URL('./vs-tempworks.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its TempWorks comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-tempworks\.html/);
  assert.match(sitemap, /vs-tempworks\.html/);
});

test('the vs-TempWorks comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(tempworksPage, /<title>Staffing Markup Calculator vs\. TempWorks/);
  assert.match(tempworksPage, /name="description"/);
  assert.match(tempworksPage, /"@type":"FAQPage"/);
  assert.match(tempworksPage, /href="\.\/"/);
  assert.match(tempworksPage, /tempworks\.com/);
  assert.match(tempworksPage, /rel="nofollow noopener"/);
  assert.match(tempworksPage, /not affiliated with, endorsed by, or sponsored by TempWorks/i);
  // TempWorks prices by quote rather than a published rate card, so no dollar
  // figure for it is asserted anywhere on this page -- same discipline as
  // freelance-retainer-calculator/vs-harvest.html and vs-bonsai.html.
  assert.doesNotMatch(tempworksPage, /TempWorks[^.]*\$\d/);
  assert.doesNotMatch(tempworksPage, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|seat)/i);
  assert.match(tempworksPage, /Best-effort hosting, no SLA/);
  assert.match(tempworksPage, /No warranty/);
  assert.match(tempworksPage, /GitHub Sponsors/);
});

test('the vs-TempWorks page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(tempworksPage, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the vs-TempWorks page never invokes the usage counter, matching every other comparison page in the catalogue', () => {
  assert.doesNotMatch(tempworksPage, /recordUsage/);
});

test('the vs-TempWorks page is structured for a reader and a crawler', () => {
  assert.match(tempworksPage, /<html lang="en">/);
  assert.match(tempworksPage, /<meta name="viewport"/);
  assert.match(tempworksPage, /<link rel="canonical"/);
  assert.match(tempworksPage, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((tempworksPage.match(/<h1[ >]/g) || []).length, 1);
});

test('the structured data on the vs-TempWorks page is valid JSON', () => {
  const blocks = [...tempworksPage.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  assert.ok(blocks.length > 0, 'no structured data found');
  for (const [, body] of blocks) {
    assert.doesNotThrow(() => JSON.parse(body), 'malformed JSON-LD block');
  }
});
