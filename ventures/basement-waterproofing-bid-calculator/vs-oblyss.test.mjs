import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-oblyss.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the Oblyss comparison page', () => {
  assert.match(index, /vs-oblyss\.html/);
  assert.match(readme, /vs-oblyss\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /basement-waterproofing-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /vs-oblyss\.html/);
});

test('the vs-Oblyss page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(html, /<title>This calculator vs\. Oblyss/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Oblyss/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page states no specific price for Oblyss, since that figure could not be verified against a primary source reachable from this environment (oblysspro.com is blocked by the egress proxy here) — same discipline as the sibling vs-synder.html page', () => {
  assert.doesNotMatch(html, /Oblyss[^.]*\$\d/);
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
