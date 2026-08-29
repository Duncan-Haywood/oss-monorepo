import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-concrete-for-a-driveway.html', import.meta.url), 'utf8');

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

test('the page names the contractor problem before the form', () => {
  assert.match(markup, /Bid the yards and the forms/);
  assert.match(markup, /cubic yards/i);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not legal, tax, financial, engineering/);
  assert.match(markup, /Nothing leaves your browser/);
});

test('usage is opt-out and the off switch exists', () => {
  assert.match(markup, /id="usageOptOut"/);
  assert.match(scriptSource, /recordUsage/);
});

test('recurring drafts have visible local controls and aggregate events', () => {
  assert.match(markup, /id="saveDraft"/);
  assert.match(markup, /id="loadDraft"/);
  assert.match(markup, /id="clearDraft"/);
  assert.match(scriptSource, /draft_saved/);
  assert.match(scriptSource, /draft_loaded/);
  assert.match(scriptSource, /draft_cleared/);
});

test('saved drafts carry the deposit, valid-until, and customer/proposal-terms fields, not just the pricing inputs', () => {
  // The price restoring perfectly while the deposit split silently reverts
  // to the page default is the exact defect `platform/proposal/terms.mjs`
  // documents for shared bid links -- here it is the local "Save draft"
  // button instead of a link. `draftData()` must read CLIENT_IDS/TERM_IDS
  // (deposit %, valid days, customer name/address, payment terms, notes,
  // exclusions), and `loadDraft()` must write them back, or a contractor's
  // saved job reopens with the right price and the wrong money-on-acceptance.
  const draftDataFn = scriptSource.match(/function draftData\(\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(draftDataFn, 'draftData() not found');
  assert.match(draftDataFn[0], /CLIENT_IDS/, 'draftData() does not save the customer name/address fields');
  assert.match(draftDataFn[0], /TERM_IDS/, 'draftData() does not save the deposit/valid-days/terms fields');

  const loadDraftFn = scriptSource.match(/function loadDraft\(\)\s*\{[\s\S]*?\n    \}/);
  assert.ok(loadDraftFn, 'loadDraft() not found');
  assert.match(loadDraftFn[0], /draft\.proposal/, 'loadDraft() does not restore the saved proposal-terms fields');
});

test('figures named in schema.org featureList are actually rendered', () => {
  const featureList = html.match(/"featureList":\s*"([^"]+)"/);
  assert.ok(featureList, 'no schema.org featureList found');
  const claims = [
    ['walk-away price', /result\.breakEvenPrice/],
    ['price per square foot', /result\.pricePerSqFt/],
    ['price per cubic yard', /result\.pricePerYard/],
    ['effective hourly rate', /result\.effectiveHourlyRate/],
    ['proposed-price', /result\.proposed/],
    ['quarter-yard', /result\.orderedYards/],
  ];
  for (const [claim, rendered] of claims) {
    assert.ok(
      featureList[1].toLowerCase().includes(claim.toLowerCase()),
      `featureList no longer advertises "${claim}"`,
    );
    assert.match(scriptSource, rendered, `featureList advertises "${claim}" but the page never renders it`);
  }
});

test('null per-unit ratios are rendered as a placeholder, not formatted', () => {
  assert.match(scriptSource, /result\.pricePerSqFt === null/);
  assert.match(scriptSource, /result\.pricePerYard === null/);
  assert.match(scriptSource, /result\.effectiveHourlyRate === null/);
});

test('the satellite yardage page answers the search question and links back', () => {
  assert.match(seo, /How much concrete for a driveway/);
  assert.match(seo, /cubic yard/i);
  assert.match(seo, /index\.html/);
  assert.match(seo, /No warranty/);
  assert.match(seo, /slabVolumeCuYd/);
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
