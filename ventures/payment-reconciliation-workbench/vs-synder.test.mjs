import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-synder.html');
const index = docsPage('index.html');
const readme = docsPage('README.md');

test('index and README link to the Synder comparison page', () => {
  assert.match(index, /vs-synder\.html/);
  assert.match(readme, /vs-synder\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /payment-reconciliation-workbench\/<\/loc>/);
  assert.match(sitemap, /vs-synder\.html/);
});

test('the vs-Synder page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(html, /<title>This workbench vs\. Synder/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Synder or CloudBusiness LLC/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
});

test('the page states no specific price for Synder, since that figure could not be verified against a primary source reachable from this environment (synder.com is blocked by the egress proxy here) — same discipline as the sibling vs-granthub.html page', () => {
  assert.doesNotMatch(html, /Synder[^.]*\$\d/);
  assert.doesNotMatch(html, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
});

test('the page never claims a network call, matching every other page on this static site', () => {
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
