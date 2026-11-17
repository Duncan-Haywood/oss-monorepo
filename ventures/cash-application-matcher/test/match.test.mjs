import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import { applyCash, parseTerms, discountCents, nameScore, findReferences, buildReferenceIndex, findSubsets, DEFAULT_SETTINGS } from '../match.mjs';
import { readInvoices, readReceipts, parseDate } from '../csv.mjs';
import { applicationsCsv } from '../export.mjs';
import { score, generate } from '../eval/synthetic.mjs';

const d = (s) => parseDate(s);
const inv = (id, customer, date, amount, terms = 'Net 30') => ({ id, customer, date: d(date), amount, terms });
const rec = (id, date, amount, payer = '', reference = '') => ({ id, date: d(date), amount, payer, reference });

test('terms: "2/10 net 30" means 2% off when paid within 10 days (hand calculation)', () => {
  assert.deepEqual(parseTerms('2/10 Net 30'), { bp: 200, days: 10 });
  assert.deepEqual(parseTerms('1% 15 Net 45'), { bp: 100, days: 15 });
  assert.deepEqual(parseTerms('1.5/10 N30'), { bp: 150, days: 10 });
  assert.equal(parseTerms('Net 30'), null);
  assert.equal(parseTerms('Due on receipt'), null);
  // 2% of 1,000.00 is 20.00, so 980.00 settles the invoice in full.
  assert.equal(discountCents(100000, 200), 2000);
  // 2% of 1,234.57 is 24.6914, rounded to 24.69.
  assert.equal(discountCents(123457, 200), 2469);
});

test('a 980.00 payment on day 8 settles a 1,000.00 invoice on 2/10 net 30; on day 25 it does not', () => {
  const invoices = [inv('INV-1', 'Bluebird Bakery Co.', '2026-10-01', 100000, '2/10 net 30')];
  const early = applyCash(invoices, [rec('r1', '2026-10-09', 98000, 'BLUEBIRD BAKERY')]);
  assert.equal(early.results[0].confidence, 'high');
  assert.deepEqual(early.results[0].applications.map((a) => [a.invoice, a.applied, a.discount, a.leftOpen]), [['INV-1', 98000, 2000, 0]]);
  const late = applyCash(invoices, [rec('r1', '2026-10-26', 98000, 'BLUEBIRD BAKERY')]);
  assert.notEqual(late.results[0].method, 'customer + amount');
  assert.equal(late.results[0].applications[0]?.discount ?? 0, 0);
  // Short by exactly the unearned discount: not a bank charge. 20.00 stays open.
  assert.equal(late.results[0].method, 'customer, discount taken late');
  assert.equal(late.results[0].applications[0].writeoff, 0);
  assert.equal(late.results[0].applications[0].leftOpen, 2000);
  assert.equal(late.results[0].confidence, 'review');
  assert.match(late.results[0].note, /25 days after its date, 2% discount window 10 days/);
});

test('remittance numbers are read as whole ids, split prefixes and bare digit lists', () => {
  const invoices = [inv('INV-1023', 'A', '2026-01-01', 100), inv('INV-1024', 'A', '2026-01-01', 100), inv('INV-1031', 'A', '2026-01-01', 100), inv('INV-2000', 'B', '2026-01-01', 100)];
  const idx = buildReferenceIndex(invoices);
  const ids = (t) => findReferences(t, idx).map((i) => i.id).sort();
  assert.deepEqual(ids('REMIT INV-1023'), ['INV-1023']);
  assert.deepEqual(ids('INV 1023/1024, 1031'), ['INV-1023', 'INV-1024', 'INV-1031']);
  assert.deepEqual(ids('INVOICES INV1023,INV1024'), ['INV-1023', 'INV-1024']);
  assert.deepEqual(ids('PMT 001031'), ['INV-1031']);
  assert.deepEqual(ids('ACH PAYMENT 12'), []);
});

test('payer names: truncation, suffixes, abbreviations and bank noise', () => {
  assert.ok(nameScore('HARBOR FREIGHT LOGIST', 'Harbor Freight Logistics Inc') >= 0.99);
  assert.ok(nameScore('ACH CREDIT MAPLE ST HARDWARE', 'Maple Street Hardware') >= 0.99);
  assert.ok(nameScore('TIDEWATER MFG', 'Tidewater Manufacturing Co.') >= 0.99);
  assert.ok(nameScore('CEDAR PINE DENTAL', 'Cedar & Pine Dental PC') >= 0.99);
  assert.ok(nameScore('GLOBEX PARTNERS', 'Northwind Traders LLC') < DEFAULT_SETTINGS.nameThreshold);
  assert.ok(nameScore('NORTHWIND DENTAL', 'Northwind Logistics') < DEFAULT_SETTINGS.nameThreshold);
});

