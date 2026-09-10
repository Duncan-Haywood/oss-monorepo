import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('./index.html', import.meta.url), 'utf8');

test('the static page contains its executable module and queried controls', () => {
  assert.match(page, /<script type="module">/);
  assert.match(page, /import \{ calculateBid, SERVICE_PRESETS \} from '\.\/calc\.mjs';/);
  assert.match(page, /import \{ recordUsage \} from '\.\/usage\.mjs';/);

  for (const id of [
    'services',
    'addService',
    'oneWayMinutes',
    'frequency',
    'proposedRecurring',
    'waiveInitial',
    'copySummary',
    'usageOptOut',
    'initialPrice',
    'recurringPrice',
    'verdict',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }
});

test('the page exposes the safety and privacy copy to users', () => {
  assert.match(page, /<strong>No warranty\.<\/strong>/);
  assert.match(page, /Nothing leaves your browser/);
  assert.match(page, /Do not keep anonymous local usage counts/);
});

test('the "how much to charge" SEO page exists, is linked from the calculator, and is in the sitemap', async () => {
  assert.match(page, /how-much-to-charge\.html/, 'index.html does not link to the companion SEO page');
  const doc = await readFile(new URL('./how-much-to-charge.html', import.meta.url), 'utf8');
  assert.match(doc, /How much should I charge for pest control/i);
  assert.match(doc, /FAQPage/);
  assert.match(doc, /No warranty/);
  assert.match(doc, /href="\.\/"/, 'the SEO page has no link back to the calculator');
  const sitemap = await readFile(new URL('./sitemap.xml', import.meta.url), 'utf8');
  assert.match(sitemap, /how-much-to-charge\.html/);
});

// A setter re-enters the same wage, burden, overhead, and margin on every
// single bid, and this repo has already shipped the bug where a bid link
// silently dropped fields the form actually reads (missing deposit and
// payment terms, recorded 2026-08-29): the recipient's page then computed a
// different price than the one the sender saw, with nothing on screen to say
// so. These checks pin the shape of the fix rather than the field list, so a
// field the form grows later is still covered.
test('a saved-and-shared bid is wired to the page', () => {
  assert.match(page, /from '\.\/share\.mjs'/, 'share.mjs is not imported');
  for (const name of ['encodeBid', 'saveBid', 'clearBid', 'restoreBid', 'withProposalTerms', 'readProposalTerms']) {
    assert.match(page, new RegExp(`\\b${name}\\b`), `${name} is imported but never used`);
  }
  // The bid rides in the URL fragment (#...), never the query string (?...):
  // a fragment is never sent in the request line a server logs or in a later
  // click's `Referer` header, which is the difference between the page's
  // "nothing leaves your browser" claim holding and not.
  assert.match(page, /\$\{query \? `#\$\{query\}` : ''\}/,
    'the bid link must be built as a URL fragment (#), not a query string (?)');
  assert.ok(!/`\?\$\{query\}`/.test(page), 'the bid link must not be built with a query string');
  assert.match(page, /search: location\.hash/,
    'the bid must be restored from the fragment, matching how the link is built');

  for (const id of ['copyLink', 'clearSaved', 'restoreNote']) {
    assert.match(page, new RegExp(`id="${id}"`), `missing #${id}`);
  }

  // What the link carries has to be on the page beside the button that makes
  // one — a hidden capability nobody reads the fine print for is not consent.
  assert.match(page, /A bid link carries your own rates/, 'the bid link does not say what it carries');
  assert.match(page, /wage, burden, overhead, and target margin/, 'the link caution does not name the rates it carries');
  assert.match(page, /The customer should get the price, not the link/, 'the link caution does not say who not to send it to');
  assert.match(page, /Your bid is saved in this browser/, 'the privacy note does not disclose that the bid is stored');
  assert.match(page, /treat one like your rate sheet/, 'the privacy note does not warn what a copied link holds');
});

// The service rows are the one part of this form that is not a flat field
// list — each row's dropdown, minutes, count, material cost, and every-visit
// flag all have to survive a link or the reopened bid prices a different job
// than the sender saw.
test('the service rows ride in the bid link, not just the cost fields', () => {
  assert.match(page, /rows:\s*\{/, 'BID_SPEC has no row group for the service list');
  assert.match(page, /param:\s*'services'/, 'the row group is not named after the services list');
  for (const key of ['type', 'minutes', 'quantity', 'materialPerUnit', 'everyVisit']) {
    assert.match(page, new RegExp(`key:\\s*'${key}'`), `service row field '${key}' is missing from BID_SPEC`);
  }
});

test('links to the janitorial bid calculator', () => {
  assert.match(page, /href="\.\.\/janitorial-bid-calculator\/"/, 'the sibling-tool link is missing');
});
