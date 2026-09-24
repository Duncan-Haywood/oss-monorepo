import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateTax, layerLine, round2, LAYER_COUNT, LAYER_FIELDS, GLOBAL_INPUT_IDS } from './calc.mjs';

const FL_ROWS = [
  { name: 'Florida state sales tax', ratePercent: 6, platformCollectsPercent: 100 },
  { name: 'County tourist development tax', ratePercent: 5, platformCollectsPercent: 0 },
];

test('round2 rounds half away from zero on both sides', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(-1.005), -1.01);
  assert.equal(round2(2.345), 2.35);
});

test('the Florida example splits tax between what the platform collects and what the host must remit', () => {
  const result = calculateTax({
    nightlyRate: 250, nights: 4, cleaningFee: 150, bookingsPerMonth: 6,
    flatFeePerNight: 0, flatFeePlatformCollectsPercent: 0, rows: FL_ROWS,
  });
  assert.equal(result.ok, true);
  assert.equal(result.taxableBase, 1150);
  assert.equal(result.totalTax, 126.5);
  assert.equal(result.platformCollected, 69);
  assert.equal(result.hostMustRemit, 57.5);
  assert.equal(result.monthlyTax, 759);
  assert.equal(result.monthlyHostMustRemit, 345);
  assert.equal(result.monthlyPlatformCollected, 414);
  assert.ok(result.warnings.some((w) => w.code === 'split-remittance'));
});

test('cleaning fee is part of the taxable base', () => {
  const withFee = calculateTax({ nightlyRate: 100, nights: 2, cleaningFee: 50, rows: [{ name: 'State', ratePercent: 10, platformCollectsPercent: 0 }] });
  const withoutFee = calculateTax({ nightlyRate: 100, nights: 2, cleaningFee: 0, rows: [{ name: 'State', ratePercent: 10, platformCollectsPercent: 0 }] });
  assert.equal(withFee.taxableBase, 250);
  assert.equal(withoutFee.taxableBase, 200);
  assert.ok(withFee.totalTax > withoutFee.totalTax);
});

test('a layer the platform fully collects leaves nothing for the host', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 1, rows: [{ name: 'State', ratePercent: 8, platformCollectsPercent: 100 }] });
  assert.equal(result.hostMustRemit, 0);
  assert.ok(result.warnings.some((w) => w.code === 'platform-remits-all'));
});

test('a layer the platform never collects is entirely the host’s filing', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 1, rows: [{ name: 'County', ratePercent: 5, platformCollectsPercent: 0 }] });
  assert.equal(result.platformCollected, 0);
  assert.equal(result.hostMustRemit, result.totalTax);
  assert.ok(result.warnings.some((w) => w.code === 'host-remits-all'));
});

test('a flat per-night fee is charged on nights, independent of the percentage layers', () => {
  const result = calculateTax({
    nightlyRate: 100, nights: 3, flatFeePerNight: 5, flatFeePlatformCollectsPercent: 0,
    rows: [],
  });
  assert.equal(result.flatFee.amount, 15);
  assert.equal(result.totalTax, 15);
  assert.equal(result.hostMustRemit, 15);
});

test('an unnamed, zero-rate row is treated as unused, not as a layer', () => {
  const result = calculateTax({
    nightlyRate: 100, nights: 1,
    rows: [{ name: 'State', ratePercent: 8, platformCollectsPercent: 0 }, { name: '', ratePercent: '', platformCollectsPercent: '' }],
  });
  assert.equal(result.layers.length, 1);
});

test('a named row left at a 0% rate is flagged rather than silently dropped', () => {
  const result = calculateTax({
    nightlyRate: 100, nights: 1,
    rows: [{ name: 'State', ratePercent: 8, platformCollectsPercent: 0 }, { name: 'City', ratePercent: 0, platformCollectsPercent: 0 }],
  });
  assert.equal(result.layers.length, 2);
  assert.ok(result.warnings.some((w) => w.code === 'zero-rate' && w.message.includes('City')));
});

test('rejects a stay with no nightly rate and no cleaning fee', () => {
  const result = calculateTax({ nightlyRate: 0, nights: 2, cleaningFee: 0, rows: FL_ROWS });
  assert.equal(result.ok, false);
});

test('rejects zero nights', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 0, rows: FL_ROWS });
  assert.equal(result.ok, false);
});

test('rejects no tax layer and no flat fee', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 1, rows: [] });
  assert.equal(result.ok, false);
});

test('rejects an out-of-range rate', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 1, rows: [{ name: 'State', ratePercent: 150, platformCollectsPercent: 0 }] });
  assert.equal(result.ok, false);
  assert.ok(result.errors[0].message.includes('State'));
});

test('rejects a negative nightly rate', () => {
  const result = calculateTax({ nightlyRate: -10, nights: 1, rows: FL_ROWS });
  assert.equal(result.ok, false);
});

test('blank cells read as zero rather than rejecting', () => {
  const result = calculateTax({ nightlyRate: 100, nights: 1, cleaningFee: '', rows: [{ name: 'State', ratePercent: 8, platformCollectsPercent: '' }] });
  assert.equal(result.ok, true);
  assert.equal(result.cleaningFee, 0);
  assert.equal(result.layers[0].platformCollectsPercent, 0);
});

test('layerLine computes a single row in isolation', () => {
  const line = layerLine({ name: 'State', ratePercent: 10, platformCollectsPercent: 50 }, 1000);
  assert.equal(line.amount, 100);
  assert.equal(line.platformAmount, 50);
  assert.equal(line.hostAmount, 50);
});

test('exported row shape matches what the page and share module expect', () => {
  assert.equal(LAYER_COUNT, 4);
  assert.deepEqual(LAYER_FIELDS, ['name', 'ratePercent', 'platformCollectsPercent']);
  assert.deepEqual(GLOBAL_INPUT_IDS, [
    'nightlyRate', 'nights', 'cleaningFee', 'bookingsPerMonth',
    'flatFeePerNight', 'flatFeePlatformCollectsPercent',
  ]);
});
