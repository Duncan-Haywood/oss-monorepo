import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-quoteiq.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the QuoteIQ comparison page', () => {
  assert.match(index, /vs-quoteiq\.html/);
  assert.match(readme, /vs-quoteiq\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /deck-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /vs-quoteiq\.html/);
});

test('the vs-QuoteIQ page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(html, /<title>This calculator vs\. QuoteIQ/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by QuoteIQ/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page states no specific price for QuoteIQ, since that figure could not be verified against a primary source reachable from this environment (bolsterbuilt.com and quoteiq.com are blocked by the egress proxy here) — same discipline as the sibling vs-synder.html page', () => {
  assert.doesNotMatch(html, /QuoteIQ[^.]*\$\d/);
  assert.doesNotMatch(html, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage question and answer authored in JSON-LD is also visible on the page', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  for (const entry of ld.mainEntity) {
    assert.ok(html.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(html.includes(entry.acceptedAnswer.text), `answer not visible on page: ${entry.acceptedAnswer.text}`);
  }
});
