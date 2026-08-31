import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { calculateBid } from './calc.mjs';

const page = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const faq = readFileSync(new URL('./how-much-to-charge-to-install-solar-panels.html', import.meta.url), 'utf8');

test('landing page names the installer problem and the calculator', () => {
  assert.match(page, /Bid the roof and the service, not the watts/);
  assert.match(page, /<title>Solar PV Install Bid Calculator/);
  assert.match(page, /application\/ld\+json/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /not legal, tax, financial, engineering/);
  assert.match(page, /usageOptOut/);
  assert.match(page, /Copy bid summary/);
});

test('FAQ page answers the search query and links back to the calculator', () => {
  assert.match(faq, /How much to charge to install solar panels/);
  assert.match(faq, /FAQPage/);
  assert.match(faq, /index.html/);
  assert.match(faq, /No warranty/);
});

test('default form values produce the same bid the page starts from', () => {
  const result = calculateBid({
    moduleCount: 26,
    wattsPerModule: 390,
    moduleCostEach: 140,
    inverterCost: 1800,
    rackingPerModule: 45,
    bosPerWatt: 0.18,
    roofFactor: 1,
    laborHoursPerKw: 10,
    hourlyWage: 38,
    burdenRate: 30,
    electricalHours: 0,
    electricalMaterial: 0,
    batteryHours: 0,
    batteryMaterial: 0,
    permitAndInterconnection: 850,
    designEngineering: 400,
    travelDumpsterLift: 250,
    overheadRate: 15,
    targetMargin: 20,
  });
  assert.ok(result.price > 20000 && result.price < 23000);
  assert.ok(result.pricePerWatt > 2 && result.pricePerWatt < 2.3);
  assert.match(page, /value="26"/);
  assert.match(page, /value="390"/);
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

test('printing sends the customer sheet and hides the contractor\u2019s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(proposalMarkup);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the customer would receive the contractor's loaded labour rate.
  // Hidden outright rather than by an allow-list, so a cost field added later
  // cannot leak onto a customer's copy by omission.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});

test('the scope the customer reads carries no crew hours or costs', () => {
  // suggestScope is written by hand per trade precisely so it cannot inherit
  // the pasted summary's SCOPE BASIS block, which lists crew-hour breakdowns.
  const suggest = /function suggestScope\(result\) \{([\s\S]*?)\n    \}/.exec(proposalScript);
  assert.ok(suggest, 'no suggestScope; the proposal would open with an empty scope');
  for (const leak of [/laborCost/, /loadedWage/, /\boverhead\b/, /targetMargin/, /breakEven/, /\bprofit\b/, /totalCost/]) {
    assert.doesNotMatch(suggest[1], leak, `the drafted scope reads ${leak} off the result`);
  }
});

test('the proposal promises the customer\u2019s details are not stored', () => {
  assert.match(proposalMarkup, /customer&rsquo;s details are never saved|customer\u2019s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});
