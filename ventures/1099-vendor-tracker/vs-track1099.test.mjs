import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const compareSeo = readFileSync(new URL('./vs-track1099.html', import.meta.url), 'utf8');
const worked = readFileSync(new URL('./when-do-i-need-to-send-a-1099.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the tracker links to its worked-example and Track1099 comparison pages, and both are in the sitemap', () => {
  assert.match(html, /when-do-i-need-to-send-a-1099\.html/);
  assert.match(html, /vs-track1099\.html/);
  assert.match(sitemap, /when-do-i-need-to-send-a-1099\.html/);
  assert.match(sitemap, /vs-track1099\.html/);
});

test('the vs-Track1099 comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(compareSeo, /<title>This tracker vs\. Track1099/);
  assert.match(compareSeo, /name="description"/);
  assert.match(compareSeo, /"@type":"FAQPage"/);
  assert.match(compareSeo, /href="\.\/"/);
  assert.match(compareSeo, /track1099\.com/);
  assert.match(compareSeo, /rel="nofollow noopener"/);
  assert.match(compareSeo, /not affiliated with, endorsed by, or sponsored by Avalara, Inc\. or Track1099/i);
  // No dollar figure for Track1099's own per-form pricing is asserted: that
  // number changes and could not be verified against a primary source
  // reachable from this environment (track1099.com is blocked by the egress
  // proxy here) -- same discipline as grant-reporting-tracker/vs-granthub.html.
  assert.doesNotMatch(compareSeo, /Track1099[^.]*\$\d/);
  assert.doesNotMatch(compareSeo, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(form|filing|year|yr|month|mo)/i);
  assert.match(compareSeo, /Best-effort hosting, no SLA/);
  assert.match(compareSeo, /No warranty/);
  assert.match(compareSeo, /GitHub Sponsors/);
});

test('the vs-Track1099 page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(compareSeo, /fetch\(|XMLHttpRequest|<script src=/);
});

test('the worked-example page states the $600-to-$2,000 OBBBA change and both scope exceptions, and carries the standard disclaimer', () => {
  assert.match(worked, /\$600/);
  assert.match(worked, /\$2,000/);
  assert.match(worked, /OBBBA/);
  assert.match(worked, /attorney/i);
  assert.match(worked, /"@type":"FAQPage"/);
  assert.match(worked, /No warranty/);
});

test('index.html never claims a network call either -- the tracker is arithmetic on typed-in numbers, nothing fetched', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest/);
});

test('the disclaimer names what this tool is not, matching the categories it actually declines to compute', () => {
  assert.match(html, /not.{0,20}legal, financial, or tax advice/i);
  assert.match(html, /IRS TIN match/i);
});