test('one payment for several invoices of the recognised customer', () => {
  const invoices = [inv('A1', 'Harbor Freight Logistics Inc', '2026-10-05', 340000), inv('A2', 'Harbor Freight Logistics Inc', '2026-10-19', 177525), inv('A3', 'Harbor Freight Logistics Inc', '2026-10-20', 99900)];
  const run = applyCash(invoices, [rec('r', '2026-11-04', 517525, 'HARBOR FREIGHT LOGIST')]);
  assert.deepEqual(run.results[0].applications.map((a) => a.invoice), ['A1', 'A2']);
  assert.equal(run.results[0].confidence, 'medium');
  assert.deepEqual(run.openInvoices.map((i) => i.id), ['A3']);
});

test('a short-pay within the bank-charge tolerance is written off; a larger one is flagged', () => {
  const invoices = [inv('A1', 'Harbor Freight', '2026-10-05', 340000)];
  const fee = applyCash(invoices, [rec('r', '2026-11-04', 338500, 'HARBOR FREIGHT')]);
  assert.equal(fee.results[0].applications[0].writeoff, 1500);
  assert.equal(fee.results[0].applications[0].leftOpen, 0);
  const strict = applyCash(invoices, [rec('r', '2026-11-04', 338500, 'HARBOR FREIGHT')], { feeTolerance: 1000 });
  assert.equal(strict.results[0].applications[0].writeoff, 0);
  assert.equal(strict.results[0].applications[0].leftOpen, 1500);
  assert.equal(strict.results[0].confidence, 'review');
});

test('named invoices short-paid: applied oldest first, balance stays open, marked review', () => {
  const invoices = [inv('INV-1', 'N', '2026-10-01', 100000), inv('INV-2', 'N', '2026-10-02', 50000)];
  const run = applyCash(invoices, [rec('r', '2026-11-01', 120000, 'N', 'INV 1 INV 2')]);
  const x = run.results[0];
  assert.equal(x.confidence, 'review');
  assert.deepEqual(x.applications.map((a) => [a.invoice, a.applied]), [['INV-1', 100000], ['INV-2', 20000]]);
  assert.equal(run.openInvoices.find((i) => i.id === 'INV-2').open, 30000);
});

test('two invoice sets adding up to the payment: oldest chosen, marked review', () => {
  const invoices = [inv('X1', 'Cedar Dental', '2026-10-01', 39500), inv('X2', 'Cedar Dental', '2026-10-15', 39500), inv('X3', 'Cedar Dental', '2026-10-29', 39500)];
  const run = applyCash(invoices, [rec('r', '2026-11-05', 39500, 'CEDAR DENTAL')]);
  assert.equal(run.results[0].confidence, 'review');
  assert.deepEqual(run.results[0].applications.map((a) => a.invoice), ['X1']);
  assert.match(run.results[0].note, /oldest/);
});

test('an invoice is never applied twice', () => {
  const invoices = [inv('X1', 'Orchid', '2026-10-01', 61580)];
  const run = applyCash(invoices, [rec('a', '2026-11-01', 61580, 'ORCHID'), rec('b', '2026-11-02', 61580, 'ORCHID')]);
  assert.equal(run.results[0].applications.length, 1);
  assert.equal(run.results[1].applications.length, 0);
  assert.equal(run.results[1].confidence, 'none');
});

test('amount-only matches are never high confidence', () => {
  const invoices = [inv('X1', 'Orchid Florists', '2026-10-01', 61580), inv('X2', 'Maple', '2026-10-01', 10000)];
  const run = applyCash(invoices, [rec('a', '2026-11-01', 61580, 'MOBILE DEPOSIT', 'CHECK')]);
  assert.equal(run.results[0].method, 'amount only');
  assert.equal(run.results[0].confidence, 'review');
});

test('subset search respects its node cap instead of hanging', () => {
  const pool = Array.from({ length: 40 }, (_, i) => ({ id: `I${i}`, open: 100000 + i * 7, amount: 100000 + i * 7, termsParsed: null }));
  const t0 = Date.now();
  const res = findSubsets(pool, 1, null, DEFAULT_SETTINGS, { nodeCap: 50000 });
  assert.equal(res.solutions.length, 0);
  assert.ok(Date.now() - t0 < 2000);
});

test('the shipped example reads and produces every kind of result', () => {
  const i = readInvoices(fs.readFileSync(new URL('../examples/open-invoices.csv', import.meta.url), 'utf8'));
  const r = readReceipts(fs.readFileSync(new URL('../examples/bank-receipts.csv', import.meta.url), 'utf8'));
  assert.equal(i.invoices.length, 11);
  assert.equal(r.receipts.length, 8);
  const run = applyCash(i.invoices, r.receipts);
  const kinds = new Set(run.results.map((x) => x.confidence));
  for (const k of ['high', 'medium', 'review', 'none']) assert.ok(kinds.has(k), k);
  assert.equal(run.summary.discountCents, 2000);
  const csv = applicationsCsv(run);
  assert.match(csv, /^receipt,receipt_date,payer/);
  assert.match(csv, /INV-1004,Bluebird Bakery Co\.,980\.00,20\.00/);
});

