// Structural tests for the calculator page. calc.test.mjs never looks at the
// HTML, so it stays green when the page advertises a figure it does not
// render, or when a required control is renamed and the script silently
// stops updating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./how-much-should-i-set-aside-for-gig-driving-taxes.html', import.meta.url), 'utf8');
const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');

function parse(source) {
  const RAW = /<(textarea|script|style)\b[^>]*>/i;
  let rest = source;
  let markup = '';
  const scripts = [];
  for (;;) {
    const open = rest.match(RAW);
    if (!open) return { markup: markup + rest, scripts, unclosed: null };
    const tag = open[1].toLowerCase();
    const contentStart = open.index + open[0].length;
    markup += rest.slice(0, contentStart);
    const closer = new RegExp(`</${tag}\\s*>`, 'i').exec(rest.slice(contentStart));
    if (!closer) return { markup, scripts, unclosed: tag };
    if (tag === 'script') scripts.push(rest.slice(contentStart, contentStart + closer.index));
    markup += closer[0];
    rest = rest.slice(contentStart + closer.index + closer[0].length);
  }
}

const { markup, scripts, unclosed } = parse(html);
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed`);
});

test('required inputs and result sinks exist in the markup', () => {
  const requiredIds = [
    'grossPay', 'milesDriven', 'hoursActive', 'mpg', 'gasPrice',
    'maintenancePerMile', 'insuranceMonthly', 'otherFixedMonthly', 'monthlyMiles',
    'taxReservePercent', 'comparisonHourlyWage', 'targetHourlyTakeHome',
    'hero', 'heroLabel', 'grossPerHour', 'grossPerMile', 'allInCostPerMile',
    'vehicleCost', 'netPerMile', 'netProfit', 'taxReserve', 'takeHome',
    'takeHomePerHour', 'takeHomePerMile', 'grossPayNeeded', 'verdict',
    'copySummary', 'copyShareLink', 'usageOptOut',
  ];
  for (const id of requiredIds) {
    assert.match(markup, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page script reads every input the calculator accepts', () => {
  const fields = [
    'grossPay', 'milesDriven', 'hoursActive', 'mpg', 'gasPrice',
    'maintenancePerMile', 'insuranceMonthly', 'otherFixedMonthly', 'monthlyMiles',
    'taxReservePercent', 'comparisonHourlyWage', 'targetHourlyTakeHome',
  ];
  for (const field of fields) {
    assert.match(scriptSource, new RegExp(`'${field}'`), `script no longer lists ${field}`);
  }
  assert.match(scriptSource, /calculateSession\(/);
  assert.match(scriptSource, /result\.netPerHour/);
  assert.match(scriptSource, /result\.vehicleCost/);
  assert.match(scriptSource, /result\.taxReserve/);
  assert.match(scriptSource, /result\.comparison/);
  assert.match(scriptSource, /result\.target/);
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['Net pay per hour and per mile', /result\.netPerHour/],
    ['monthly fixed cost prorated', /result\.vehicleCost/],
    ['self-employment tax reserve', /result\.taxReserve/],
    ['comparison against another hourly wage', /result\.comparison/],
    ['gross pay needed to hit a take-home goal', /result\.target/],
    ['copyable session summary', /copySummary/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never uses ${rendered}`);
  }
});

test('null per-hour and per-mile figures are rendered as a placeholder, not formatted', () => {
  assert.match(scriptSource, /value === null \? 'n\/a'/);
  assert.match(scriptSource, /result\.target === null \? 'n\/a'/);
});

test('the page carries a visible disclaimer and an off-switchable usage counter', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not tax, financial, or legal advice/i);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the tax-reserve explainer exists and points back at the calculator', () => {
  assert.match(markup, /how-much-should-i-set-aside-for-gig-driving-taxes\.html/);
  assert.match(article, /href="\.\/"/);
  assert.match(article, /No warranty/);
});

test('the tax-reserve explainer is listed in the sitemap', () => {
  assert.match(sitemap, /how-much-should-i-set-aside-for-gig-driving-taxes\.html/);
});

// Mutual nearest topical match: a personal-vehicle gig delivery / rideshare
// driver and a commercial-truck owner-operator are both self-employed driver
// economics tools, and neither linked the other before this. Without a
// crawlable link here, a crawler entering on this page never reaches the
// owner-operator page in one hop. See `platform/pages/siblings.mjs`.
test('index links one hop to the owner-operator-cpm-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/owner-operator-cpm-calculator\/"/,
    'index must link ../owner-operator-cpm-calculator/ so crawlers reach the owner-operator cost-per-mile calculator in one hop',
  );
});
