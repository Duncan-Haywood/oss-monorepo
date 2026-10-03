// Structural tests for the calculator page. calc.test.mjs never looks at the
// HTML, so it stays green when the page advertises a figure it does not
// render, or when a required control is renamed and the script silently
// stops updating.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const guide = readFileSync(new URL('./how-much-does-upwork-take.html', import.meta.url), 'utf8');
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
    'jobPrice', 'upworkFeePercent', 'fiverrFeePercent',
    'upworkWithdrawalFee', 'fiverrWithdrawalFee',
    'taxReservePercent', 'targetPlatform', 'targetTakeHome',
    'upworkHero', 'upworkFee', 'upworkTaxReserve', 'upworkTakeHome', 'upworkEffective',
    'fiverrHero', 'fiverrFee', 'fiverrTaxReserve', 'fiverrTakeHome', 'fiverrEffective',
    'verdict', 'target', 'priceNeeded',
    'copySummary', 'copyShareLink', 'usageOptOut',
  ];
  for (const id of requiredIds) {
    assert.match(markup, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page script reads every input the calculator accepts', () => {
  const fields = [
    'jobPrice', 'upworkFeePercent', 'fiverrFeePercent',
    'upworkWithdrawalFee', 'fiverrWithdrawalFee',
    'taxReservePercent', 'targetTakeHome',
  ];
  for (const field of fields) {
    assert.match(scriptSource, new RegExp(`'${field}'`), `script no longer lists ${field}`);
  }
  assert.match(scriptSource, /comparePlatforms\(/);
  assert.match(scriptSource, /result\.upwork/);
  assert.match(scriptSource, /result\.fiverr/);
  assert.match(scriptSource, /result\.comparison/);
  assert.match(scriptSource, /result\.target/);
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['Side-by-side Upwork and Fiverr net payout', /renderPlatform/],
    ['self-employment tax reserve', /taxReserve/],
    ['price needed to hit a take-home goal', /result\.target/],
    ['copyable comparison summary', /copySummary/],
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
  assert.match(markup, /not tax, financial, or legal advice/i);
  assert.match(markup, /usageOptOut/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /github\.com\/sponsors\/Duncan-Haywood/);
});

test('the page names Upwork and Fiverr but declares no affiliation', () => {
  assert.match(markup, /not\s+affiliated\s+with/i);
  assert.match(markup, /Upwork/);
  assert.match(markup, /Fiverr/);
});

test('the Upwork fee explainer exists and points back at the calculator', () => {
  assert.match(markup, /how-much-does-upwork-take\.html/);
  assert.match(guide, /href="\.\/"/);
  assert.match(guide, /No warranty/);
});

test('the Upwork fee explainer is listed in the sitemap', () => {
  assert.match(sitemap, /how-much-does-upwork-take\.html/);
});

// Mutual nearest topical match: both ventures serve independent freelancers
// pricing their own work, and neither linked the other before this.
test('index links one hop to the freelance-retainer-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/freelance-retainer-calculator\/"/,
    'index must link ../freelance-retainer-calculator/ so crawlers reach the retainer calculator in one hop',
  );
});

// Mutual nearest topical match on mechanism: both compare a seller's net
// payout across multiple platforms/channels for the same sale.
test('index links one hop to the marketplace-fee-compare sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/marketplace-fee-compare\/"/,
    'index must link ../marketplace-fee-compare/ so crawlers reach the multi-channel fee comparison in one hop',
  );
});

test('index links one hop to the upwork-connects-roi-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/upwork-connects-roi-calculator\/"/,
    'index must link ../upwork-connects-roi-calculator/ so crawlers reach the Connects ROI calculator in one hop',
  );
});
