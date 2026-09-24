import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SS_WAGE_BASE_2026,
  ADDITIONAL_MEDICARE_THRESHOLDS,
  FILING_STATUS_OPTIONS,
  NINE_FACTORS,
  ficaCost,
  marketRateFloor,
  assess,
  loadState,
} from './calc.mjs';

test('ficaCost applies combined 12.4% OASDI only up to the 2026 wage base', () => {
  const below = ficaCost(100000, 'single');
  assert.equal(below.oasdi, 0.124 * 100000);
  const above = ficaCost(300000, 'single');
  assert.equal(above.oasdi, 0.124 * SS_WAGE_BASE_2026);
});

test('ficaCost applies combined 2.9% Medicare with no wage cap', () => {
  const result = ficaCost(500000, 'single');
  assert.equal(result.medicare, 0.029 * 500000);
});

test('ficaCost applies the 0.9% additional Medicare tax only above the filing-status threshold, employee-only (no employer match)', () => {
  const underThreshold = ficaCost(150000, 'single');
  assert.equal(underThreshold.additionalMedicare, 0);
  const overThreshold = ficaCost(250000, 'single');
  assert.equal(overThreshold.additionalMedicare, 0.009 * (250000 - ADDITIONAL_MEDICARE_THRESHOLDS.single));
});

test('additional Medicare threshold differs by filing status', () => {
  const single = ficaCost(240000, 'single');
  const mfj = ficaCost(240000, 'mfj');
  assert.ok(single.additionalMedicare > 0);
  assert.equal(mfj.additionalMedicare, 0);
});

test('ficaCost treats a negative or non-numeric salary as zero rather than throwing or going negative', () => {
  assert.equal(ficaCost(-500, 'single').total, 0);
  assert.equal(ficaCost(NaN, 'single').total, 0);
  assert.equal(ficaCost(undefined, 'single').total, 0);
});

test('ficaCost falls back to single-filer thresholds for an unrecognized filing status', () => {
  const unknown = ficaCost(240000, 'nonsense');
  const single = ficaCost(240000, 'single');
  assert.equal(unknown.additionalMedicare, single.additionalMedicare);
});

test('marketRateFloor scales a full-time wage by hours worked relative to 40/week', () => {
  assert.equal(marketRateFloor({ marketWageFullTime: 80000, hoursPerWeek: 40 }), 80000);
  assert.equal(marketRateFloor({ marketWageFullTime: 80000, hoursPerWeek: 20 }), 40000);
});

test('marketRateFloor defaults to full-time when hours are missing, and caps the multiplier at 2x for an absurd hours entry', () => {
  assert.equal(marketRateFloor({ marketWageFullTime: 60000, hoursPerWeek: null }), 60000);
  assert.equal(marketRateFloor({ marketWageFullTime: 60000, hoursPerWeek: 400 }), 120000);
});

test('marketRateFloor returns null when no market wage was entered, rather than a fabricated figure', () => {
  assert.equal(marketRateFloor({ marketWageFullTime: '', hoursPerWeek: 40 }), null);
  assert.equal(marketRateFloor({ marketWageFullTime: 0, hoursPerWeek: 40 }), null);
  assert.equal(marketRateFloor({ marketWageFullTime: -10, hoursPerWeek: 40 }), null);
});

test('assess flags a planned salary at or above the comparable-wage floor as the strongest position', () => {
  const result = assess({ compensationPool: 150000, plannedSalary: 85000, marketWageFullTime: 80000, hoursPerWeek: 40, filingStatus: 'single' });
  assert.equal(result.ok, true);
  assert.equal(result.flagLevel, 'ok');
  assert.match(result.flag, /at or above/);
});

test('assess flags a planned salary below the floor while a distribution is being paid as the highest-risk pattern', () => {
  const result = assess({ compensationPool: 150000, plannedSalary: 24000, marketWageFullTime: 91000, hoursPerWeek: 40, filingStatus: 'single' });
  assert.equal(result.flagLevel, 'warn');
  assert.match(result.flag, /Watson/);
  assert.ok(result.distribution > 0);
});

test('assess flags a below-floor salary with no distribution as lower-risk but still notes the statutory requirement', () => {
  const result = assess({ compensationPool: 20000, plannedSalary: 20000, marketWageFullTime: 90000, hoursPerWeek: 40, filingStatus: 'single' });
  assert.equal(result.distribution, 0);
  assert.equal(result.flagLevel, 'caution');
});

test('assess reports info level and a null floor when no market wage was supplied', () => {
  const result = assess({ compensationPool: 100000, plannedSalary: 50000, marketWageFullTime: '', hoursPerWeek: 40, filingStatus: 'single' });
  assert.equal(result.floor, null);
  assert.equal(result.flagLevel, 'info');
  assert.equal(result.floorFica, null);
  assert.equal(result.extraFicaToReachFloor, null);
});

test('assess notes when the comparable-wage floor exceeds the compensation pool, without treating it as a hard floor', () => {
  const result = assess({ compensationPool: 40000, plannedSalary: 40000, marketWageFullTime: 90000, hoursPerWeek: 40, filingStatus: 'single' });
  assert.equal(result.exceedsPool, true);
  assert.match(result.poolNote, /compensation pool/);
});

test('assess computes the extra FICA cost of raising salary to the comparable-wage floor', () => {
  const result = assess({ compensationPool: 200000, plannedSalary: 40000, marketWageFullTime: 90000, hoursPerWeek: 40, filingStatus: 'single' });
  const expected = ficaCost(90000, 'single').total - ficaCost(40000, 'single').total;
  assert.equal(Math.round(result.extraFicaToReachFloor), Math.round(expected));
});

test('assess rejects a missing or negative planned salary rather than guessing', () => {
  assert.equal(assess({ plannedSalary: '' }).ok, false);
  assert.equal(assess({ plannedSalary: -1 }).ok, false);
});

test('assess treats an unusable compensation pool as unknown distribution rather than zero', () => {
  const result = assess({ compensationPool: '', plannedSalary: 50000, marketWageFullTime: 80000, hoursPerWeek: 40 });
  assert.equal(result.distribution, null);
});

test('FILING_STATUS_OPTIONS covers exactly the four thresholds used by ADDITIONAL_MEDICARE_THRESHOLDS', () => {
  const optionValues = FILING_STATUS_OPTIONS.map((o) => o.value).sort();
  const thresholdKeys = Object.keys(ADDITIONAL_MEDICARE_THRESHOLDS).sort();
  assert.deepEqual(optionValues, thresholdKeys);
});

test('NINE_FACTORS lists nine distinct, non-numeric reference factors', () => {
  assert.equal(NINE_FACTORS.length, 9);
  const ids = new Set(NINE_FACTORS.map((f) => f.id));
  assert.equal(ids.size, 9);
  for (const factor of NINE_FACTORS) {
    assert.equal(typeof factor.title, 'string');
    assert.equal(typeof factor.prompt, 'string');
  }
});

test('loadState parses a saved object and never throws on malformed JSON', () => {
  assert.equal(loadState(null), null);
  assert.equal(loadState('not json'), null);
  assert.deepEqual(loadState('[1,2,3]'), [1, 2, 3]);
  assert.deepEqual(loadState('{"plannedSalary":50000}'), { plannedSalary: 50000 });
});
