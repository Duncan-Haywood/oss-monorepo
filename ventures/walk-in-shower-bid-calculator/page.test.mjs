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
const seo = readFileSync(new URL('./how-much-to-charge-to-install-a-walk-in-shower.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-customer-supplied-tile.html', import.meta.url), 'utf8');
const scopeSeo = readFileSync(new URL('./should-i-match-an-alcove-price-on-a-curbless-walk-in.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-tile-a-walk-in-shower-after-hours.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareTileSupply/, 'tile-supply comparison is missing from the executable script');
  assert.match(scriptSource, /compareScope/, 'scope comparison is missing from the executable script');
  assert.match(scriptSource, /compareAccess/, 'access comparison is missing from the executable script');
  assert.match(scriptSource, /accessNote/, 'access note is missing from the executable script');
  assert.match(scriptSource, /formatBidSummary/, 'copy-summary helper is missing from the executable script');
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
    'wallTileSf', 'floorTileSf', 'bench', 'glass', 'linearDrain', 'curbless',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'copySummary', 'usageOptOut', 'jobPresets',
    'supply', 'supplyNote', 'scopes', 'scopeNote',
    'accessWindow', 'accessWindowNote',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Walk-In Shower Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*linear drain/i);
  assert.match(html, /Bid the drain, the slope, and the glass/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not plumbing, waterproofing, construction, legal, tax, or financial advice/i);
  assert.match(markup, /Best-effort hosting, no SLA/);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the landing page links the customer-supplied tile question', () => {
  assert.match(html, /should-i-install-customer-supplied-tile\.html/);
  assert.match(html, /who bought the tile/i);
});

test('the landing page links the alcove-vs-walk-in question', () => {
  assert.match(html, /should-i-match-an-alcove-price-on-a-curbless-walk-in\.html/);
  assert.match(html, /Same shop, four bathrooms/i);
});

test('the landing page links the Saturday / after-hours question', () => {
  assert.match(html, /should-i-tile-a-walk-in-shower-after-hours\.html/);
  assert.match(html, /Same shower, when you can work/i);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to install a walk-in shower/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /linear drain/i);
  assert.match(seo, /index\.html/);
  assert.match(seo, /should-i-install-customer-supplied-tile\.html/);
  assert.match(seo, /should-i-match-an-alcove-price-on-a-curbless-walk-in\.html/);
  assert.match(seo, /should-i-tile-a-walk-in-shower-after-hours\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the tile-supply SEO article answers the customer-supplied question', () => {
  assert.match(supplySeo, /Should I install customer-supplied tile/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$45/);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the scope SEO article answers the match-the-alcove question', () => {
  assert.match(scopeSeo, /Should I match an alcove price on a curbless walk-in/i);
  assert.match(scopeSeo, /FAQPage/);
  assert.match(scopeSeo, /linear drain/i);
  assert.match(scopeSeo, /index\.html/);
  assert.match(scopeSeo, /Best-effort hosting, no SLA/);
  assert.doesNotMatch(scopeSeo, /<textarea/i);
});

test('the after-hours article quotes the curbless walk-in and alcove Saturday arithmetic', () => {
  assert.match(accessSeo, /Should I tile a walk-in shower after hours/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$5,175/);
  assert.match(accessSeo, /\$11,061\.97/);
  assert.match(accessSeo, /\$12,821\.25/);
  assert.match(accessSeo, /\$15,363\.84/);
  assert.match(accessSeo, /\$7,418\.51/);
  assert.match(accessSeo, /\$903\.94/);
  assert.match(accessSeo, /time-and-a-half/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});

test('the customer-facing proposal has every field and control it needs', () => {
  for (const id of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'depositPercent', 'validDays',
    'proposalScope', 'proposalExclusions', 'paymentTerms', 'proposalNotes',
    'printProposal', 'forgetCompany', 'proposalStatus', 'proposalDoc',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
  assert.match(scriptSource, /buildProposal/, 'the proposal builder is missing from the executable script');
  assert.match(scriptSource, /renderProposalHtml/);
  assert.match(scriptSource, /window\.print\(\)/, 'nothing actually sends the proposal to the printer');
});

test('printing sends the customer sheet and hides the contractor’s own numbers', () => {
  const print = /@media print\s*\{([\s\S]*?)\n    \}/.exec(html);
  assert.ok(print, 'no print stylesheet; the browser would print the whole calculator');
  // The cost breakdown, wages, and margin all live inside <main>. If <main>
  // printed, the homeowner would receive the contractor's loaded labour rate.
  assert.match(print[1], /main[^;{]*\{?[^}]*display:\s*none/i,
    'the calculator UI is not excluded from the printed sheet');
  assert.match(print[1], /\.pr-shell\s*\{[^}]*display:\s*block/i,
    'the proposal is not shown on the printed sheet');
});

test('the proposal promises the customer’s details are not stored', () => {
  assert.match(markup, /customer&rsquo;s details are never saved|customer’s details are never saved/,
    'the privacy claim the module actually enforces should be stated on the page');
});
