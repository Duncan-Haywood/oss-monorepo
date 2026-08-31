import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = name => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');

test('calculator page is findable and usable without a build step', () => {
  const html = page('index.html');
  assert.match(html, /Siding Bid Calculator/);
  assert.match(html, /squares and the waste/i);
  assert.match(html, /calculateBid/);
  assert.match(html, /Copy quote summary/);
  assert.match(html, /Copy share link/);
  assert.match(html, /<script type="application\/ld\+json">/);
  assert.match(html, /No warranty/);
  assert.match(html, /Nothing leaves your browser/);
  assert.match(html, /Do not keep anonymous local usage counts/);
  assert.match(html, /github.com\/Duncan-Haywood\/monorepo-projects/);
  assert.match(html, /how-much-to-charge\.html/);
  assert.match(html, /engineering/);
});

test('SEO page answers the search question and does not claim a price table', () => {
  const html = page('how-much-to-charge.html');
  assert.match(html, /How much should I charge for vinyl siding/i);
  assert.match(html, /not a manufacturer price list/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
});

test('robots and sitemap let crawlers find both pages', () => {
  const robots = page('robots.txt');
  const sitemap = page('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap\.xml/);
  assert.match(sitemap, /siding-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge\.html/);
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

// The two features touch the same page from opposite directions: the share link
// deliberately carries the contractor's own rates, and the proposal deliberately
// carries the customer's name and address. Neither may pick up the other's
// payload. A share link that quietly included the customer's address would be a
// third party's personal data pasted into a URL and a chat app.
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
