import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { reconcile } from './calc.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('how-much-cam-do-i-owe-based-on-square-footage.html');
const index = docsPage('index.html');

const money = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

test('index links to the square-footage SEO/AI-discovery page', () => {
  assert.match(index, /how-much-cam-do-i-owe-based-on-square-footage\.html/);
});

test('the square-footage page answers the search question with a worked table', () => {
  assert.match(html, /How Much CAM Do You Owe Based on Square Footage/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not legal, tax, financial, or real-estate advice/i);
});

test('the table figures match reconcile() at the stated building defaults, not hand-typed numbers', () => {
  const rentableArea = 10000;
  const annualExpenses = 120000;
  const suiteSizes = [250, 500, 1000, 2500, 5000, 8000];
  for (const tenantArea of suiteSizes) {
    const result = reconcile({ annualExpenses, rentableArea, tenantArea, billedAmount: 0, credits: 0 });
    const sharePct = `${(result.share * 100).toFixed(2)}%`;
    const annual = money(result.modeledShare);
    const monthly = money(result.modeledShare / 12);
    assert.match(html, new RegExp(sharePct.replace('.', '\\.')), `area share for ${tenantArea} sq ft should appear as ${sharePct}`);
    assert.match(html, new RegExp(annual.replace(/[$,.]/g, '\\$&')), `modeled annual CAM for ${tenantArea} sq ft should appear as ${annual}`);
    assert.match(html, new RegExp(monthly.replace(/[$,.]/g, '\\$&')), `modeled monthly CAM for ${tenantArea} sq ft should appear as ${monthly}`);
  }
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /cam-reconciliation-check\/<\/loc>/);
  assert.match(sitemap, /how-much-cam-do-i-owe-based-on-square-footage\.html/);
});
