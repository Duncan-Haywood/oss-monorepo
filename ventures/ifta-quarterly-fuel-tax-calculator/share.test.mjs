import test from 'node:test';
import assert from 'node:assert/strict';

import { ROW_COUNT, ROW_FIELDS, GLOBAL_INPUT_IDS } from './calc.mjs';
import {
  QUARTER_KEY,
  encodeBid,
  decodeBid,
  saveBid,
  loadBid,
  clearBid,
  restoreBid,
} from './share.mjs';

// A fake storage that behaves like localStorage, including the throwing kind
// a browser with site data blocked hands back.
function fakeStorage({ throws = false } = {}) {
  const map = new Map();
  return {
    getItem: (key) => { if (throws) throw new Error('blocked'); return map.has(key) ? map.get(key) : null; },
    setItem: (key, value) => { if (throws) throw new Error('blocked'); map.set(key, String(value)); },
    removeItem: (key) => { if (throws) throw new Error('blocked'); map.delete(key); },
    size: () => map.size,
  };
}

const EXAMPLE_ROWS = [
  { jurisdiction: 'IL', totalMiles: '8400', taxableMiles: '', taxPaidGallons: '1420', taxRate: '0.627', surchargeRate: '' },
  { jurisdiction: 'IN', totalMiles: '6150', taxableMiles: '', taxPaidGallons: '380', taxRate: '0.34', surchargeRate: '0.62' },
];

test('a full quarter round-trips through a link unchanged', () => {
  const values = {
    interestAnnualPercent: '5',
    monthsLate: '2',
    rows: EXAMPLE_ROWS,
  };
  // Blank cells are not "unchanged" round-trip data — a blank column means
  // "not entered", so it is correctly dropped on the way out rather than
  // carried as an empty string. The expectation strips it the same way.
  assert.deepEqual(decodeBid(encodeBid(values)), {
    interestAnnualPercent: '5',
    monthsLate: '2',
    rows: [
      { jurisdiction: 'IL', totalMiles: '8400', taxPaidGallons: '1420', taxRate: '0.627' },
      { jurisdiction: 'IN', totalMiles: '6150', taxPaidGallons: '380', taxRate: '0.34', surchargeRate: '0.62' },
    ],
  });
});

test('the field list is imported from calc.mjs, not restated', () => {
  // Not a test of behaviour so much as a guard against the exact drift this
  // module's header warns about: if ROW_FIELDS or GLOBAL_INPUT_IDS ever grow
  // a field, this module picks it up automatically because it imports the
  // list rather than keeping a second one.
  assert.deepEqual(ROW_FIELDS, ['jurisdiction', 'totalMiles', 'taxableMiles', 'taxPaidGallons', 'taxRate', 'surchargeRate']);
  assert.deepEqual(GLOBAL_INPUT_IDS, ['interestAnnualPercent', 'monthsLate']);
  assert.equal(ROW_COUNT, 12);
});

test('a wholly blank row carries nothing and is dropped, not sent as an empty entry', () => {
  const values = { rows: [EXAMPLE_ROWS[0], {}, EXAMPLE_ROWS[1]] };
  const decoded = decodeBid(encodeBid(values));
  assert.equal(decoded.rows.length, 2);
  assert.equal(decoded.rows[0].jurisdiction, 'IL');
  assert.equal(decoded.rows[1].jurisdiction, 'IN');
});

test('a row missing one cell keeps the rest of that row', () => {
  const values = { rows: [{ jurisdiction: 'KY', totalMiles: '4820' }] };
  const decoded = decodeBid(encodeBid(values));
  assert.deepEqual(decoded.rows, [{ jurisdiction: 'KY', totalMiles: '4820' }]);
});

test('more than ROW_COUNT rows is truncated on the way out and the way in', () => {
  const rows = Array.from({ length: ROW_COUNT + 5 }, (_, i) => ({ jurisdiction: `J${i}`, totalMiles: String(i + 1) }));
  const encoded = encodeBid({ rows });
  const decoded = decodeBid(encoded);
  assert.equal(decoded.rows.length, ROW_COUNT);
  assert.equal(decoded.rows[0].jurisdiction, 'J0');

  // Even a hand-crafted fragment claiming more rows than the table has is cut
  // down on decode alone, independent of what encodeBid ever produced.
  const crafted = `rows=${Array.from({ length: ROW_COUNT + 5 }, (_, i) => `J${i}::::: `).join(',')}`;
  assert.ok(decodeBid(crafted).rows.length <= ROW_COUNT);
});

