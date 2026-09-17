import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { readRecords, reconcile, explanation } from './reconcile.mjs';

const docsPage = (name) => fs.readFileSync(new URL(`./${name}`, import.meta.url), 'utf8');
const html = docsPage('why-does-one-payout-show-up-as-two-bank-deposits.html');
const index = docsPage('index.html');

test('index links to the split-deposit SEO/AI-discovery page', () => {
  assert.match(index, /why-does-one-payout-show-up-as-two-bank-deposits\.html/);
});

test('the docs page answers the search question with the disclaimers intact', () => {
  assert.match(html, /Why Does One Payout Show Up as Two/i);
  assert.match(html, /FAQPage/);
  assert.match(html, /"@type":"Question"/);
  assert.match(html, /href="\.\/"/);
  assert.match(html, /No warranty/);
  assert.match(html, /Best-effort hosting, no SLA/);
  assert.match(html, /not accounting or financial advice/i);
});

test('the grouped-match figures are what reconcile() actually returns, not hand-typed', () => {
  // Same fixture as reconcile.test.mjs's "matches a payout split across
  // multiple bank deposits" -- running it here is what proves the page's
  // numbers are the tool's own output rather than independently typed.
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,60.00\n2026-08-22,40.00', 'deposits');
  const [result] = reconcile(payouts, deposits, 3);
  assert.equal(result.status, 'matched');
  assert.equal(result.deposits.length, 2);
  assert.equal(result.deposits.reduce((sum, deposit) => sum + deposit.cents, 0), 10000);

  for (const figure of ['$100.00', '$60.00', '$40.00', '2026-08-20', '2026-08-21', '2026-08-22']) {
    assert.ok(html.includes(figure), `expected the page to show ${figure}`);
  }
});

test('the fee-hint figures match explanation() output for the same case as the mixed-VAT-style near-miss', () => {
  // Same fixture as reconcile.test.mjs's "names a processor fee as the
  // likely cause of a near-miss exception".
  const payouts = readRecords('date,net\n2026-08-20,100.00', 'payouts');
  const deposits = readRecords('date,amount\n2026-08-21,96.80', 'deposits');
  const result = reconcile(payouts, deposits, 3);
  const payoutRow = result.find((row) => row.status === 'unmatched payout');
  assert.equal(payoutRow.hint.difference, 320);
  assert.equal(payoutRow.hint.feeLike, true);
  const sentence = explanation(payoutRow);
  assert.match(sentence, /deposit is 3\.20 \(3\.20%\) short — consistent with a processor fee/);

  assert.ok(html.includes('$96.80'), 'expected the page to show the deposit figure');
  assert.ok(html.includes('3.20 (3.20%) short'), 'expected the page to quote the actual explanation() wording');
  assert.ok(html.includes('consistent with a processor fee deducted from the transfer'), 'expected the fee reading to match explanation() verbatim');
});

test('robots and sitemap let crawlers find the new page', () => {
  const robots = docsPage('robots.txt');
  const sitemap = docsPage('sitemap.xml');
  assert.match(robots, /Allow: \//);
  assert.match(sitemap, /payment-reconciliation-workbench\/<\/loc>/);
  assert.match(sitemap, /why-does-one-payout-show-up-as-two-bank-deposits\.html/);
});
