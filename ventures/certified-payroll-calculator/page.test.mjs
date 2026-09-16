// Structural tests for the calculator page. calc.test.mjs never looks at the
// HTML, so it stays green when the page advertises a figure it does not
// render, or when a required control is renamed and the script silently
// stops updating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const article = readFileSync(new URL('./does-overtime-include-fringe-benefits-on-certified-payroll.html', import.meta.url), 'utf8');
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
    'classification', 'requiredBaseRate', 'requiredFringeRate', 'actualBaseRate',
    'bonaFideFringePerHour', 'cashFringePerHour', 'straightHours', 'overtimeHours',
    'approvedRatioApprentices', 'approvedRatioJourneymen', 'journeymenOnSite',
    'apprenticesOnSite', 'fullJourneymanRate', 'excessApprenticeHours',
    'hero', 'heroLabel', 'requiredTotalRate', 'actualTotalRate', 'straightRatePerHour',
    'otRatePerHour', 'totalCashWagesPaid', 'totalBonaFideFringeDue', 'totalCompensationPaid',
    'otUnderpaymentIfCashFringeExcluded', 'requiredGrossAtPrevailingWage', 'underpaymentTotal',
    'verdict', 'ratioVerdict', 'copySummary', 'copyShareLink', 'usageOptOut',
  ];
  for (const id of requiredIds) {
    assert.match(markup, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page script reads every numeric input the calculator accepts', () => {
  const fields = [
    'requiredBaseRate', 'requiredFringeRate', 'actualBaseRate', 'bonaFideFringePerHour',
    'cashFringePerHour', 'straightHours', 'overtimeHours', 'approvedRatioApprentices',
    'approvedRatioJourneymen', 'journeymenOnSite', 'apprenticesOnSite', 'fullJourneymanRate',
    'excessApprenticeHours',
  ];
  for (const field of fields) {
    assert.match(scriptSource, new RegExp(`'${field}'`), `script no longer lists ${field}`);
  }
  assert.match(scriptSource, /calculateCertifiedPayroll\(/);
  assert.match(scriptSource, /result\.shortfallPerHour/);
  assert.match(scriptSource, /result\.otRatePerHour/);
  assert.match(scriptSource, /result\.totalCompensationPaid/);
  assert.match(scriptSource, /result\.otUnderpaymentIfCashFringeExcluded/);
  assert.match(scriptSource, /result\.ratio/);
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['Prevailing wage compliance check', /result\.shortfallPerHour/],
    ['overtime computed correctly', /result\.otRatePerHour/],
    ['total weekly compensation and underpayment gap', /result\.underpaymentTotal/],
    ['apprentice-to-journeyman ratio check', /result\.ratio/],
    ['copyable weekly summary', /copySummary/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never uses ${rendered}`);
  }
});

test('the page carries a visible disclaimer and an off-switchable usage counter', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, payroll, or compliance advice/i);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the disclaimer names what the tool does not determine', () => {
  assert.match(markup, /does not determine whether a contract is covered/i);
  assert.match(markup, /which wage determination applies/i);
});

test('the overtime-fringe explainer exists and points back at the calculator', () => {
  assert.match(markup, /does-overtime-include-fringe-benefits-on-certified-payroll\.html/);
  assert.match(article, /href="\.\/"/);
  assert.match(article, /No warranty/);
});

test('the overtime-fringe explainer is listed in the sitemap', () => {
  assert.match(sitemap, /does-overtime-include-fringe-benefits-on-certified-payroll\.html/);
});

test('the ratio check clarifies it reports a count, not an automatic rate override', () => {
  assert.match(markup, /full journeyman rate/i);
  assert.match(scriptSource, /result\.ratio\.exceeded/);
});

// Closest sibling: a small contractor pursuing the public work that carries a
// wage determination in the first place. This venture graduated into the
// "More free tools" bucket with nothing linking to it, so without an explicit
// one-hop a crawler landing here could not reach the bid-readiness checker at
// all (platform/pages/siblings.mjs --check orphan class).
test("index links one hop to the contractor-bid-readiness sibling", () => {
  assert.match(
    html,
    /href="\.\.\/contractor-bid-readiness\/"/,
    'index must link ../contractor-bid-readiness/ so crawlers reach the bid readiness checker in one hop',
  );
  assert.match(html, /contractor bid readiness checker/i);
});

// Reciprocal of the link in overtime-pay-calculator's footer: closing a
// second crawlable-orphan pair the same way (platform/pages/siblings.mjs
// --check).
test("index links one hop to the overtime-pay-calculator sibling", () => {
  assert.match(
    html,
    /href="\.\.\/overtime-pay-calculator\/"/,
    'index must link ../overtime-pay-calculator/ so crawlers reach the overtime pay calculator in one hop',
  );
  assert.match(html, /overtime pay calculator/i);
});
