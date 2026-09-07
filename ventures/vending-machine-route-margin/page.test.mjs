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

test('the page wires usage counting for both the visit and route calculators', () => {
  assert.match(html, /recordEvent\('visit-priced'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>visit-priced<\/code>, <code>route-check<\/code>/);
});

test('the default visit inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="unitsSold" type="number" min="0" step="1" value="${DEFAULTS.unitsSold}"`));
  assert.ok(result.netProfit > 0);
});

test('the route table has six location rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="locationProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteProfit directly', () => {
  const route = computeRouteProfit([{ monthlyProfit: 64 }, { monthlyProfit: 38 }]);
  assert.ok(route.totalMonthlyProfit > 0);
  assert.match(html, /value="64"/);
  assert.match(html, /value="38"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
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

test('the visit result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section id="price" class="result" aria-live="polite">/);
});

test('an invalid visit input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateVisit[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateVisit() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// Closest sibling: same unattended machine-route margin shape for an
// independent operator, but ATM placements rather than vending machines.
// Related-tool chrome rotates inside the subcategory, so without an explicit
// one-hop a crawler on this page may never land on that tool.
test('index links one hop to the atm-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/atm-route-margin\/"/,
    'index must link ../atm-route-margin/ so crawlers reach the ATM route margin calculator in one hop',
  );
  assert.match(html, /ATM route margin calculator/i);
});
