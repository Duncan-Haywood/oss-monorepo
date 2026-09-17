import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const faq = readFileSync(new URL('./how-much-to-charge-for-a-retaining-wall.html', import.meta.url), 'utf8');

test('landing page names the contractor problem and the calculator', () => {
  assert.match(page, /Bid the height and the drain, not the linear foot/);
  assert.match(page, /<title>Retaining Wall Bid Calculator/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /not legal, tax, financial, engineering/);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Copy bid summary/);
});

test('FAQ page answers the search query and links back to the calculator', () => {
  assert.match(faq, /How much to charge for a retaining wall/);
  assert.match(faq, /FAQPage/);
  assert.match(faq, /index.html/);
  assert.match(faq, /No warranty/);
});

test('default form values produce the same bid the page starts from', () => {
  const result = calculateBid({
    lengthFeet: 40,
    exposedHeightFeet: 3,
    embedmentFeet: 0.67,
    blockCostPerSf: 12,
    capCostPerFoot: 8,
    stoneCostPerCuYd: 55,
    stoneDepthFeet: 1,
    drainPipeCostPerFoot: 4,
    geogridLayers: 0,
    geogridDepthFeet: 6,
    geogridCostPerSqYd: 4,
    wallTypeFactor: 1,
    heightFactor: 1,
    hoursPerFaceSqFt: 0.1,
    corners: 0,
    hoursPerCorner: 1.5,
    excavationHours: 4,
    drainHours: 2,
    hourlyWage: 38,
    burdenRate: 30,
    engineerAndPermitFee: 0,
    travelAndEquipment: 150,
    overheadRate: 15,
    targetMargin: 22,
  });
  assert.ok(result.price > 4500 && result.price < 7500);
  assert.ok(result.pricePerFoot > 110 && result.pricePerFoot < 190);
  assert.match(page, /value="40"/);
  assert.match(page, /value="0.67"/);
});

const proposalMarkup = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const proposalIds = new Set([...proposalMarkup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
const proposalScript = /<script type="module">([\s\S]*)<\/script>/.exec(proposalMarkup)[1];

test('the customer-facing proposal has every field and control it needs', () => {
  for (const id of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'depositPercent', 'validDays',
    'proposalScope', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
    'printProposal', 'forgetCompany', 'proposalStatus', 'proposalDoc',
  ]) {
    assert.ok(proposalIds.has(id), `missing #${id}`);
  }
  assert.match(proposalScript, /buildProposal/, 'the proposal builder is missing from the executable script');
  assert.match(proposalScript, /renderProposalHtml/);
  assert.match(proposalScript, /window\.print\(\)/, 'nothing actually sends the proposal to the printer');
});

test('printing sends the customer sheet and hides the contractor\u2019s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(proposalMarkup);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the customer would receive the contractor's loaded labour rate.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});

test('the proposal promises the customer\u2019s details are not stored', () => {
  assert.match(proposalMarkup, /customer&rsquo;s details are never saved|customer\u2019s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});

// Closest sibling: the same hardscape job: the wall exists to make a patio flat. Related-tool chrome rotates inside the
// Concrete, masonry & site work subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the paver-patio-bid-calculator sibling', () => {
  const siblingPage = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    siblingPage,
    /href="\.\.\/paver-patio-bid-calculator\/"/,
    'index must link ../paver-patio-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(siblingPage, /paver patio bid calculator/i);
});
