import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseCsv, normalizeState, parseAmount, parseDate, detectColumns, readOrders,
  analyzeOrders, toEntries, planToCsv, sampleCsv, percentUsed,
} from './orders.mjs';
import { thresholdFor } from './calc.mjs';

const AS_OF = Date.UTC(2026, 9, 17);

test('parseCsv handles quotes, doubled quotes, embedded newlines and CRLF', () => {
  const rows = parseCsv('a,b\r\n"x, y","he said ""hi"""\r\n"line1\nline2",z\r\n');
  assert.deepEqual(rows, [['a', 'b'], ['x, y', 'he said "hi"'], ['line1\nline2', 'z']]);
});

test('normalizeState accepts codes, names and DC, and rejects non-states', () => {
  assert.equal(normalizeState('ca'), 'CA');
  assert.equal(normalizeState(' California '), 'CA');
  assert.equal(normalizeState('District of Columbia'), 'DC');
  assert.equal(normalizeState('Washington DC'), 'DC');
  assert.equal(normalizeState('ON'), null);
  assert.equal(normalizeState(''), null);
});

test('parseAmount strips currency, treats parentheses and minus as negative', () => {
  assert.equal(parseAmount('$1,234.50'), 1234.5);
  assert.equal(parseAmount('(20.00)'), -20);
  assert.equal(parseAmount('-5'), -5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('n/a'), null);
});

test('parseDate reads ISO with time zone and US dates, and refuses nonsense', () => {
  assert.equal(parseDate('2026-03-04 10:11:12 -0500'), Date.UTC(2026, 2, 4));
  assert.equal(parseDate('3/4/2026'), Date.UTC(2026, 2, 4));
  assert.equal(parseDate('03/04/26'), Date.UTC(2026, 2, 4));
  assert.equal(parseDate('31/12/2026'), null);
  assert.equal(parseDate('yesterday'), null);
});

test('detectColumns prefers subtotal over total and finds Shopify, Etsy and Amazon headers', () => {
  const shopify = detectColumns(['Name', 'Created at', 'Subtotal', 'Total', 'Shipping Province']);
  assert.deepEqual(shopify, { state: 4, amount: 2, date: 1, id: 0 });
  const etsy = detectColumns(['Sale Date', 'Order ID', 'Item Total', 'Ship State']);
  assert.equal(etsy.state, 3); assert.equal(etsy.amount, 2); assert.equal(etsy.date, 0); assert.equal(etsy.id, 1);
  const amazon = detectColumns(['amazon-order-id', 'purchase-date', 'item-price', 'ship-state']);
  assert.equal(amazon.state, 3); assert.equal(amazon.amount, 2); assert.equal(amazon.date, 1);
});

test('readOrders skips Shopify continuation lines, refunds, unknown states and bad dates, and says how many', () => {
  const csv = [
    'Name,Created at,Subtotal,Shipping Province',
    '#1,2026-09-01 10:00:00 -0500,100.00,CA',
    '#1,2026-09-01 10:00:00 -0500,,',
    '#2,2026-09-02 10:00:00 -0500,50.00,Ontario',
    '#3,2026-09-03 10:00:00 -0500,-30.00,TX',
    '#4,not a date,10.00,TX',
    '#5,2026-09-05 10:00:00 -0500,20.00,',
    '#6,2026-09-06 10:00:00 -0500,,TX',
  ].join('\n');
  const result = readOrders(csv);
  assert.equal(result.ok, true);
  assert.equal(result.orders.length, 1);
  assert.deepEqual(result.skipped, {
    noState: 1, unknownState: 1, noAmount: 1, badDate: 1, refund: 1, duplicateLine: 1,
  });
});

test('readOrders names the missing column instead of guessing', () => {
  const result = readOrders('Order,Foo,Bar\n1,2,3');
  assert.equal(result.ok, false);
  assert.match(result.error, /state/);
});

test('a repeated order id is counted once', () => {
  const csv = 'Order ID,Sale Date,Item Total,Ship State\n9,2026-09-01,40,CA\n9,2026-09-01,40,CA\n';
  assert.equal(readOrders(csv).orders.length, 1);
});

test('analyzeOrders keeps only the trailing 12 months and totals per state', () => {
  const orders = [
    { state: 'CA', amount: 300000, date: Date.UTC(2026, 0, 10) },
    { state: 'CA', amount: 250000, date: Date.UTC(2026, 5, 10) },
    { state: 'CA', amount: 999999, date: Date.UTC(2025, 6, 1) }, // before the window
    { state: 'ID', amount: 10, date: Date.UTC(2026, 8, 1) },
  ];
  const a = analyzeOrders(orders, { asOf: AS_OF });
  assert.equal(a.outsideWindow, 1);
  const ca = a.rows.find((r) => r.state === 'CA');
  assert.equal(ca.sales, 550000);
  assert.equal(ca.transactions, 2);
  assert.equal(ca.crossed, true);
  assert.equal(a.rows[0].state, 'CA', 'crossed states list first');
});

test('percentUsed takes the leading test for OR states and the lagging one for AND states', () => {
  assert.equal(percentUsed(thresholdFor('GA'), 50000, 180), 90);
  assert.equal(percentUsed(thresholdFor('NY'), 500000, 20), 20);
  assert.equal(percentUsed(thresholdFor('FL'), 25000, 1), 25);
});

test('a state selling steadily projects a crossing date after today and within the horizon', () => {
  // $300 a day into Idaho for the last 90 days, nothing before: 27,000 trailing,
  // needs 100,000. The 90 old days do not roll off for another 274 days, so the
  // line is reached at about day 243.
  const orders = [];
  for (let d = 0; d < 90; d += 1) orders.push({ state: 'ID', amount: 300, date: AS_OF - d * 86400000 });
  const a = analyzeOrders(orders, { asOf: AS_OF, horizonDays: 400 });
  const id = a.rows.find((r) => r.state === 'ID');
  assert.equal(id.crossed, false);
  assert.ok(id.crossesOn > '2026-10-17', id.crossesOn);
  const days = (Date.parse(id.crossesOn) - AS_OF) / 86400000;
  assert.ok(days > 235 && days < 250, `got ${days}`);
});

test('sales that stopped do not project a crossing', () => {
  const orders = [{ state: 'ID', amount: 90000, date: AS_OF - 200 * 86400000 }];
  const id = analyzeOrders(orders, { asOf: AS_OF }).rows[0];
  assert.equal(id.crossed, false);
  assert.equal(id.crossesOn, null);
});

test('no-sales-tax states are listed but never projected', () => {
  const a = analyzeOrders([{ state: 'OR', amount: 900000, date: AS_OF }], { asOf: AS_OF });
  assert.equal(a.rows[0].crossesOn, null);
  assert.equal(a.rows[0].percentOfThreshold, null);
  assert.deepEqual(toEntries(a), []);
});

test('the sample file reads cleanly and puts at least one state over and one near its line', () => {
  const read = readOrders(sampleCsv(AS_OF));
  assert.equal(read.ok, true);
  assert.equal(Object.values(read.skipped).reduce((a, b) => a + b, 0), 0);
  const a = analyzeOrders(read.orders, { asOf: AS_OF });
  assert.ok(a.rows.some((r) => r.crossed === true));
  assert.ok(a.rows.some((r) => r.crossed === false && r.percentOfThreshold > 40));
  assert.equal(toEntries(a).length, a.rows.length);
  assert.match(planToCsv(a), /^state,sales_12mo/);
});
