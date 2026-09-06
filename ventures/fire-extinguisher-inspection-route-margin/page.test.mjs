import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeRouteProfit, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeRouteProfit, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the site and route calculators', () => {
  assert.match(html, /recordEvent\('site-priced'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>site-priced<\/code>, <code>route-check<\/code>/);
});

test('the default site inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="extinguisherCount" type="number" min="0" step="1" value="${DEFAULTS.extinguisherCount}"`));
  assert.ok(result.netProfit > 0);
});

test('the route table has six site rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="siteProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteProfit directly', () => {
  const route = computeRouteProfit([{ monthlyProfit: 18 }, { monthlyProfit: 9 }]);
  assert.ok(route.totalMonthlyProfit > 0);
  assert.match(html, /value="18"/);
  assert.match(html, /value="9"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the disclaimer disclaims a compliance determination, not just a warranty', () => {
  assert.match(html, /does not perform, certify, or replace a professional fire-extinguisher/);
  assert.match(html, /does not determine or record NFPA 10/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the site result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid site input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateVisit[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateVisit() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('every route-table input carries an accessible aria-label', () => {
  const rows = [...html.matchAll(/<input class="siteProfit"[^>]*>/g)];
  assert.equal(rows.length, 6);
  for (const [tag] of rows) {
    assert.match(tag, /aria-label="Site \d monthly profit in dollars"/, `missing aria-label on ${tag}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /fire-extinguisher-inspection-route-margin\/<\/loc>/);
});
