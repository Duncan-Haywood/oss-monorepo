import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const readme = readFileSync(new URL('./README.md', import.meta.url), 'utf8');

test('the landing page names the search phrase and refuses a code opinion', () => {
  assert.match(html, /EV Charger Installation Bid Calculator/);
  assert.match(html, /Level 2 EVSE/);
  assert.match(html, /application\/ld\+json/);
  // FAQPage schema is derived by platform/pages/build.mjs from these visible
  // <details><summary> pairs at build time, not authored in this source file
  // -- a hand-written block here would drift from the copy it describes.
  assert.match(html, /<section class="faq">/);
  assert.match(html, /<details>\s*<summary>/);
  assert.match(html, /not electrical, engineering, code/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /usageOptOut/);
  assert.match(html, /Do not keep anonymous local usage counts/);
});

test('the page wires the calculator, usage, and share modules', () => {
  assert.match(html, /from '\.\/calc\.mjs'/);
  assert.match(html, /from '\.\/usage\.mjs'/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /Copy bid summary/);
  assert.match(html, /Copy share link/);
});

test('the README carries the same disclaimer and the privacy line', () => {
  assert.match(readme, /not electrical, engineering, code/);
  assert.match(readme, /Nothing is uploaded/);
  assert.match(readme, /ev-charger-bid-usage/);
  assert.match(readme, /After using this, you can now/);
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

// This page prints two sheets: it printed the contractor's internal bid — cost,
// overhead, profit — before the proposal existed, and that is still a feature.
// Both directions need holding down: the customer's copy must not carry the
// calculator, and the contractor's copy must not carry the customer's proposal.
const printBlocks = [...proposalMarkup.matchAll(/@media print\s*\{/g)].map((match) => {
  // Brace-match rather than regex to the closing brace: these blocks contain
  // nested rules (and an @page), so a lazy `}` lands in the middle of one.
  let depth = 0;
  for (let i = match.index + match[0].length - 1; i < proposalMarkup.length; i += 1) {
    if (proposalMarkup[i] === '{') depth += 1;
    else if (proposalMarkup[i] === '}') {
      depth -= 1;
      // Comments stripped: each block's own comment explains the
      // `body.printing-proposal` rule by name, and a substring test that sees
      // it picks the wrong block.
      if (depth === 0) return proposalMarkup.slice(match.index, i + 1).replace(/\/\*[\s\S]*?\*\//g, '');
    }
  }
  return '';
});

test('the customer\u2019s printed sheet carries the proposal and none of the calculator', () => {
  const proposalPrint = printBlocks.find(block => block.includes('body.printing-proposal'));
  assert.ok(proposalPrint, 'no print rules for the customer sheet; it would print the whole calculator');
  assert.match(proposalPrint, /body\.printing-proposal main[\s\S]*?display:\s*none\s*!important/i,
    'the calculator UI is not excluded from the customer sheet');
  assert.match(proposalPrint, /body\.printing-proposal \.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the customer sheet');
});

test('the contractor\u2019s own printed sheet does not carry the customer proposal', () => {
  const internalPrint = printBlocks.find(block => !block.includes('body.printing-proposal'));
  assert.ok(internalPrint, 'the internal bid sheet lost its print rules');
  // Scoped by :not(), not left to specificity — a bare #proposalDoc is an id
  // selector and outranks the proposal rule, printing the customer copy blank.
  assert.match(internalPrint, /body:not\(\.printing-proposal\) #proposalDoc\s*\{[^}]*display:\s*none/i,
    'a previewed proposal would print stapled to the contractor\u2019s internal sheet');
});

test('the proposal flag is set for the customer sheet and cleared afterwards', () => {
  assert.match(proposalScript, /printProposal[\s\S]*?classList\.add\('printing-proposal'\)/,
    'nothing tells the stylesheet the customer sheet is the one printing');
  assert.match(proposalScript, /afterprint[\s\S]*?classList\.remove\('printing-proposal'\)/);
});

test('the local draft carries the deposit, valid-until, and customer/proposal-terms fields, not just the pricing inputs', () => {
  // The price restoring perfectly while the deposit split silently reverts to
  // the page default is the exact defect proposal-terms.mjs documents for
  // shared bid links -- here it is the local draft instead of a link.
  // persistDraft() must read CLIENT_IDS/TERM_IDS (deposit %, valid days,
  // customer name/address, payment terms, notes, exclusions) and
  // restoreDraft() must write them back, or a contractor's saved job reopens
  // with the right price and the wrong money-on-acceptance.
  const persistDraftFn = proposalMarkup.match(/function persistDraft\(\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(persistDraftFn, 'persistDraft() not found');
  assert.match(persistDraftFn[0], /CLIENT_IDS/, 'persistDraft() does not save the customer name/address fields');
  assert.match(persistDraftFn[0], /TERM_IDS/, 'persistDraft() does not save the deposit/valid-days/terms fields');

  const restoreDraftFn = proposalMarkup.match(/function restoreDraft\(\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(restoreDraftFn, 'restoreDraft() not found');
  assert.match(restoreDraftFn[0], /saved\.proposal/, 'restoreDraft() does not restore the saved proposal-terms fields');
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', () => {
  assert.match(html, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = readFileSync(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge to install an EV charger/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = readFileSync(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});
