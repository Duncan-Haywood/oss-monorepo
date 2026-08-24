import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repricingCsv } from './export.mjs';

test('exports repricing rows with spreadsheet-friendly values', () => {
  const csv = repricingCsv([{
    price: 40, offset: 0, profit: 14.305, unitProfit: 14.305,
    margin: 31.1, profitDelta: 0, quantity: 1,
  }, {
    price: 44, offset: 10, profit: 17.77, unitProfit: 17.77,
    margin: 35.5, profitDelta: 3.465, quantity: 1,
  }]);
  assert.equal(csv, [
    'Item price,Price change,Batch net profit,Profit per unit,Net margin,Change vs current,Units',
    '40.00,0%,14.30,14.30,31.1%,0.00,1',
    '44.00,10%,17.77,17.77,35.5%,3.46,1',
    '',
  ].join('\n'));
});

test('rejects an empty repricing export', () => {
  assert.throws(() => repricingCsv([]), /repricing row/);
});
