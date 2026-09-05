import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const harvestPage = readFileSync(new URL('./vs-harvest.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('the calculator links to its Harvest comparison page and is listed in the sitemap', () => {
  assert.match(index, /vs-harvest\.html/);
  assert.match(sitemap, /vs-harvest\.html/);
});

test('the vs-Harvest comparison page names what each tool is for, disclaims affiliation, and carries the standard disclaimer', () => {
  assert.match(harvestPage, /<title>This calculator vs\. Harvest/);
  assert.match(harvestPage, /name="description"/);
  assert.match(harvestPage, /"@type":"FAQPage"/);
  assert.match(harvestPage, /href="\.\/"/);
  assert.match(harvestPage, /getharvest\.com/);
  assert.match(harvestPage, /rel="nofollow noopener"/);
  assert.match(harvestPage, /not affiliated with, endorsed by, or sponsored by Harvest/i);
  // No dollar figure for Harvest's own subscription price is asserted anywhere
  // on this page: Harvest restructured its pricing in 2026 (a flat per-seat
  // model became a plan-fee-plus-usage model after an acquisition) and its own
  // pricing page is not reachable from this environment to confirm today's
  // numbers, so the comparison stays functional (what job each tool does)
  // rather than citing a figure this repo cannot confirm -- same discipline as
  // vs-bonsai.html and grant-reporting-tracker/vs-granthub.html.
  assert.doesNotMatch(harvestPage, /Harvest[^.]*\$\d/);
  assert.doesNotMatch(harvestPage, /\$\d[\d,]*(\.\d+)?\s*(\/|per)\s*(year|yr|month|mo|seat)/i);
  assert.match(harvestPage, /Best-effort hosting, no SLA/);
  assert.match(harvestPage, /No warranty/);
  assert.match(harvestPage, /GitHub Sponsors/);
});

test('the vs-Harvest page never claims a network call, matching every other page on this static site', () => {
  assert.doesNotMatch(harvestPage, /fetch\(|XMLHttpRequest|<script src=/);
});
