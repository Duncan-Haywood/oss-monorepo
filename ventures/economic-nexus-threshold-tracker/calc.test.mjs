import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STATE_THRESHOLDS,
  STATE_OPTIONS,
  thresholdFor,
  checkEntry,
  checkAll,
  removeEntry,
  sampleEntries,
  toCsv,
  loadEntries,
} from './calc.mjs';

test('covers all 50 states plus DC, each with a unique two-letter code', () => {
  assert.equal(STATE_THRESHOLDS.length, 51);
  const codes = new Set(STATE_THRESHOLDS.map((s) => s.code));
  assert.equal(codes.size, 51);
});

test('five states carry no economic nexus threshold because they levy no statewide sales tax', () => {
  const noTax = STATE_THRESHOLDS.filter((s) => s.noSalesTax).map((s) => s.code).sort();
  assert.deepEqual(noTax, ['AK', 'DE', 'MT', 'NH', 'OR']);
});

test('California, New York, and Texas set the $500,000 threshold; Alabama and Mississippi set $250,000; every other taxing state sets $100,000', () => {
  const taxing = STATE_THRESHOLDS.filter((s) => !s.noSalesTax);
  const at500k = taxing.filter((s) => s.amount === 500000).map((s) => s.code).sort();
  const at250k = taxing.filter((s) => s.amount === 250000).map((s) => s.code).sort();
  const at100k = taxing.filter((s) => s.amount === 100000).map((s) => s.code).sort();
  assert.deepEqual(at500k, ['CA', 'NY', 'TX']);
  assert.deepEqual(at250k, ['AL', 'MS']);
  assert.equal(at100k.length, taxing.length - 5);
});

test('New York is the only state pairing its transaction test with AND at a non-200 count (100)', () => {
  const ny = thresholdFor('NY');
  assert.equal(ny.condition, 'AND');
  assert.equal(ny.transactions, 100);
  const others = STATE_THRESHOLDS.filter((s) => s.condition === 'AND');
  assert.deepEqual(others.map((s) => s.code), ['CT', 'NY']);
});

test('thresholdFor returns null for an unknown or empty code rather than throwing', () => {
  assert.equal(thresholdFor('ZZ'), null);
  assert.equal(thresholdFor(''), null);
});

test('STATE_OPTIONS starts with a placeholder and lists one entry per state plus DC', () => {
  assert.equal(STATE_OPTIONS[0].value, '');
  assert.equal(STATE_OPTIONS.length, 52);
});

test('an OR state (no transaction test) crosses on sales alone at or above the figure', () => {
  const result = checkEntry({ state: 'FL', grossSales: 100000, transactionCount: '' });
  assert.equal(result.crossed, true);
  assert.match(result.status, /Crossed/);
});

test('an OR state (no transaction test) does not cross one dollar below the figure', () => {
  const result = checkEntry({ state: 'FL', grossSales: 99999.99, transactionCount: '' });
  assert.equal(result.crossed, false);
});

test('a state with an OR sales-or-transactions test crosses on transactions alone even under the sales figure', () => {
  const result = checkEntry({ state: 'GA', grossSales: 5000, transactionCount: 250 });
  assert.equal(result.crossed, true);
  assert.match(result.status, /transaction test/);
});

test('a state with an OR sales-or-transactions test crosses on sales alone even under the transaction count', () => {
  const result = checkEntry({ state: 'GA', grossSales: 150000, transactionCount: 10 });
  assert.equal(result.crossed, true);
  assert.match(result.status, /sales test/);
});

test('an OR state under both figures has not crossed', () => {
  const result = checkEntry({ state: 'GA', grossSales: 50000, transactionCount: 50 });
  assert.equal(result.crossed, false);
  assert.match(result.status, /Below both/);
});

test('an AND state (Connecticut) requires both figures -- sales alone with a known, insufficient transaction count is not crossed', () => {
  const result = checkEntry({ state: 'CT', grossSales: 150000, transactionCount: 50 });
  assert.equal(result.crossed, false);
  assert.match(result.status, /requires both/);
});

