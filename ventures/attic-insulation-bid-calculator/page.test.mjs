import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Attic Insulation Bid Calculator/);
  assert.match(html, /R-value/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /how-much-to-charge\.html/);
  assert.match(html, /engineering/);
});

test('calculator page has a paper-friendly quote layout', () => {
  const html = page('index.html');
  assert.match(html, /@media print/);
  assert.match(html, /break-inside: avoid/);
  assert.match(html, /\.result \{/);
  assert.match(html, /\.result \{ break-inside: avoid; \}/);
});

test('SEO page answers the search question and does not claim a code table', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge for blown-in attic insulation/i);
  assert.match(html, /not an energy-code/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /attic-insulation-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
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

// Closest sibling: same insulation trade, but spray-foam board feet rather
// than blown-in attic bags. Related-tool chrome rotates inside the
// subcategory, so without an explicit one-hop a crawler on this page may never
// land on that tool.
test('index links one hop to the spray-foam-bid-calculator sibling', () => {
  const html = page('index.html');
  assert.match(
    html,
    /href="\.\.\/spray-foam-bid-calculator\/"/,
    'index must link ../spray-foam-bid-calculator/ so crawlers reach the spray-foam calculator in one hop',
  );
  assert.match(html, /spray foam bid calculator/i);
});
