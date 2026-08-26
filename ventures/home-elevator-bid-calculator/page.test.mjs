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
const seo = readFileSync(new URL('./how-much-to-charge-to-install-a-home-elevator.html', import.meta.url), 'utf8');
const supplySeo = readFileSync(new URL('./should-i-install-a-customer-supplied-home-elevator.html', import.meta.url), 'utf8');
const cabSeo = readFileSync(new URL('./acrylic-vs-glass-home-elevator-cab.html', import.meta.url), 'utf8');
const accessSeo = readFileSync(new URL('./should-i-expedite-a-home-elevator-for-hospital-discharge.html', import.meta.url), 'utf8');

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
  assert.match(scriptSource, /compareDrive/, 'drive comparison is missing from the executable script');
  assert.match(scriptSource, /compareHoistway/, 'hoistway comparison is missing from the executable script');
  assert.match(scriptSource, /compareCab/, 'cab comparison is missing from the executable script');
  assert.match(scriptSource, /cabNote/, 'cab verdict is missing from the executable script');
  assert.match(scriptSource, /compareOwnerSupply/, 'owner-supply comparison is missing from the executable script');
  assert.match(scriptSource, /ownerSupplyNote/, 'owner-supply verdict is missing from the executable script');
  assert.match(scriptSource, /compareAccess/, 'access comparison is missing from the executable script');
  assert.match(scriptSource, /accessNote/, 'access verdict is missing from the executable script');
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
    'drive', 'hoistway', 'cab', 'stops', 'travelFeet', 'travelMiles',
    'hourlyWage', 'targetMargin', 'proposedPrice',
    'price', 'breakEven', 'compare', 'drives', 'cabs', 'cabNote', 'supply', 'supplyNote', 'access', 'accessNote', 'copySummary', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Home Elevator Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*home elevator/i);
  assert.match(html, /Bid the stops, the shaft, and the extras/);
  assert.match(html, /SoftwareApplication/);
  assert.match(html, /Same house, four drives/);
  assert.match(html, /vs pneumatic/);
  assert.match(html, /Same house, four cabs/);
  assert.match(html, /vs acrylic/);
  assert.match(html, /Same house, who bought the unit/);
  assert.match(html, /Same house, when they need it/);
});

test('the access article answers the search phrase and stays crawlable', () => {
  assert.match(accessSeo, /Should I Expedite a Home Elevator for Hospital Discharge/i);
  assert.match(accessSeo, /FAQPage/);
  assert.match(accessSeo, /\$28,108\.09/);
  assert.match(accessSeo, /\$32,645\.87/);
  assert.match(accessSeo, /\$4,537\.78/);
  assert.match(accessSeo, /\$35,919\.76/);
  assert.match(accessSeo, /\$7,811\.66/);
  assert.match(accessSeo, /\$18,995/);
  assert.match(accessSeo, /\$28,735\.80/);
  assert.match(accessSeo, /\$627\.80/);
  assert.match(accessSeo, /\$87,736\.52/);
  assert.match(accessSeo, /\$82,728\.95/);
  assert.match(accessSeo, /not a stair-lift rail/i);
  assert.match(accessSeo, /index\.html/);
  assert.match(accessSeo, /No warranty/);
  assert.match(accessSeo, /no SLA/i);
  assert.doesNotMatch(accessSeo, /<textarea/i);
});

test('the landing page links the hospital-discharge access question', () => {
  assert.match(html, /should-i-expedite-a-home-elevator-for-hospital-discharge\.html/);
});

test('the cab article answers the search phrase and stays crawlable', () => {
  assert.match(cabSeo, /Acrylic vs glass home elevator cab/i);
  assert.match(cabSeo, /FAQPage/);
  assert.match(cabSeo, /\$28,108\.09/);
  assert.match(cabSeo, /\$36,462\.61/);
  assert.match(cabSeo, /\$8,354\.52/);
  assert.match(cabSeo, /\$29,170\.09/);
  assert.match(cabSeo, /\$1,062\.00/);
  assert.match(cabSeo, /index\.html/);
  assert.match(cabSeo, /No warranty/);
  assert.match(cabSeo, /no SLA/i);
  assert.doesNotMatch(cabSeo, /<textarea/i);
});

test('the landing page links the acrylic-versus-glass cab question', () => {
  assert.match(html, /acrylic-vs-glass-home-elevator-cab\.html/);
});

test('the owner-supply article answers the search phrase and stays crawlable', () => {
  assert.match(supplySeo, /Should I install a customer-supplied home elevator/i);
  assert.match(supplySeo, /FAQPage/);
  assert.match(supplySeo, /\$4,995/);
  assert.match(supplySeo, /\$6,995/);
  assert.match(supplySeo, /\$5,811/);
  assert.match(supplySeo, /\$9,226/);
  assert.match(supplySeo, /wrong opening/i);
  assert.match(supplySeo, /index\.html/);
  assert.match(supplySeo, /No warranty/);
  assert.match(supplySeo, /no SLA/i);
  assert.doesNotMatch(supplySeo, /<textarea/i);
});

test('the landing page links the customer-supplied unit question', () => {
  assert.match(html, /should-i-install-a-customer-supplied-home-elevator\.html/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not elevator-specification, structural, building-code, accessibility, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to install a home elevator/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /pneumatic/i);
  assert.match(seo, /Pneumatic versus hydraulic on the same house/i);
  assert.match(seo, /index\.html/);
  assert.match(seo, /should-i-install-a-customer-supplied-home-elevator\.html/);
  assert.match(seo, /acrylic-vs-glass-home-elevator-cab\.html/);
  assert.match(seo, /should-i-expedite-a-home-elevator-for-hospital-discharge\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

test('the bid link is wired into the page', () => {
  // The link is what lets a contractor come back to a bid tomorrow, or hand
  // it to whoever prices with them. Losing any one of these four pieces
  // breaks that quietly: the button disappears, or it copies a URL nothing
  // reads back.
  assert.match(html, /id="copyBidLink"/);
  assert.match(html, /from '\.\/share\.mjs'/);
  assert.match(html, /restoreSharedBid\(\)/);
  assert.match(html, /bid_link_copied/);
  assert.match(html, /bid_link_opened/);
  // The privacy claim on the page has to stay true: the fragment is the only
  // place the numbers may go, because a query string reaches the server.
  assert.match(html, /never send to a server/);
});
