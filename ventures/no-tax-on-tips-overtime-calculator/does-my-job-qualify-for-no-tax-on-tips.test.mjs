import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

import { computeCombinedEstimate } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('does-my-job-qualify-for-no-tax-on-tips.html');
const index = page('index.html');
const sitemap = page('sitemap.xml');
const robots = page('robots.txt');

test('index links to the occupation-eligibility guide', () => {
  assert.match(index, /does-my-job-qualify-for-no-tax-on-tips\.html/);
});

test('robots and sitemap let crawlers find the new page', () => {
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /does-my-job-qualify-for-no-tax-on-tips\.html/);
});

test('the guide carries the required disclaimers and links back', () => {
  assert.match(html, /<title>Does My Job Qualify for "No Tax on Tips"/);
  assert.match(html, /name="description"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /GitHub Sponsors/);
});

test('has exactly one <h1> and the structural tags a crawler expects', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<meta name="viewport"/);
  assert.match(html, /<meta name="description" content="[^"]{80,}"/);
  assert.equal((html.match(/<h1[ >]/g) || []).length, 1);
});

test('FAQPage JSON-LD answers match the visible prose exactly', () => {
  const ld = JSON.parse(html.match(/<script type="application\/ld\+json">(\{"@context":"https:\/\/schema\.org","@type":"FAQPage".*?)<\/script>/s)[1]);
  assert.ok(ld.mainEntity.length >= 3, 'FAQPage should carry at least 3 questions');
  for (const qa of ld.mainEntity) {
    assert.ok(html.includes(`<h3>${qa.name}</h3>`), `question not found verbatim as an <h3>: ${qa.name}`);
    assert.ok(html.includes(qa.acceptedAnswer.text), `visible prose is missing the exact FAQ answer for "${qa.name}"`);
  }
});

// The worked $18,000-tips example is the page's central claim -- recomputed
// here against the shipped calculator rather than restated, so the page
// can't drift from what computeCombinedEstimate actually returns.
test('the worked occupation-eligibility example matches what the shipped calculator computes', () => {
  const base = { filingStatus: 'single', magi: 60000, qualifiedTips: 18000, overtimePremium: 0, marginalRatePercent: 22 };

  const eligible = computeCombinedEstimate({ ...base, occupationEligible: true });
  assert.equal(eligible.tipDeduction, 18000);
  assert.equal(eligible.totalDeduction, 18000);
  assert.equal(eligible.estimatedSavings, 3960);

  const notEligible = computeCombinedEstimate({ ...base, occupationEligible: false });
  assert.equal(notEligible.tipDeduction, 0);
  assert.equal(notEligible.totalDeduction, 0);
  assert.equal(notEligible.estimatedSavings, 0);
  assert.ok(notEligible.findings.some((f) => /Occupation eligibility/.test(f.title)));

  for (const figure of ['$18,000', '$3,960', '22%']) {
    assert.ok(html.includes(figure), `guide is missing figure ${figure}`);
  }
});
