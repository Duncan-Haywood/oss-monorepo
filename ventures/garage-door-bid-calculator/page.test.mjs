import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const index = readFileSync(join(root, 'index.html'), 'utf8');
const replacePage = readFileSync(join(root, 'how-much-to-charge-to-replace-a-garage-door.html'), 'utf8');
const springPage = readFileSync(join(root, 'how-much-to-charge-for-a-broken-spring.html'), 'utf8');
const robots = readFileSync(join(root, 'robots.txt'), 'utf8');
const sitemap = readFileSync(join(root, 'sitemap.xml'), 'utf8');

test('landing page names the niche problem and is crawlable', () => {
  assert.match(index, /<title>Garage Door Bid Calculator/);
  assert.match(index, /name="description"/);
  assert.match(index, /application\/ld\+json/);
  assert.match(index, /SoftwareApplication/);
  assert.match(index, /\$189 spring special/);
  assert.match(index, /16×7 is not two 8×7s/);
  assert.match(index, /Nothing leaves your browser/);
  assert.match(index, /No warranty/);
  assert.match(index, /not legal, tax, financial, engineering/);
  assert.match(index, /usageOptOut/);
  assert.match(index, /Copy bid summary/);
  assert.match(index, /href="LICENSE"/);
});

test('niche how-to pages answer the search query in the first screen', () => {
  assert.match(replacePage, /How much to charge to replace a garage door/i);
  assert.match(replacePage, /FAQPage/);
  assert.match(replacePage, /16×7 is not two 8×7s/);
  assert.match(springPage, /How much to charge for a broken garage door spring/i);
  assert.match(springPage, /\$189/);
  assert.match(springPage, /travel labor/);
});

test('robots and sitemap expose the calculator and the how-to pages', () => {
  assert.match(robots, /Allow: \//);
  assert.match(robots, /sitemap.xml/);
  assert.match(sitemap, /garage-door-bid-calculator\/<\/loc>/);
  assert.match(sitemap, /how-much-to-charge-to-replace-a-garage-door.html/);
  assert.match(sitemap, /how-much-to-charge-for-a-broken-spring.html/);
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
