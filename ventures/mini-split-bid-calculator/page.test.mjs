import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const faq = readFileSync(new URL('./how-much-to-charge-to-install-a-mini-split.html', import.meta.url), 'utf8');

test('landing page names the installer problem and the calculator', () => {
  assert.match(page, /Bid the run and the circuit, not the head/);
  assert.match(page, /<title>Mini-Split Install Bid Calculator/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /not legal, tax, financial, engineering/);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Copy bid summary/);
});

// Closest sibling: same HVAC heating/cooling job, but a furnace or heat-pump
// swap rather than a ductless install. Related-tool chrome rotates inside the
// MEP subcategory, so without an explicit one-hop a crawler on this page may
// never land on that tool.
test('index links one hop to the furnace-bid-calculator sibling', () => {
  assert.match(
    page,
    /href="\.\.\/furnace-bid-calculator\/"/,
    'index must link ../furnace-bid-calculator/ so crawlers reach the furnace calculator in one hop',
  );
  assert.match(page, /furnace bid calculator/i);
});

test('FAQ page answers the search query and links back to the calculator', () => {
  assert.match(faq, /How much to charge to install a mini split/);
  assert.match(faq, /FAQPage/);
  assert.match(faq, /index.html/);
  assert.match(faq, /No warranty/);
});

test('default form values produce the same bid the page starts from', () => {
  const result = calculateBid({
    headCount: 1,
    btuPerHead: 12000,
    outdoorUnitCost: 1400,
    indoorHeadCostEach: 550,
    branchBoxCost: 0,
    lineSetFeet: 15,
    includedFeetPerHead: 15,
    lineSetMaterialPerExtraFoot: 12,
    hoursPerExtraTenFeet: 1,
    headTypeFactor: 1,
    storyFactor: 1,
    indoorHoursPerHead: 4,
    outdoorHours: 3,
    commissionHoursPerHead: 1,
    hourlyWage: 42,
    burdenRate: 30,
    electricalHours: 0,
    electricalMaterial: 0,
    condensateHours: 0,
    condensateMaterial: 0,
    permitFee: 175,
    travelAndLift: 85,
    overheadRate: 15,
    targetMargin: 22,
  });
  assert.ok(result.price > 3500 && result.price < 4500);
  assert.ok(result.pricePerHead > 3500 && result.pricePerHead < 4500);
  assert.match(page, /value="12000"/);
  assert.match(page, /value="1400"/);
});

// ---- Customer-facing proposal ----------------------------------------------
// These read index.html as text, so they cannot see whether the module parses;
// `platform/pages/check.mjs` covers that, and a browser pass covers the rest.
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

test('the proposal is priced from the calculator\u2019s own input reader', () => {
  // Three calculators in this batch call their reader `readInputs()`, and the
  // proposal shipped calling `readInput()` — undefined at runtime, so the
  // button did nothing and every text-level test stayed green.
  const reader = /calculateBid\((read[A-Za-z]*)\(\)\)/.exec(proposalScript);
  assert.ok(reader, 'the proposal does not price the job from a shared reader');
  assert.match(proposalScript, new RegExp(`function ${reader[1]}\\s*\\(`),
    `the proposal calls ${reader[1]}(), which this page does not define`);
});

test('the scope the customer reads carries no crew hours or costs', () => {
  const suggest = /function suggestScope\(result\) \{([\s\S]*?)\n    \}/.exec(proposalScript);
  assert.ok(suggest, 'no suggestScope; the proposal would open with an empty scope');
  for (const leak of [/laborCost/, /loadedWage/, /targetMargin/, /breakEven/, /\bprofit\b/, /totalCost/]) {
    assert.doesNotMatch(suggest[1], leak, `the drafted scope reads ${leak} off the result`);
  }
});

test('the proposal promises the customer\u2019s details are not stored', () => {
  assert.match(proposalMarkup, /customer&rsquo;s details are never saved|customer\u2019s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});

test('printing sends the customer sheet and hides the contractor\u2019s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(proposalMarkup);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. Hidden
  // outright rather than by an allow-list, so a cost field added later cannot
  // leak onto a customer's copy by omission.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});