test('export neutralises spreadsheet formulas from bank text', () => {
  const run = applyCash([], [rec('=HYPERLINK("x")', '2026-11-01', 100, '+cmd', '')]);
  const csv = applicationsCsv(run);
  assert.match(csv, /"'=HYPERLINK\(""x""\)"/);
  assert.match(csv, /,'\+cmd,/);
});

test('synthetic benchmark (generated data): high-confidence proposals stay at least 99% exact', () => {
  let n = 0;
  let right = 0;
  for (const seed of [1, 2]) {
    const s = score(seed, { customers: 40, receipts: 400 });
    n += s.tiers.high.n;
    right += s.tiers.high.right;
  }
  assert.ok(n > 300);
  assert.ok(right / n >= 0.99, `${right}/${n}`);
});

test('red team 2026-11-17: a within-tolerance short-pay larger than the last named invoice never applies a negative amount', () => {
  // 1,005.00 named, 995.00 paid: the 10.00 shortfall is more than INV-1002's 5.00.
  const invoices = [inv('INV-1001', 'Acme', '2026-10-01', 100000), inv('INV-1002', 'Acme', '2026-10-02', 500)];
  const run = applyCash(invoices, [rec('r', '2026-11-01', 99500, 'ACME', 'INV-1001 INV-1002')]);
  const x = run.results[0];
  assert.equal(x.method, 'reference + amount less fee');
  for (const a of x.applications) assert.ok(a.applied >= 0, `${a.invoice} applied ${a.applied}`);
  assert.deepEqual(x.applications.map((a) => [a.invoice, a.applied, a.writeoff, a.leftOpen]), [['INV-1001', 99500, 500, 0], ['INV-1002', 0, 500, 0]]);
  assert.equal(x.applications.reduce((s, a) => s + a.applied, 0), 99500);
  assert.equal(x.unapplied, 0);
  assert.match(x.note, /INV-1001/);
});

test('red team 2026-11-17: method names a single-invoice customer match and a multi-invoice one apart', () => {
  const one = applyCash([inv('A1', 'Orchid Labs', '2026-10-01', 61580)], [rec('r', '2026-11-01', 61580, 'ORCHID LABS')]);
  assert.equal(one.results[0].method, 'customer + amount');
  const two = applyCash([inv('A1', 'Orchid Labs', '2026-10-01', 61580), inv('A2', 'Orchid Labs', '2026-10-02', 1000)], [rec('r', '2026-11-01', 62580, 'ORCHID LABS')]);
  assert.equal(two.results[0].method, 'customer + sum of invoices');
});

test('red team 2026-11-17: run-together payer names score as the customer ("ACMEWIDGETS" vs "Acme Widgets")', () => {
  assert.ok(nameScore('ACMEWIDGETS', 'Acme Widgets') >= 0.9, String(nameScore('ACMEWIDGETS', 'Acme Widgets')));
});

test('red team 2026-11-17: a prefix split from a short number at the end of the remittance ("INV 12")', () => {
  const index = buildReferenceIndex([{ id: 'INV-12', customer: 'A' }]);
  assert.deepEqual(findReferences('paid INV 12', index).map((i) => i.id), ['INV-12']);
});

test('red team 2026-11-17: a pool whose total cannot reach the payment is pruned, not searched to the node cap', () => {
  const pool = Array.from({ length: 30 }, (_, i) => ({ id: `P${i}`, customer: 'C', date: i, amount: 100, open: 100, termsParsed: null }));
  const out = findSubsets(pool, 1000000, 0, DEFAULT_SETTINGS);
  assert.equal(out.solutions.length, 0);
  assert.equal(out.truncated, false);
});

test('red team 2026-11-17: every proposal balances and no amount goes negative (synthetic data, 3 seeds)', () => {
  for (const seed of [1, 2, 3]) {
    const { invoices, receipts } = generate({ seed, customers: 40, receipts: 400 });
    const run = applyCash(invoices, receipts);
    for (const x of run.results) {
      const applied = x.applications.reduce((s, a) => s + a.applied, 0);
      assert.equal(applied + x.unapplied, x.receipt.amount, `seed ${seed} ${x.receipt.id}`);
      for (const a of x.applications) {
        for (const k of ['applied', 'discount', 'writeoff', 'leftOpen']) assert.ok(a[k] >= 0, `seed ${seed} ${x.receipt.id} ${a.invoice} ${k} ${a[k]}`);
      }
    }
    for (const o of run.openInvoices) assert.ok(o.open > 0 && o.open <= o.amount, `seed ${seed} ${o.id}`);
  }
});
