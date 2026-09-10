import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8');

test('landing page exposes searchable product, full disclaimer, and local app', () => {
  assert.match(html, /Payment Reconciliation Workbench/);
  assert.match(html, /No warranty/);
  assert.match(html, /not legal, tax, financial, or accounting advice/i);
  assert.match(html, /application\/ld\+json/);
  assert.match(html, /src="app\.mjs"/);
  assert.match(html, /Download review CSV/);
  assert.match(html, /Files are never uploaded/);
});

test('the results panel wires every element app.mjs writes into', () => {
  // app.mjs reaches for these by id; a renamed or dropped element makes the
  // review queue silently stop updating, which no unit test would catch.
  for (const id of ['matched', 'unmatchedPayouts', 'unmatchedDeposits', 'explained', 'table', 'results', 'download', 'message', 'tolerance', 'usage']) {
    assert.match(html, new RegExp(`id="${id}"`), `index.html is missing #${id}`);
  }
  assert.match(html, /What to check/);
});

test('editing the tolerance and pressing Enter re-runs the match, not only the button click', () => {
  // #tolerance sits outside a <form>, so a plain <input type="number"> swallows
  // Enter by default. Once results are already showing, adjusting the
  // tolerance and pressing Enter -- the natural close-out on a phone's numeric
  // keypad -- must reprice the match exactly as clicking "Run reconciliation"
  // does, or the table keeps showing results from the old tolerance with
  // nothing on screen to say they are stale.
  const appSource = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /\$\('tolerance'\)\.addEventListener\('keydown', event => \{ if \(event\.key === 'Enter'\) \{ event\.preventDefault\(\); run\(\); \} \}\)/,
    'no Enter-key handler on #tolerance calling run()',
  );
  assert.match(appSource, /\$\('run'\)\.addEventListener\('click', run\)/, 'run() is not shared between the click and Enter-key paths');
});

// Closest sibling: same private, browser-only reconciliation shape, but
// checking a landlord's CAM bill rather than matching processor payouts to
// bank deposits. Without a crawlable link here, a crawler entering on the
// payment reconciliation workbench never reaches the CAM reconciliation
// calculator in one hop.
test('index links one hop to the cam-reconciliation-check sibling', () => {
  assert.match(
    html,
    /href="\.\.\/cam-reconciliation-check\/"/,
    'index must link ../cam-reconciliation-check/ so crawlers reach the CAM reconciliation calculator in one hop',
  );
});

test('index links one hop to the duplicate-payment-audit sibling', () => {
  assert.match(
    html,
    /href="\.\.\/duplicate-payment-audit\/"/,
    'index must link ../duplicate-payment-audit/ so crawlers reach the duplicate payment audit tool in one hop',
  );
});

// This tool asks for two exports before it will do anything, which is the
// highest entry cost in the catalogue -- so the worked example is the only
// thing that shows a visitor the output before they go and produce both
// files. Pinned to the behaviour it is meant to demonstrate: if a future
// change to `reconcile` stops producing one of these shapes, the demo would
// silently start under-showing the product rather than failing.
test('the bundled worked example produces every result shape the reconciler reports', async () => {
  const app = fs.readFileSync(new URL('./app.mjs', import.meta.url), 'utf8');
  const payouts = app.match(/const EXAMPLE_PAYOUTS = `([\s\S]*?)`;/);
  const deposits = app.match(/const EXAMPLE_DEPOSITS = `([\s\S]*?)`;/);
  assert.ok(payouts && deposits, 'app.mjs must carry both inline example fixtures');

  const { readRecords, reconcile } = await import('./reconcile.mjs');
  const rows = reconcile(readRecords(payouts[1], 'p'), readRecords(deposits[1], 'd'), 3);

  assert.ok(rows.some(r => r.status === 'matched' && r.deposits.length === 1), 'needs a plain one-to-one match');
  assert.ok(rows.some(r => r.status === 'matched' && r.deposits.length > 1), 'needs a payout the bank split across deposits');
  assert.ok(rows.some(r => r.status === 'unmatched payout' && r.hint?.feeLike), 'needs an exception whose gap reads as a processor fee');
  assert.ok(rows.some(r => r.status === 'unmatched payout' && !r.hint), 'needs a payout with no deposit to pair with');
  assert.ok(rows.some(r => r.status === 'unmatched deposit' && !r.hint), 'needs a deposit nothing explains');
});

test('the worked example is reachable from a control on the page', () => {
  assert.match(html, /id="loadExample"/);
  assert.match(html, /Load a worked example/);
});
