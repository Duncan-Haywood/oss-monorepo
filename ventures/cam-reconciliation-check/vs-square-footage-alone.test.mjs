import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { reconcile } from './calc.mjs';

const page = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = page('vs-square-footage-alone.html');
const index = page('index.html');
const sitemap = page('sitemap.xml');

test('index and sitemap link to the new comparison page', () => {
  assert.match(index, /vs-square-footage-alone\.html/);
  assert.match(sitemap, /vs-square-footage-alone\.html/);
});

test('robots.txt lets crawlers find the new page', () => {
  assert.match(page('robots.txt'), /Allow: \//);
});

test('names no vendor or competing product', () => {
  // This page compares against the generic habit of using square footage
  // share alone, not a named competitor -- distinct from this venture's own
  // vs-yardi.html and vs-appfolio.html, which name real platforms and carry
  // the trademark/affiliation disclaimer.
  assert.doesNotMatch(html, /Yardi|AppFolio/i);
});

test('the page carries the standard disclaimer and sponsors link', () => {
  assert.match(html, /<title>This worksheet vs\. reconciling CAM by square footage alone<\/title>/);
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

test('the worked example figures match calc.mjs at the cited scenarios', () => {
  const base = { annualExpenses: 120000, rentableArea: 10000, tenantArea: 1000, billedAmount: 10000, credits: 500 };

  const areaOnly = reconcile(base);
  assert.equal(areaOnly.modeledShare, 12000);
  assert.equal(areaOnly.grossUpApplied, false);

  const withGrossUp = reconcile({ ...base, variablePercent: 60, actualOccupancyPercent: 75, targetOccupancyPercent: 95 });
  assert.equal(withGrossUp.grossUpApplied, true);
  assert.equal(withGrossUp.grossUpAdjustment, 19200);
  assert.equal(withGrossUp.modeledShare, 13920);
  assert.equal(withGrossUp.modeledShare - areaOnly.modeledShare, 1920);
});

test('the comparison page links back to the calculator and to the square-footage guide', () => {
  assert.match(html, /<a href="\.\/">/);
  assert.match(html, /href="\.\/how-much-cam-do-i-owe-based-on-square-footage\.html"/);
});
