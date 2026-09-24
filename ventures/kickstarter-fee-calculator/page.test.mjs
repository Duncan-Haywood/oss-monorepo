import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateCampaign, calculatePledge, CAMPAIGN_INPUT_IDS, PLEDGE_INPUT_IDS } from './calc.mjs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const markup = page('index.html');
const ids = new Set([...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const script = /<script type="module">([\s\S]*)<\/script>/.exec(markup)[1];

test('calculator page is findable and usable without a build step', () => {
  assert.match(markup, /Kickstarter Fee Calculator/);
  assert.match(markup, /calculateCampaign/);
  assert.match(markup, /<script type="application\/ld\+json">/);
  assert.match(markup, /No warranty/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /Do not keep anonymous local usage counts/);
  assert.match(markup, /href="LICENSE"/);
  assert.match(markup, /not legal, tax, financial, or crowdfunding advice/);
  assert.match(markup, /not affiliated with, endorsed by, or sponsored by kickstarter/i);
});

test('every input the arithmetic reads exists on the form', () => {
  for (const id of [...CAMPAIGN_INPUT_IDS, ...PLEDGE_INPUT_IDS]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('every form number input is one the arithmetic knows about', () => {
  const known = new Set([...CAMPAIGN_INPUT_IDS, ...PLEDGE_INPUT_IDS, 'usageOptOut']);
  const formInputs = [...markup.matchAll(/<input id="([^"]+)"/g)].map(m => m[1]);
  for (const id of formInputs) {
    assert.ok(known.has(id), `#${id} is on the page but not read by calc.mjs`);
  }
});

test('every output slot the script writes exists in the markup', () => {
  for (const id of [
    'payoutOut', 'heroLabel', 'averagePledgeOut', 'tierOut', 'platformFeeOut',
    'processingFeeOut', 'totalFeeOut', 'effectiveRateOut', 'notes', 'errorList',
    'output', 'problems', 'exampleNote', 'pledgeResult', 'pledgeTierOut',
    'pledgePlatformOut', 'pledgeProcessingOut', 'pledgeNetOut', 'pledgeRateOut',
  ]) {
    assert.ok(ids.has(id), `missing #${id}`);
  }
});

test('results are written as text, never as markup', () => {
  assert.doesNotMatch(script, /innerHTML/);
  assert.match(script, /textContent/);
});

test('the calculator makes no network request of its own', () => {
  assert.doesNotMatch(script, /fetch\(|XMLHttpRequest|WebSocket/);
});

test('robots and sitemap let crawlers find the page', () => {
  const robots = page('robots.txt');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Sitemap: sitemap\.xml/);
  const sitemap = page('sitemap.xml');
  assert.match(sitemap, /kickstarter-fee-calculator\//);
});

test('the worked example on load matches calculateCampaign for the shipped defaults', () => {
  const result = calculateCampaign({ totalRaised: 10000, backerCount: 150 });
  assert.equal(result.ok, true);
  assert.match(markup, /value="10000"/);
  assert.match(markup, /value="150"/);
});

test('index links one hop to the stockx-seller-payout-calculator sibling', () => {
  assert.match(
    markup,
    /href="\.\.\/stockx-seller-payout-calculator\/"/,
    'index must link ../stockx-seller-payout-calculator/ so crawlers reach that calculator in one hop',
  );
  assert.match(markup, /StockX seller payout calculator/i);
});

test('the FAQPage JSON-LD questions match the visible FAQ headings', () => {
  const blocks = [...markup.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (m) => JSON.parse(m[1]),
  );
  const faq = blocks.find((b) => b['@type'] === 'FAQPage');
  assert.ok(faq, 'expected a FAQPage JSON-LD block');
  const headings = [...markup.matchAll(/<h3>(.*?)<\/h3>/g)].map((m) => m[1].trim());
  assert.ok(headings.length >= 3);
  const names = faq.mainEntity.map((q) => q.name);
  for (const heading of headings) {
    assert.ok(names.includes(heading), `visible heading not found in FAQPage JSON-LD: ${heading}`);
  }
});
