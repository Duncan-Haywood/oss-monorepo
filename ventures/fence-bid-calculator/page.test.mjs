// Structural tests for index.html.
//
// calc.test.mjs stays green if the page never executes. These checks are
// dependency-free (no jsdom) so CI stays a plain `node --test`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

// ---- Share link -------------------------------------------------------------

test('a shared link is wired up: import, button, and load-time decode', () => {
  assert.match(proposalScript, /import\s*\{\s*encodeShare,\s*decodeShare\s*\}\s*from\s*'\.\/share\.mjs'/);
  assert.ok(proposalIds.has('copyShare'), 'missing #copyShare button');
  // The hash is split into the venture's own payload and the proposal's
  // pfterms segment (see proposal-terms.mjs) before either decoder sees it,
  // so a deposit or payment-terms clause typed into the panel does not fail
  // the venture's own JSON.parse and does not get silently dropped from the
  // link either.
  assert.match(proposalScript, /applyShare\(decodeShare\(incomingHash\.payload\)\)/,
    'an incoming share link is never decoded on load');
});

test('the proposal terms ride in the share link, not just the venture’s own fields', () => {
  assert.match(proposalScript, /from\s*'\.\/proposal-terms\.mjs'/,
    'proposal-terms.mjs is not imported; a deposit or payment-terms clause would silently drop from every shared link');
  assert.match(proposalScript, /withTerms\(encodeShare\(readInput\(\)\), terms\)/);
  assert.match(proposalScript, /splitTerms\(location\.hash\)/);
  assert.match(proposalScript, /applyTerms\(decodeTerms\(incomingHash\.terms\), el\)/);
  assert.match(proposalScript, /overlongTermsNote\(/,
    'a term that does not fit in the link must be named to the sender, not silently dropped');
});

test('decoding a share link marks hoursPerTearOutLf edited before any run is added', () => {
  // Regression: `addRunRow` -> `applyPreset` treats `hoursPerTearOutLf` as
  // run-owned. A run that matches a preset re-copies that preset's own
  // tear-out-hours figure over the page-level field, and a custom run (no
  // matching preset) blanks it to `undefined` outright -- either way
  // silently changing tear-out labor cost after a share link is opened,
  // caught by a live round trip: $11,664.73 became $11,165.53 with the
  // guard below removed. `dataset.edited` is the flag `applyPreset` already
  // honors for "the user set this on purpose"; a share-link value must set
  // it before `addRunRow` runs for any run, not after.
  const apply = /function applyShare\(payload\) \{([\s\S]*?)\n    \}/.exec(proposalScript);
  assert.ok(apply, 'no applyShare function');
  const markEdited = apply[1].indexOf("el('hoursPerTearOutLf').dataset.edited = '1'");
  const addsRuns = apply[1].indexOf('payload.runs.forEach(addRunRow)');
  assert.ok(markEdited !== -1, 'applyShare never marks hoursPerTearOutLf edited');
  assert.ok(addsRuns !== -1, 'applyShare never adds the shared runs');
  assert.ok(markEdited < addsRuns, 'hoursPerTearOutLf must be marked edited before runs are added, not after');
});

test('a run’s own rate and hours figures survive a share link even when its material matches a preset', () => {
  // Regression, the sibling of the hoursPerTearOutLf bug above: `addRunRow`
  // calls `applyPreset(row, MATERIAL_PRESETS[presetIndex] ?? run, true)`,
  // which -- whenever the run's material happens to match a preset by label
  // -- overwrites every one of the run's own materialPerLf, linePostCost,
  // terminalPostCost, walkGateCost, driveGateCost, concretePerPost,
  // hoursPerLf, hoursPerPost, hoursPerWalkGate and hoursPerDriveGate figures
  // with that preset's stock numbers. A sender who picked a preset and then
  // customized its rates (an ordinary edit; every one of those fields is a
  // plain number input) has a share link that reprices at the portfolio
  // preset's defaults on the recipient's screen instead. Caught live:
  // $3,359.27 became $5,710.23 with the restore below removed.
  const addRun = /function addRunRow\(run\) \{([\s\S]*?)\n    \}\n\n {4}function readRuns/.exec(proposalScript);
  assert.ok(addRun, 'no addRunRow function');
  const appliesPreset = addRun[1].indexOf('applyPreset(row, MATERIAL_PRESETS[presetIndex]');
  const restoresRates = addRun[1].indexOf('RUN_RATE_KEYS.forEach');
  assert.ok(appliesPreset !== -1, 'addRunRow no longer applies a matched preset the way this test expects');
  assert.ok(restoresRates !== -1,
    'addRunRow never restores the run’s own rate/hours figures after applyPreset overwrites them');
  assert.ok(appliesPreset < restoresRates,
    'the run’s own figures must be restored after applyPreset runs, not before');
  for (const key of ['materialPerLf', 'linePostCost', 'terminalPostCost', 'walkGateCost',
    'driveGateCost', 'concretePerPost', 'hoursPerLf', 'hoursPerPost', 'hoursPerWalkGate', 'hoursPerDriveGate']) {
    assert.match(proposalScript, new RegExp(`RUN_RATE_KEYS = \\[[^\\]]*'${key}'`),
      `${key} is missing from RUN_RATE_KEYS, so a shared run would still lose it to the matched preset`);
  }
});
