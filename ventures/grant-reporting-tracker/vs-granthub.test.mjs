import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const granthubSeo = readFileSync(new URL('./vs-granthub.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the tracker links to its GrantHub comparison page and is listed in the sitemap', () => {
  assert.match(html, /vs-granthub\.html/);
  assert.match(sitemap, /vs-granthub\.html/);
});

test('the vs-GrantHub comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(granthubSeo, /<title>This tracker vs\. GrantHub/);
  assert.match(granthubSeo, /name="description"/);
  assert.match(granthubSeo, /"@type":"FAQPage"/);
  assert.match(granthubSeo, /href="\.\/"/);
  assert.match(granthubSeo, /foundant\.com\/products\/granthub/);
  assert.match(granthubSeo, /rel="nofollow noopener"/);
  assert.match(granthubSeo, /not affiliated with, endorsed by, or sponsored by Foundant Technologies or GrantHub/i);
  // No dollar figure for GrantHub's own pricing is asserted anywhere on this
  // page: that number could not be verified against a primary source reachable
  // from this environment (foundant.com is blocked by the egress proxy here),
  // so the comparison stays functional (what job each tool does) rather than
  // citing a price this repo cannot confirm — same discipline as the sibling
  // grant-deadline-tracker/vs-instrumentl.html page.
  assert.doesNotMatch(granthubSeo, /GrantHub[^.]*\$\d/);
  assert.doesNotMatch(granthubSeo, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo)/i);
  assert.match(granthubSeo, /Best-effort hosting, no SLA/);
  assert.match(granthubSeo, /No warranty/);
  assert.match(granthubSeo, /GitHub Sponsors/);
});

test('the vs-GrantHub page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(granthubSeo, /fetch\(|XMLHttpRequest|<script src=/);
});
