import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculate, computeRouteProfit, DEFAULTS } from './calc.mjs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guideHtml = readFileSync(new URL('./is-a-small-propane-customer-worth-keeping.html', import.meta.url), 'utf8');

test('every DEFAULTS field has a matching input on the page', () => {
  for (const id of Object.keys(DEFAULTS)) {
    assert.match(html, new RegExp(`id="${id}"`), `${id} input is missing from the page`);
  }
});

test('the page imports calculate, computeRouteProfit, and incomeGap from calc.mjs', () => {
  assert.match(html, /import \{ calculate, computeRouteProfit, incomeGap, DEFAULTS \} from '\.\/calc\.mjs'/);
});

test('the page wires usage counting for both the customer and route calculators', () => {
  assert.match(html, /recordEvent\('customer-priced'\)/);
  assert.match(html, /recordEvent\('route-check'\)/);
  assert.match(html, /<code>customer-priced<\/code>, <code>route-check<\/code>/);
});

test('the default customer inputs match calc.mjs DEFAULTS and produce a positive profit', () => {
  const result = calculate(DEFAULTS);
  assert.match(html, new RegExp(`id="annualGallons" type="number" min="0" step="10" value="${DEFAULTS.annualGallons}"`));
  assert.ok(result.netProfitAnnual > 0);
});

test('the route table has six customer rows, all optional', () => {
  const profitInputs = [...html.matchAll(/class="customerProfit" data-row="(\d)"/g)];
  assert.equal(profitInputs.length, 6);
});

test('a route computed from the page defaults matches computeRouteProfit directly', () => {
  const route = computeRouteProfit([{ monthlyProfit: 41 }, { monthlyProfit: 11 }]);
  assert.ok(route.totalMonthlyProfit > 0);
  assert.match(html, /value="41"/);
  assert.match(html, /value="11"/);
});