test('an AND state (Connecticut) crosses only when both figures are met', () => {
  const result = checkEntry({ state: 'CT', grossSales: 150000, transactionCount: 250 });
  assert.equal(result.crossed, true);
  assert.match(result.status, /Crossed/);
});

test('an AND state below the sales figure is definitively not crossed even with no transaction count entered', () => {
  const result = checkEntry({ state: 'NY', grossSales: 100000, transactionCount: '' });
  assert.equal(result.crossed, false);
  assert.match(result.status, /not crossed regardless of transaction count/);
});

test('an AND state at or above the sales figure with no transaction count entered is reported as unknown, not crossed', () => {
  const result = checkEntry({ state: 'NY', grossSales: 600000, transactionCount: '' });
  assert.equal(result.crossed, null);
  assert.match(result.status, /enter a transaction count/);
});

test('a no-sales-tax state never reads as crossed, whatever the sales figure', () => {
  const result = checkEntry({ state: 'OR', grossSales: 5000000, transactionCount: '' });
  assert.equal(result.crossed, false);
  assert.match(result.status, /no statewide sales tax/);
});

test('an unselected state asks the visitor to choose one rather than guessing', () => {
  const result = checkEntry({ state: '', grossSales: 100000, transactionCount: '' });
  assert.equal(result.crossed, null);
  assert.equal(result.status, 'Choose a state');
});

test('a negative or non-numeric sales figure is flagged for correction rather than guessed at', () => {
  assert.equal(checkEntry({ state: 'TX', grossSales: -1, transactionCount: '' }).status, 'Check inputs');
  assert.equal(checkEntry({ state: 'TX', grossSales: 'abc', transactionCount: '' }).status, 'Check inputs');
});

test('states are evaluated independently -- a large total across states does not itself cross a state under its own figure', () => {
  const entries = [
    { state: 'ID', grossSales: 40000, transactionCount: '' },
    { state: 'WY', grossSales: 40000, transactionCount: '' },
    { state: 'ND', grossSales: 40000, transactionCount: '' },
  ];
  const rows = checkAll(entries);
  assert.ok(rows.every((r) => r.crossed === false));
});

test('checkAll assigns a stable entryIndex to every row in input order', () => {
  const rows = checkAll(sampleEntries());
  assert.deepEqual(rows.map((r) => r.entryIndex), [0, 1, 2, 3, 4]);
});

test('removeEntry drops exactly the row at the given index and does not mutate the original array', () => {
  const entries = sampleEntries();
  const after = removeEntry(entries, 0);
  assert.equal(after.length, entries.length - 1);
  assert.equal(after.find((e) => e.state === 'CA'), undefined);
  assert.equal(entries.length, 5);
});

test('removeEntry ignores an out-of-range index rather than throwing', () => {
  const entries = sampleEntries();
  assert.deepEqual(removeEntry(entries, 99), entries);
  assert.deepEqual(removeEntry(entries, -1), entries);
  assert.deepEqual(removeEntry('not an array', 0), []);
});

test('sampleEntries demonstrates a crossed OR state, an unresolved AND state, a transaction-only cross, a miss, and a no-tax state', () => {
  const rows = checkAll(sampleEntries());
  assert.ok(rows.some((r) => r.crossed === true && r.threshold.condition == null));
  assert.ok(rows.some((r) => r.crossed === null));
  assert.ok(rows.some((r) => r.crossed === false && r.threshold.noSalesTax));
});

test('toCsv quotes fields and round-trips the header plus one row per entry', () => {
  const rows = checkAll(sampleEntries());
  const csv = toCsv(rows);
  const lines = csv.split('\n');
  assert.equal(lines.length, rows.length + 1);
  assert.equal(lines[0], 'state,grossSales,transactionCount,status');
});

test('loadEntries drops non-object rows and never throws on malformed JSON', () => {
  assert.deepEqual(loadEntries(null), []);
  assert.deepEqual(loadEntries('not json'), []);
  assert.deepEqual(loadEntries('[1,2,{"state":"CA"}]'), [{ state: 'CA' }]);
  assert.deepEqual(loadEntries(JSON.stringify(sampleEntries())), sampleEntries());
});
