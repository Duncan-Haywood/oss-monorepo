import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const docsPage = (name) => fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8');
const html = docsPage('vs-fotoquote.html');
const index = docsPage('index.html');

test('index links to the fotoQuote comparison page', () => {
  assert.match(index, /vs-fotoquote\.html/);
});

test('the vs-fotoQuote page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(html, /<title>This calculator vs\. fotoQuote Pro/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /cradocfotosoftware\.com\/fotoquote/);
  assert.match(html, /rel="nofollow noopener"/);
  assert.match(html, /not affiliated with, endorsed by, or sponsored by Cradoc fotoSoftware/i);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('no unverifiable price is claimed for fotoQuote', () => {
  // fotoQuote's own site (cradocfotosoftware.com) is blocked by the egress
  // proxy in this environment, so no specific dollar figure for it could be
  // confirmed against a primary source -- same discipline as
  // grant-reporting-tracker/vs-granthub.html. Only the verified, non-numeric
  // facts (one-time purchase, desktop install, money-back guarantee, free
  // demos) are stated.
  assert.doesNotMatch(html, /fotoQuote[^.]*\$\d/i);
  assert.doesNotMatch(html, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
});

test('the vs-fotoQuote page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-fotoquote\.html/);
});
