import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { providerMonthlyCost } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-a-blended-per-token-rate.html');
const index = page('index.html');

test('index links to the blended-rate comparison page', () => {
  assert.match(index, /vs-a-blended-per-token-rate\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-a-blended-per-token-rate\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. a blended per-token estimate/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors|github\.com\/sponsors/);
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // This page compares against a generic estimating method, not a named
  // product -- it is listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // set, and clauses.test.mjs's real-tree sweep checks that listing agrees
  // with this file.
  assert.doesNotMatch(html, /not affiliated with, endorsed by, or sponsored by/i);
});

test('the page never claims a network call, matching every other page in this venture', () => {
  assert.doesNotMatch(html, /fetch\(|XMLHttpRequest|<script src=/);
});

test('every FAQPage question and answer authored in JSON-LD is also visible on the page', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(ld['@type'], 'FAQPage');
  assert.ok(ld.mainEntity.length >= 3);
  for (const entry of ld.mainEntity) {
    assert.ok(html.includes(entry.name), `question not visible on page: ${entry.name}`);
    assert.ok(html.includes(entry.acceptedAnswer.text), `answer not visible on page: ${entry.acceptedAnswer.text}`);
  }
});

test('states plainly that it does not assert any provider\'s cache discount or pricing', () => {
  assert.match(html, /not a claim about Anthropic's or any provider's current pricing/i);
});

test('the split and blended totals cited on the page match the calculator', () => {
  // The calculator's own default default workload and preloaded Anthropic
  // (Claude) example rates from index.html -- the worked example this page
  // cites.
  const workload = { freshInputTokens: 5_000_000, cachedInputTokens: 45_000_000, outputTokens: 2_000_000 };
  const rates = { inputRate: 3.0, cachedInputRate: 0.3, outputRate: 15.0 };

  const split = providerMonthlyCost({ name: 'Anthropic (Claude)', ...workload, ...rates });
  assert.ok(Math.abs(split.total - 58.5) < 0.001, `expected split total near $58.50, got ${split.total}`);

  // Blended: every input token (fresh + cached) billed at the fresh rate.
  const blended = providerMonthlyCost({
    name: 'Anthropic (Claude), blended',
    ...workload,
    inputRate: rates.inputRate,
    cachedInputRate: rates.inputRate,
    outputRate: rates.outputRate,
  });
  assert.ok(Math.abs(blended.total - 180) < 0.001, `expected blended total near $180.00, got ${blended.total}`);

  const overstatement = blended.total - split.total;
  assert.ok(Math.abs(overstatement - 121.5) < 0.001, `expected overstatement near $121.50, got ${overstatement}`);
  assert.ok(Math.abs(blended.total / split.total - 3.076923) < 0.001, 'blended total should be about 3.1x the split total');

  for (const figure of ['$180.00', '$58.50', '$121.50']) {
    assert.ok(html.includes(figure), `page does not cite ${figure}`);
  }
});
