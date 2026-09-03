import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Window Replacement Bid Calculator/);
  assert.match(html, /United Inches|united inches|width/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /Print quote/);
  assert.match(html, /@media print/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /href="LICENSE"/);
  assert.match(html, /how-much-to-charge\.html/);
  assert.match(html, /vs-marketsharp\.html/);
  assert.match(html, /engineering/);
});

test('SEO page answers the search question and does not claim a code table', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge to replace windows/i);
  assert.match(html, /not a building-code/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /window-replacement-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
  assert.match(sitemap, /vs-marketsharp\.html/);
});

const proposalMarkup = page('index.html');
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

// This page prints two different sheets. Unlike the other calculators carrying a
// proposal, it printed an internal bid sheet before the proposal existed, and
// that sheet deliberately shows cost, overhead and profit. So the two are kept
// apart by a body class instead of one replacing the other, and both directions
// need holding down: the customer's copy must not carry the calculator, and the
// contractor's copy must not carry the customer's proposal.
const printBlocks = [...proposalMarkup.matchAll(/@media print\s*\{/g)]
  .map(match => {
    // Brace-match rather than regex to the closing brace: these blocks contain
    // nested rules (and an @page), so a lazy `}` lands in the middle of one.
    let depth = 0;
    for (let i = match.index + match[0].length - 1; i < proposalMarkup.length; i += 1) {
      if (proposalMarkup[i] === '{') depth += 1;
      else if (proposalMarkup[i] === '}') {
        depth -= 1;
        // Comments stripped: the internal block's own comment explains the
        // `body.printing-proposal` rule by name, and a substring test that sees
        // it picks the wrong block.
        if (depth === 0) return proposalMarkup.slice(match.index, i + 1).replace(/\/\*[\s\S]*?\*\//g, '');
      }
    }
    return '';
  });

test('the customer’s printed sheet carries the proposal and none of the calculator', () => {
  // `body.printing-proposal`, not the bare slug: the internal block also names
  // the class, in a `:not()` that scopes it away from the customer sheet.
  const proposalPrint = printBlocks.find(block => block.includes('body.printing-proposal'));
  assert.ok(proposalPrint, 'no print rules for the customer sheet; it would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the customer would receive the contractor's loaded labour rate.
  // Hidden outright rather than by an allow-list, so a cost field added to the
  // calculator later cannot leak onto a customer's copy by omission.
  assert.match(proposalPrint, /body\.printing-proposal main[\s\S]*?display:\s*none\s*!important/i,
    'the calculator UI is not excluded from the customer sheet');
  assert.match(proposalPrint, /body\.printing-proposal \.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the customer sheet');
});

test('the contractor’s own printed sheet does not carry the customer proposal', () => {
  const internalPrint = printBlocks.find(block => !block.includes('body.printing-proposal'));
  assert.ok(internalPrint, 'the internal bid sheet lost its print rules');
  assert.match(internalPrint, /body:not\(\.printing-proposal\) #proposalDoc\s*\{[^}]*display:\s*none/i,
    'a previewed proposal would print stapled to the contractor’s internal sheet');
});

test('the proposal flag is cleared for the contractor’s own sheet', () => {
  // `afterprint` is not guaranteed when the user cancels the dialogue, so the
  // internal print path clears the flag itself. Without this, a cancelled
  // proposal print silently turns every later Ctrl+P into the customer sheet.
  assert.match(proposalScript, /printQuote[\s\S]*?classList\.remove\('printing-proposal'\)/,
    'the internal print path does not clear the proposal flag');
  assert.match(proposalScript, /afterprint[\s\S]*?classList\.remove\('printing-proposal'\)/);
});

test('the proposal promises the customer’s details are not stored', () => {
  assert.match(proposalMarkup, /customer&rsquo;s details are never saved|customer’s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});
