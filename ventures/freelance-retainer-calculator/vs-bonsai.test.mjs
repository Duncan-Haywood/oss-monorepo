import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const bonsaiPage = readFileSync(new URL('./vs-bonsai.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Bonsai comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-bonsai\.html/);
  assert.match(sitemap, /vs-bonsai\.html/);
});

test('the vs-Bonsai comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(bonsaiPage, /<title>This calculator vs\. Bonsai/);
  assert.match(bonsaiPage, /name="description"/);
  assert.match(bonsaiPage, /"@type":"FAQPage"/);
  assert.match(bonsaiPage, /href="\.\/"/);
  assert.match(bonsaiPage, /hellobonsai\.com/);
  assert.match(bonsaiPage, /rel="nofollow noopener"/);
  assert.match(bonsaiPage, /not affiliated with, endorsed by, or sponsored by Bonsai/i);
  // No dollar figure for Bonsai's own subscription price is asserted anywhere
  // on this page: that number could not be verified against a primary source
  // reachable from this environment (hellobonsai.com is blocked by the egress
  // proxy here), so the comparison stays functional (what job each tool does)
  // rather than citing a price this repo cannot confirm -- same discipline as
  // grant-reporting-tracker/vs-granthub.html.
  assert.doesNotMatch(bonsaiPage, /Bonsai[^.]*\$\d/);
  assert.doesNotMatch(bonsaiPage, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
  assert.match(bonsaiPage, /Best-effort hosting, no SLA/);
  assert.match(bonsaiPage, /No warranty/);
  assert.match(bonsaiPage, /GitHub Sponsors/);
});

test('the vs-Bonsai page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(bonsaiPage, /fetch\(|XMLHttpRequest|<script src=/);
});