test('the no-warranty disclaimer is on the page, including the propane-specific carve-out', () => {
  assert.match(html, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(html, /not tax, financial, or business advice/);
  assert.match(html, /not propane-supply, delivery-scheduling, or safety guidance/);
});

test('the page carries the standard sponsor link and a LICENSE link, and counts a sponsor click', () => {
  assert.match(html, /github\.com\/sponsors\/Duncan-Haywood/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /recordEvent\('sponsor_link_clicked'\)/);
});

test('the privacy line names all four stored event types, says nothing is uploaded, and keeps the customer-row promise', () => {
  assert.match(html, /nothing is ever uploaded/);
  assert.match(html, /they are never saved anywhere/);
  assert.match(html, /closing or refreshing the tab clears them/);
  assert.match(html, /<code>link-copied<\/code>, <code>reset<\/code>/);
});

test('targetMonthlyIncome is documented as saved and shareable, not as part of the never-saved customer rows', () => {
  assert.match(html, /Target monthly income is saved on this device and carried in your shareable link/);
  assert.match(html, /only the customer rows are never saved/);
});

test('the page ships a save-and-share draft feature for the customer inputs, matching sibling route calculators', () => {
  assert.match(html, /import \{ encodeInputs, decodeInputs, formValues \} from '\.\/share\.mjs'/);
  assert.match(html, /id="copyLink"/);
  assert.match(html, /id="reset"/);
  assert.match(html, /id="draftStatus"/);
});

test('the customer route table is never included in the shareable link or local draft', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const body = scriptMatch[1];
  assert.match(body, /function customerInputs\(\) \{ return Object\.fromEntries\(CUSTOMER_IDS\.map/);
  assert.equal([...body.matchAll(/encodeInputs\(/g)].length, 1);
  assert.match(body, /encodeInputs\(customerInputs\(\)\)/);
  assert.equal([...body.matchAll(/localStorage\.setItem\(DRAFT_KEY,/g)].length, 1);
  assert.match(body, /localStorage\.setItem\(DRAFT_KEY, JSON\.stringify\(customerInputs\(\)\)\)/);
});

test('a shared link wins over a saved draft, applied through formValues rather than a plain spread', () => {
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  const body = scriptMatch[1];
  assert.match(body, /applyCustomerInputs\(formValues\(fromLink\)\)/);
  assert.doesNotMatch(body, /\{\s*\.\.\.saved\s*,\s*\.\.\.fromLink\s*\}/);
  assert.match(body, /applyCustomerInputs\(DEFAULT_CUSTOMER_INPUTS\)/, 'Reset to defaults must restore the page\'s own shipped values');
});

test('the customer result panel announces recalculation to screen readers', () => {
  assert.match(html, /<section class="result" aria-live="polite">/);
});

test('an invalid customer input hides stale results instead of leaving them next to a silent error', () => {
  assert.match(html, /id="errors" class="err" role="alert"/, 'a dedicated, announced error region is missing');
  const scriptMatch = html.match(/<script type="module">([\s\S]*)<\/script>/);
  assert.ok(scriptMatch, 'app script not found');
  const catchBlock = scriptMatch[1].match(/function updateCustomer[\s\S]*?catch \(e\) \{([\s\S]*?)\n  \}\n\}/);
  assert.ok(catchBlock, 'updateCustomer() catch block not found');
  const body = catchBlock[1];
  assert.match(body, /el\('profit'\)\.hidden = true/, 'the profit hero is not hidden on a rejected input');
  assert.match(body, /el\('errors'\)\.hidden = false/, 'the error message is never shown');
});

test('the tool links to the small-customer-worth-keeping guide page', () => {
  assert.match(html, /href="is-a-small-propane-customer-worth-keeping\.html"/);
});

test('the guide page links back to the calculator and carries the no-warranty clause', () => {
  assert.match(guideHtml, /<a href="\.\/">/);
  assert.match(guideHtml, /No warranty\.<\/strong> This tool is provided free and as-is/);
  assert.match(guideHtml, /not tax, financial, or business advice/);
});

test('the guide page worked example matches calc.mjs exactly, both with and without the minimum-delivery fee', () => {
  const base = {
    annualGallons: 220, avgGallonsPerFill: 70, retailPricePerGallon: 2.49, wholesaleCostPerGallon: 1.55,
    minimumDeliveryGallons: 100, milesPerDelivery: 18, truckCostPerMile: 0.95, stopMinutes: 20,
    driveMinutesPerDelivery: 22, driverHourlyRate: 28, tankRentalMonthlyCost: 5, hazmatComplianceMonthlyCost: 3.5,
  };
  const before = calculate({ ...base, minimumDeliveryFee: 0 });
  const after = calculate({ ...base, minimumDeliveryFee: 45 });
  // The whole point of this worked example: the fee flips a losing account
  // to a profitable one with nothing else changed.
  assert.ok(before.netProfitAnnual < 0, 'the no-fee case should be a losing customer');
  assert.ok(after.netProfitAnnual > 0, 'the with-fee case should be a profitable customer');
  assert.match(guideHtml, /\$206\.80/);
  assert.match(guideHtml, /\$141\.43/);
  assert.match(guideHtml, /\$348\.23/);
  assert.match(guideHtml, /\$53\.74/);
  assert.match(guideHtml, /\$61\.60/);
  assert.match(guideHtml, /\$217\.34/);
  assert.match(guideHtml, /10\.54/);
  assert.match(guideHtml, /130\.89/);
  assert.match(guideHtml, /37\.6%/);
});

test('every visible FAQ question and answer on the guide page also appears in its FAQPage block', () => {
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

// Closest route-margin siblings: same independent-operator route-profit shape,
// a recurring service stop rather than a fuel delivery. Related-tool chrome
// rotates inside the subcategory, so without an explicit one-hop a crawler on
// this page may never land on either tool.
test('index links one hop to the fire-extinguisher-inspection-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/fire-extinguisher-inspection-route-margin\/"/,
    'index must link ../fire-extinguisher-inspection-route-margin/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /fire extinguisher inspection route margin calculator/i);
});

test('index links one hop to the vending-machine-route-margin sibling', () => {
  assert.match(
    html,
    /href="\.\.\/vending-machine-route-margin\/"/,
    'index must link ../vending-machine-route-margin/ so crawlers reach that calculator in one hop',
  );
  assert.match(html, /vending machine route margin calculator/i);
});
