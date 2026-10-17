import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import { calculateLesson } from './calc.mjs';

const html = readFileSync(new URL('./vs-picking-a-rate-off-the-going-local-price.html', import.meta.url), 'utf8');
const index = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');
const robots = readFileSync(new URL('./robots.txt', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

test('index, README, robots, and sitemap all let a visitor and a crawler reach the going-rate comparison page', () => {
  assert.match(index, /vs-picking-a-rate-off-the-going-local-price\.html/);
  assert.match(readme, /vs-picking-a-rate-off-the-going-local-price\.html/);
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /vs-picking-a-rate-off-the-going-local-price\.html/);
});

test('the comparison page carries the required disclaimers and links back', () => {
  assert.match(html, /<title>This calculator vs\. picking a rate off the going local price/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page names no specific competitor, so it needs no trademark-affiliation clause', () => {
  // Compares against a generic method (copying a nearby posted rate), not a
  // named product -- listed in clauses.mjs's COMPARISON_DISCLAIMER_EXEMPT
  // set, and clauses.test.mjs's real-tree sweep checks that listing agrees
  // with this file, same as vs-mymusicstaff.html's sibling test for the
  // named-product page.
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

test('the worked-example figures cited on the page match the calculator', () => {
  const result = calculateLesson({
    lessonPrice: 50,
    lessonsPerWeek: 16,
    weeksPerYear: 44,
    cancelRate: 15,
    prepMinutes: 10,
    travelMinutes: 25,
    monthlyCosts: 120,
    targetPay: 45000,
  });

  assert.equal(result.netAfterCosts.toFixed(0), '28480');
  assert.equal(result.effectiveHourly.toFixed(2), '25.55');
  assert.equal(result.targetPrice.toFixed(2), '77.61');
  assert.equal((result.targetPrice - result.lessonPrice).toFixed(2), '27.61');
  assert.equal((45000 - result.netAfterCosts).toFixed(0), '16520');
  assert.equal(result.annualHours.toFixed(1), '1114.7');
});
