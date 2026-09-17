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
const seo = readFileSync(new URL('./how-much-to-charge-to-refinish-hardwood-floors.html', import.meta.url), 'utf8');

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
    'floorSqFt', 'treads', 'closets', 'methodId', 'stainId',
    'hoursPer100', 'staining', 'hourlyWage', 'targetMargin',
    'proposedPrice', 'price', 'breakEven', 'copySummary', 'copyShare', 'usageOptOut', 'jobPresets',
  ]) {
    assert.ok(declaredIds.has(id), `missing #${id}`);
  }
});

test('the module script wires up the shareable-link encoder and decoder', () => {
  assert.match(scriptSource, /encodeInputs/, 'share-link encoder is missing from the executable script');
  assert.match(scriptSource, /decodeInputs/, 'share-link decoder is missing from the executable script');
});

// The proposal feature (customer name, address, business details) and the
// share-link feature touch the same page from opposite directions: the
// identity fields below must persist per device and the share link must not
// carry them, or a shared link would leak a customer's name and address to
// whoever it was pasted to. share.mjs's own field lists are the source of
// truth (see share.test.mjs); this just double-checks none of the PII ids
// ever appear there.
//
// The deposit, validity window and the three proposal-term textareas are
// deliberately not in this list: they describe the job's money terms, not
// the customer's identity, and `platform/proposal/term-ids.test.mjs` checks
// the opposite property for those five -- that every venture with the
// proposal panel *does* carry them, so a recipient does not open a shared
// link under this venture's own default deposit and validity window. They
// used to be listed here too, which is why they were missing from the link.
test('a shared bid link carries no customer or business details', () => {
  const share = readFileSync(new URL('./share.mjs', import.meta.url), 'utf8');
  for (const field of [
    'companyName', 'companyPhone', 'companyEmail', 'companyLicense', 'companyAddress',
    'clientName', 'clientAddress', 'proposalScope',
  ]) {
    assert.doesNotMatch(share, new RegExp(`'${field}'`), `${field} would be written into the shareable link`);
  }
});

test('a share link is offered and the privacy claim names it', () => {
  assert.match(html, /Copy share link/);
  assert.match(markup, /share link encodes only the bid fields/i);
});

test('the landing page names the problem in the contractor\'s words', () => {
  assert.match(html, /<title>[^<]*Hardwood Refinishing Bid Calculator/i);
  assert.match(html, /meta name="description"[^>]*stair treads/i);
  assert.match(html, /Bid the stairs, the closets, and the stain/);
  assert.match(html, /SoftwareApplication/);
});

test('disclaimer and privacy line are visible, not only in the README', () => {
  assert.match(markup, /No warranty/);
  assert.match(markup, /not flooring, construction, legal, tax, or financial advice/i);
  assert.match(markup, /Nothing leaves your browser/);
  assert.match(markup, /usageOptOut/);
});

test('the SEO article answers the search phrase and stays crawlable', () => {
  assert.match(seo, /How much to charge to refinish hardwood floors/i);
  assert.match(seo, /FAQPage/);
  assert.match(seo, /HowTo/);
  assert.match(seo, /stair treads/i);
  assert.match(seo, /index\.html/);
  assert.doesNotMatch(seo, /<textarea/i);
});

// Closest sibling: same interior-refinish shop job, but cabinets rather than
// hardwood floors. Without a crawlable link here, a crawler entering on the
// hardwood calculator never reaches the cabinet tool in one hop — same one-way
// orphan class as #3709 / #3729 / #3743.
test('index links one hop to the cabinet-refinishing-bid-calculator sibling', () => {
  assert.match(
    html,
    /href="\.\.\/cabinet-refinishing-bid-calculator\/"/,
    'index must link ../cabinet-refinishing-bid-calculator/ so crawlers reach the cabinet calculator in one hop',
  );
});