test('a jurisdiction longer than the input field\'s own maxlength is dropped', () => {
  const decoded = decodeBid(encodeBid({ rows: [{ jurisdiction: 'X'.repeat(30), totalMiles: '100' }] }));
  assert.deepEqual(decoded.rows, [{ totalMiles: '100' }]);
});

test('control characters are stripped from a jurisdiction code and surrounding whitespace is trimmed', () => {
  assert.equal(encodeBid({ rows: [{ jurisdiction: '  KY\n ' }] }).includes('KY'), true);
  const decoded = decodeBid(encodeBid({ rows: [{ jurisdiction: '  KY\n ' }] }));
  assert.equal(decoded.rows[0].jurisdiction, 'KY');
});

test('a negative or non-numeric figure is rejected on both directions, and the rest of the row survives', () => {
  const decoded = decodeBid(encodeBid({ rows: [{ jurisdiction: 'OH', totalMiles: '-5', taxRate: 'abc' }] }));
  assert.deepEqual(decoded.rows, [{ jurisdiction: 'OH' }]);
  // A hand-crafted fragment cannot smuggle a negative value in either, since
  // decodeBid re-validates independent of what encodeBid would have produced
  // — only the jurisdiction cell in this row is valid, so only it survives.
  assert.deepEqual(decodeBid('rows=OH:-5:::abc:'), { rows: [{ jurisdiction: 'OH' }] });
});

test('zero is a real, carried value, not treated as blank', () => {
  const decoded = decodeBid(encodeBid({ rows: [{ jurisdiction: 'MI', taxPaidGallons: '0' }] }));
  assert.equal(decoded.rows[0].taxPaidGallons, '0');
});

test('decodeBid accepts a bare string or one with a leading ? or #', () => {
  const encoded = encodeBid({ interestAnnualPercent: '3' });
  assert.deepEqual(decodeBid(encoded), decodeBid(`?${encoded}`));
  assert.deepEqual(decodeBid(encoded), decodeBid(`#${encoded}`));
});

test('encodeBid returns an empty string for a quarter with nothing worth sending', () => {
  assert.equal(encodeBid({ rows: [{}, {}] }), '');
  assert.equal(encodeBid({}), '');
});

test('save and load round-trip through storage', () => {
  const storage = fakeStorage();
  const values = { interestAnnualPercent: '4', monthsLate: '1', rows: EXAMPLE_ROWS };
  assert.equal(saveBid(storage, values), true);
  assert.deepEqual(loadBid(storage), decodeBid(encodeBid(values)));
  assert.equal(storage.size(), 1);
});

test('clearBid removes the saved quarter', () => {
  const storage = fakeStorage();
  saveBid(storage, { interestAnnualPercent: '1' });
  assert.equal(clearBid(storage), true);
  assert.deepEqual(loadBid(storage), {});
});

test('a storage blocked by the browser fails closed rather than throwing', () => {
  const storage = fakeStorage({ throws: true });
  assert.equal(saveBid(storage, { interestAnnualPercent: '1' }), false);
  assert.deepEqual(loadBid(storage), {});
  assert.equal(clearBid(storage), false);
});

test('loadBid ignores a blob from an unknown version or a corrupt one', () => {
  const storage = fakeStorage();
  storage.setItem(QUARTER_KEY, JSON.stringify({ v: 99, values: { interestAnnualPercent: '1' } }));
  assert.deepEqual(loadBid(storage), {});
  storage.setItem(QUARTER_KEY, 'not json');
  assert.deepEqual(loadBid(storage), {});
});

test('restoreBid prefers a link over storage', () => {
  const storage = fakeStorage();
  saveBid(storage, { interestAnnualPercent: '9' });
  const linkQuery = encodeBid({ interestAnnualPercent: '2' });
  const result = restoreBid({ hash: `#${linkQuery}`, storage });
  assert.equal(result.source, 'link');
  assert.equal(result.values.interestAnnualPercent, '2');
});

test('restoreBid falls back to storage when there is no link', () => {
  const storage = fakeStorage();
  saveBid(storage, { interestAnnualPercent: '9' });
  const result = restoreBid({ hash: '', storage });
  assert.equal(result.source, 'storage');
  assert.equal(result.values.interestAnnualPercent, '9');
});

test('restoreBid reports "none" when there is neither', () => {
  const result = restoreBid({ hash: '', storage: fakeStorage() });
  assert.deepEqual(result, { values: {}, source: 'none' });
});
