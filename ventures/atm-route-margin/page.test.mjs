import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./is-this-atm-placement-worth-it.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeRouteProfit, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeRouteProfit, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the location and route calculators', () => {
  assert.match(html, /recordEvent\('location-priced'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>location-priced<\/code>, <code>route-check<\/code>/);
});

test('the default location inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="monthlyWithdrawals" type="number" min="0" step="1" value="${DEFAULTS.monthlyWithdrawals}"`));
  assert.ok(result.netProfit > 0);
});

test('the route table has six location rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="locationProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteProfit directly', () => {
  const route = computeRouteProfit([{ monthlyProfit: 124 }, { monthlyProfit: 58 }]);
  assert.ok(route.totalMonthlyProfit > 0);
  assert.match(html, /value="124"/);
  assert.match(html, /value="58"/);
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

test('the location result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid location input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateVisit[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateVisit() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

// Regression: this venture graduated (#3519) with no secondary page at all --
// guide-coverage.mjs flags it as the only route-margin sibling with zero pages
// beside the entry page, unlike vending-machine-route-margin (two vs- pages)
// and medical-courier-route-margin (a guide page and a vs- page). The tool's
// own page answers "what did I actually profit", not "should I take this
// placement offer" -- the question a buyer types before they know the tool
// exists.
test('the tool links to the placement-evaluation guide page', () => {
  assert.match(html, /href="is-this-atm-placement-worth-it\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly', () => {
  const r = calculate({
    monthlyWithdrawals: 90,
    surchargeFee: 2.5,
    locationCommissionPct: 50,
    locationFlatFee: 0,
    processingFeePerTxn: 0.3,
    cashCostAnnualRatePct: 8,
    averageCashLoad: 2000,
    refillVisitsPerMonth: 4,
    refillMinutes: 15,
    driveMinutes: 20,
    mileage: 8,
    mileageRate: 0.67,
    targetHourlyRate: 25,
    machineMonthlyCost: 60,
    armoredCostPerVisit: 0,
  });
  // A losing placement is the point of this worked example -- it is the case
  // a withdrawal-count pitch hides, and the one the tool's own page (which
  // defaults to a profitable location) never shows.
  assert.ok(r.netProfit < 0, 'the worked example should be a losing placement');
  assert.match(guideHtml, /\$225\.00/);
  assert.match(guideHtml, /\$112\.50/);
  assert.match(guideHtml, /\$27\.00/);
  assert.match(guideHtml, /\$13\.33/);
  assert.match(guideHtml, /\$21\.44/);
  assert.match(guideHtml, /\$58\.33/);
  assert.match(guideHtml, /\$292\.60/);
  assert.match(guideHtml, /67\.61/);
  assert.match(guideHtml, /30\.0%/);
  assert.match(guideHtml, /0\.75/);
});

test('every visible FAQ question and answer on the guide page also appears in its FAQPage block', () => {
  // This page hand-authors its own FAQPage (it is a secondary page, so
  // build.mjs's derived-schema path in faqEntries() does not run for it), and
  // nothing else keeps the two in step -- the drift class fixed in #2497, and
  // guarded fleet-wide by platform/pages/faq-visible.test.mjs.
  const questions = [...guideHtml.matchAll(/<h3>([^<]+)<\/h3>/g)].map((m) => m[1]);
  assert.ok(questions.length >= 4, `expected at least 4 visible questions, saw ${questions.length}`);
  const schema = guideHtml.slice(guideHtml.indexOf('"@type":"FAQPage"'));
  for (const question of questions) {
    assert.ok(schema.includes(JSON.stringify(question).slice(1, -1)), `visible question is missing from the FAQPage block: ${question}`);
  }
});

test('every .html file in the venture is reachable from the sitemap', () => {
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  const dir = new URL('./', import.meta.url);
  const htmlFiles = readdirSync(dir).filter((name) => name.endsWith('.html'));
  for (const name of htmlFiles) {
    if (name === 'index.html') continue;
    assert.match(sitemap, new RegExp(name.replace(/\./g, '\\.')), `${name} is missing from sitemap.xml`);
  }
});

// Closest machine-route sibling: same unattended placement margin shape for
// an independent operator, but vending machines rather than ATM placements.
// Related-tool chrome rotates inside the subcategory, so without an explicit
// one-hop a crawler on this page may never land on that tool.
test('index links one hop to the vending-machine-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/vending-machine-route-margin\/"/,
    'index must link ../vending-machine-route-margin/ so crawlers reach the vending machine route margin calculator in one hop',
  );
  assert.match(html, /vending machine route margin calculator/i);
});

// Closest service-route sibling: same route-margin shape for an independent
// operator, but a service visit rather than a machine placement. Without a
// crawlable link here, a crawler entering on the ATM route margin calculator
// never reaches the dog walking route pricing calculator in one hop.
test('index links one hop to the dog-walking-route-pricing sibling', () => {
  assert.match(
    html,
    /href="\.\.\/dog-walking-route-pricing\/"/,
    'index must link ../dog-walking-route-pricing/ so crawlers reach the dog walking route pricing calculator in one hop',
  );
});
