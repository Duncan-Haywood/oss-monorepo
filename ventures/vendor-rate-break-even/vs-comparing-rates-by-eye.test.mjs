import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { compare } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-comparing-rates-by-eye.html');
const index = page('index.html');
const sitemap = page('sitemap.xml');

test('index and sitemap link to the new comparison page', () => {
  assert.match(index, /vs-comparing-rates-by-eye\.html/);
  assert.match(sitemap, /vs-comparing-rates-by-eye\.html/);
});

test('robots.txt lets crawlers find the new page', () => {
  assert.match(page('robots.txt'), /Allow: \//);
});

test('names no vendor or competing product', () => {
  // This page compares against the generic habit of eyeballing two rate
  // cards, not a named competitor -- distinct from this venture's own
  // vs-crest-capital.html, which names Crest Capital and carries the
  // trademark/affiliation disclaimer.
  assert.doesNotMatch(html, /Crest Capital|TempWorks/i);
});

test('the page carries the standard disclaimer and sponsors link', () => {
  assert.match(html, /<title>This calculator vs\. comparing the quoted rates by eye \| Supplier Rate Break-Even Calculator<\/title>/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /GitHub Sponsors/);
});

test('the page never claims a network call', () => {
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

test('the worked example figures match calc.mjs at every volume cited', () => {
  const scenarios = [{ name: 'Bulk supplier', fixedMonthly: 100, variablePerJob: 90 }];

  const at3 = compare({ jobsPerMonth: 3, revenuePerJob: 500, baseFixedMonthly: 0, baseVariablePerJob: 120, scenarios });
  assert.equal(at3.baseline.monthlyCost, 360);
  assert.equal(at3.scenarios[0].monthlyCost, 370);

  const at4 = compare({ jobsPerMonth: 4, revenuePerJob: 500, baseFixedMonthly: 0, baseVariablePerJob: 120, scenarios });
  assert.equal(at4.baseline.monthlyCost, 480);
  assert.equal(at4.scenarios[0].monthlyCost, 460);
  assert.equal(at4.scenarios[0].breakEvenJobs, 4);

  const at20 = compare({ jobsPerMonth: 20, revenuePerJob: 500, baseFixedMonthly: 0, baseVariablePerJob: 120, scenarios });
  assert.equal(at20.baseline.monthlyCost, 2400);
  assert.equal(at20.scenarios[0].monthlyCost, 1900);
  assert.equal(at20.baseline.monthlyCost - at20.scenarios[0].monthlyCost, 500);
});

test('the comparison page links back to the calculator and to the break-even guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/is-switching-vendors-worth-it\.html"/);
});
