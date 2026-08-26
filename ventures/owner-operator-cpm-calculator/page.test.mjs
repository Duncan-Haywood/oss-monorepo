// Structural tests for the calculator page. calc.test.mjs never looks at the
// HTML, so it stays green when the page advertises a figure it does not
// render, or when a required control is renamed and the script silently
// stops updating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./deadhead-miles.html', import.meta.url), 'utf8');

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
    'loadedMiles', 'emptyMiles', 'mpg', 'dieselPrice',
    'truckPayment', 'insurance', 'permits', 'otherFixed',
    'maintenancePerMile', 'tiresPerMile', 'otherVariablePerMile',
    'factoringRate', 'offeredLoadedRate', 'targetWeeklyTakeHome',
    'hero', 'heroLabel', 'allInCpm',
    'deadheadShare', 'weeklyCost', 'verdict', 'copySummary', 'usageOptOut',
  ];
  for (const id of requiredIds) {
    assert.match(markup, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page script reads every input the calculator accepts', () => {
  const fields = [
    'loadedMiles', 'emptyMiles', 'mpg', 'dieselPrice',
    'truckPayment', 'insurance', 'permits', 'otherFixed',
    'maintenancePerMile', 'tiresPerMile', 'otherVariablePerMile',
    'factoringRate', 'offeredLoadedRate', 'targetWeeklyTakeHome',
  ];
  for (const field of fields) {
    assert.match(scriptSource, new RegExp(`'${field}'`), `script no longer lists ${field}`);
  }
  assert.match(scriptSource, /calculateWeek\(/);
  assert.match(scriptSource, /result\.breakEvenLoadedRate/);
  assert.match(scriptSource, /result\.allInCpm/);
  assert.match(scriptSource, /result\.offered/);
  assert.match(scriptSource, /result\.rateForTarget/);
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['All-in cost per mile', /result\.allInCpm/],
    ['break-even loaded rate', /result\.breakEvenLoadedRate/],
    ['factoring', /result\.offered\.effectiveLoadedRate/],
    ['weekly and annual profit', /result\.offered\.weeklyProfit/],
    ['target take-home', /result\.rateForTarget/],
    ['copyable load summary', /copySummary/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never uses ${rendered}`);
  }
});

test('null per-mile figures are rendered as a placeholder, not formatted', () => {
  assert.match(scriptSource, /value === null \? 'n\/a'/);
  assert.match(scriptSource, /result\.rateForTarget === null/);
  assert.match(scriptSource, /result\.breakEvenLoadedRate === null/);
});

test('the page carries a visible disclaimer and an off-switchable usage counter', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, financial, or business advice/i);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the deadhead explainer exists and points back at the calculator', () => {
  assert.match(markup, /deadhead-miles\.html/);
  assert.match(article, /href="\.\/"/);
  assert.match(article, /No warranty/);
  assert.match(article, /1,800 loaded miles and 450 empty miles/);
});
