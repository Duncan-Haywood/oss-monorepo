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

test('a run’s own cost and labor figures survive being rebuilt, not just its shape', () => {
  // Regression caught by platform/pages/roundtrip.mjs: `addRunRow` matches a
  // run's `name` against MATERIAL_PRESETS and, on a match, called
  // `applyPreset(row, MATERIAL_PRESETS[presetIndex], true)` -- the *preset's*
  // default material cost, post costs, and labor hours, discarding whatever
  // the run itself carried. Every run created through the type dropdown
  // matches a preset by name, so a setter who edits a preset's numbers to
  // their own supplier costs saw that edit silently revert to the venture's
  // default the moment the row was rebuilt from a share link -- a run this
  // test names dropped 10 fields and moved the headline price by $2,350.96.
  const addRun = /function addRunRow\(run\) \{([\s\S]*?)\n    \}/.exec(proposalScript);
  assert.ok(addRun, 'no addRunRow function');
  assert.match(addRun[1], /RUN_COST_KEYS/,
    'addRunRow no longer overlays a run’s own cost figures onto the matched preset');
  assert.doesNotMatch(addRun[1], /applyPreset\(row, MATERIAL_PRESETS\[presetIndex\] \?\? run, true\)/,
    'reverted to applying the bare preset over a reconstructed run’s own costs');
});

test('restoring a run’s own hours marks the row edited, so a later material change can’t re-clobber them', () => {
  // A run's hours are a labor estimate tied to the job site (rocky ground,
  // an awkward gate location), not to which material was picked, which is
  // why a hand-typed hours figure is protected from `applyPreset`'s
  // overwrite via `row.dataset.hoursEdited` (see the `r-hours*` input
  // listener below). A run restored from a share link with its own hours
  // starts that protection unset, so a recipient who merely tries a
  // different material in the dropdown afterward would see the sender's
  // customized hours silently replaced by that preset's stock hours.
  const addRun = /function addRunRow\(run\) \{([\s\S]*?)\n    \}/.exec(proposalScript);
  assert.ok(addRun, 'no addRunRow function');
  assert.match(addRun[1], /HOURS_KEYS\.some\(key => run\[key\]/,
    'a restored run’s hours never mark the row edited, so a later material change can wipe them out');
  assert.match(addRun[1], /row\.dataset\.hoursEdited = '1'/);
});
