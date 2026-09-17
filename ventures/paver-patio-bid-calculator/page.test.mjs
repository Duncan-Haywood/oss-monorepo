// Structural tests for index.html and the SEO article.
//
// calc.test.mjs stays green if the page never executes. These checks are
// dependency-free (no jsdom) so CI stays a plain `node --test`. They catch
// the class of defect that actually shipped on another calculator: an
// unclosed raw-text element that swallowed the app script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
const seo = readFileSync(new URL('./how-much-to-charge-for-a-paver-patio.html', import.meta.url), 'utf8');

const RAW_TEXT_ELEMENTS = ['textarea', 'script', 'style'];

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
const declaredIds = new Set([...markup.matchAll(/\bid="([\w-]+)"/g)].map((m) => m[1]));
const scriptSource = scripts.join('\n');

test('every raw-text element is closed', () => {
  assert.equal(unclosed, null, `<${unclosed}> is never closed; everything after it is swallowed as text instead of parsed as markup`);
  for (const tag of RAW_TEXT_ELEMENTS) {
    const opened = (html.match(new RegExp(`<${tag}[\\s>]`, 'gi')) || []).length;
    const closed = (html.match(new RegExp(`</${tag}\\s*>`, 'gi')) || []).length;
    assert.equal(opened, closed, `<${tag}> is opened ${opened}x but closed ${closed}x`);
  }
});

test('the module script survives parsing and would actually execute', () => {
  assert.match(markup, /<script type="module">/, 'the app script tag is missing or was swallowed by an earlier element');
  assert.match(scriptSource, /calculateBid/, 'the app script did not parse as a script element');
  assert.match(scriptSource, /formatBidSummary/, 'copy-summary helper is missing from the executable script');
  assert.match(scriptSource, /encodeShare/, 'share-link encoder is missing from the executable script');
  assert.match(scriptSource, /decodeShare/, 'share-link decoder is missing from the executable script');
});

// The deposit percentage and how long the price is held are proposal terms,
// not bid inputs -- share.mjs's SHARE_FIELDS deliberately excludes them (see
// the "carries no customer or business details" test below). Without this
// wiring a copied link silently reopened the venture's defaults for both, so
// a shared bid's headline price matched to the cent while the deposit amount
// on the printed proposal did not. See proposal-terms.mjs.
test('the deposit and price-hold terms travel with a shared link', () => {
  assert.match(scriptSource, /from '\.\/proposal-terms\.mjs'/, 'proposal-terms.mjs is not imported');
  assert.match(scriptSource, /withTerms\(encodeShare\(readInput\(\)\), terms\)/, 'copyShare does not fold the terms into the link it copies');
  assert.match(scriptSource, /applyTerms\(decodeTerms\(incoming\.terms\), el\)/, 'a link opened on load does not restore the deposit and price-hold terms');
});

test('every element the script reaches for exists in the markup', () => {
  const wanted = new Set([
    ...[...scriptSource.matchAll(/el\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
    ...[...scriptSource.matchAll(/getElementById\(\s*'([\w-]+)'\s*\)/g)].map((m) => m[1]),
  ]);
  assert.ok(wanted.size > 0, 'no element lookups found; the script probably did not parse');
  const missing = [...wanted].filter((id) => !declaredIds.has(id));
  assert.deepEqual(missing, [], `script queries ids that no element declares: ${missing.join(', ')}`);
});

test('inputs and result fields for the primary journey are present', () => {
  for (const id of [
    'lengthFeet', 'widthFeet', 'patternId', 'useId', 'wastePct', 'baseDepthIn',
    'haulAway', 'hourlyWage', 'targetMargin', 'proposedPrice', 'price',
    'breakEven', 'copySummary', 'copyShare', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Paver Patio Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*pattern waste/i);
  assert.match(html, /Bid the base and the waste/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not engineering, construction, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge for a paver patio/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /pattern waste/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
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

// The two features touch the same page from opposite directions: the share
// link deliberately carries the contractor's own rates, and the proposal
// deliberately carries the customer's name and address. Neither may pick up
// the other's payload -- a share link that quietly included the homeowner's
// address would be a third party's personal data pasted into a URL and
// whatever chat app it gets sent through.
test('a shared bid link carries no customer or business details', () => {
  const share = readFileSync(new URL('./share.mjs', import.meta.url), 'utf8');
  const spec = /export const SHARE_FIELDS = Object\.freeze\(\[[\s\S]*?\]\);/.exec(share);
  assert.ok(spec, 'SHARE_FIELDS not found; the share wiring changed shape');
  for (const field of [
    'clientName', 'clientAddress',
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'proposalScope', 'proposalNotes', 'proposalExclusions', 'paymentTerms',
    'depositPercent', 'validDays',
  ]) {
    assert.doesNotMatch(spec[0], new RegExp(`\\b${field}\\b`),
      `${field} would be written into the shareable link`);
  }
});

test('a share link is offered and the privacy claim names it', () => {
  assert.match(html, /Copy share link/);
  assert.match(markup, /share link encodes only the quote fields/i);
});

// Closest sibling: the same hardscape job: a patio cut into a slope needs the wall priced too. Related-tool chrome rotates inside the
// Concrete, masonry & site work subcategory, so without an explicit one-hop a crawler on this page
// may never land on that tool.
test('index links one hop to the retaining-wall-bid-calculator sibling', () => {
  const siblingPage = readFileSync(new URL('./index.html', import.meta.url), 'utf8');
  assert.match(
    siblingPage,
    /href="\.\.\/retaining-wall-bid-calculator\/"/,
    'index must link ../retaining-wall-bid-calculator/ so crawlers reach it in one hop',
  );
  assert.match(siblingPage, /retaining wall bid calculator/i);
});
