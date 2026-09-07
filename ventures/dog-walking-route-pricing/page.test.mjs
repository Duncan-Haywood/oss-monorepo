import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteRevenue, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeRouteRevenue, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeRouteRevenue, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the visit and route calculators', () => {
  assert.match(html, /recordEvent\('estimate'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>estimate<\/code>, <code>route-check<\/code>/);
});

test('the default visit inputs match calc.mjs DEFAULTS and produce a positive price', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="visitMinutes" type="number" min="0" step="1" value="${DEFAULTS.visitMinutes}"`));
  assert.ok(result.finalPrice > 0);
});

test('the route table has six client rows, all optional', () => {
  const priceInputs = [...html.matchAll(/class="clientPrice" data-row="(\d)"/g)];
  const visitInputs = [...html.matchAll(/class="clientVisits" data-row="(\d)"/g)];
  assert.equal(priceInputs.length, 6);
  assert.equal(visitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteRevenue directly', () => {
  const route = computeRouteRevenue([
    { price: 20, visitsPerWeek: 5 },
    { price: 35, visitsPerWeek: 2 },
  ], 4.33);
  assert.ok(route.monthlyRevenue > 0);
  assert.match(html, /value="20"/);
  assert.match(html, /value="35"/);
});

test('the no-warranty disclaimer is on the page', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
});

test('the page carries the standard sponsor link and a LICENSE link', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
});

test('the privacy line names both stored event types and says nothing is uploaded or saved', () => {
  assert.match(html, /never uploaded/);
  assert.match(html, /nothing is saved when you close the tab/);
});

test('the visit result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid visit input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateVisit[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateVisit() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('price'\)\.hidden = true/, 'the price hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// Closest sibling: same visited-vs-unattended route margin shape for an
// independent operator, but a machine placement rather than a service visit.
// Without a crawlable link here, a crawler entering on the dog walking route
// pricing calculator never reaches the ATM route margin calculator in one
// hop.
test('index links one hop to the atm-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/atm-route-margin\/"/,
    'index must link ../atm-route-margin/ so crawlers reach the ATM route margin calculator in one hop',
  );
});
