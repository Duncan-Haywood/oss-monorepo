import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-crest-capital.html');
const index = page('index.html');
const readme = page('README.md');

test('index and README link to the Crest Capital comparison page', () => {
  assert.match(index, /vs-crest-capital\.html/);
  assert.match(readme, /vs-crest-capital\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-crest-capital\.html/);
});

test('the vs-Crest-Capital page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(html, /<title>This calculator vs\. Crest Capital/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Crest Capital/i);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page states no specific rate or fee for Crest Capital, since that figure could not be verified against a primary source reachable from this environment', () => {
  assert.doesNotMatch(html, /Crest Capital[^.]*\$\d/);
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

test('the page distinguishes buyout (lease-end) from Crest Capital\'s new-lease pricing', () => {
  // The two tools sit at opposite ends of a lease. If a future edit blurs
  // that, the comparison stops explaining why both can be true at once.
  assert.match(html, /break-even buyout price/);
  assert.match(html, /new lease/);
});
