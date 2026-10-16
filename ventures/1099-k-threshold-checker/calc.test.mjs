import test from 'node:test';
import assert from 'node:assert/strict';
import {
  federalThreshold,
  federalEraNote,
  stateThreshold,
  furnishDeadline,
  checkSource,
  checkAll,
  removeSource,
  sampleSources,
  toCsv,
  loadSources,
  STRICTER_STATE_THRESHOLDS,
  STATE_OPTIONS,
} from './calc.mjs';

test('the federal threshold is $20,000/200 transactions through 2023, $5,000 with no minimum in 2024, and $20,000/200 again from 2025 on', () => {
  assert.deepEqual(federalThreshold(2022), { throughYear: 2023, amount: 20000, minTransactions: 200 });
  assert.deepEqual(federalThreshold(2023), { throughYear: 2023, amount: 20000, minTransactions: 200 });
  assert.deepEqual(federalThreshold(2024), { onlyYear: 2024, amount: 5000, minTransactions: null });
  assert.deepEqual(federalThreshold(2025), { fromYear: 2025, amount: 20000, minTransactions: 200 });
  assert.deepEqual(federalThreshold(2026), { fromYear: 2025, amount: 20000, minTransactions: 200 });
  assert.deepEqual(federalThreshold(2030), { fromYear: 2025, amount: 20000, minTransactions: 200 });
});

test('a non-finite year falls back to the current (2025-on) federal era rather than throwing', () => {
  assert.deepEqual(federalThreshold(undefined), FEDERAL_ERA_FALLBACK());
  assert.deepEqual(federalThreshold(NaN), FEDERAL_ERA_FALLBACK());
});
function FEDERAL_ERA_FALLBACK() {
  return { fromYear: 2025, amount: 20000, minTransactions: 200 };
}

test('four states carry a stricter $600 threshold than the federal one; an unlisted state has none of its own', () => {
  assert.equal(stateThreshold('MD').amount, 600);
  assert.equal(stateThreshold('MA').amount, 600);
  assert.equal(stateThreshold('VT').amount, 600);
  assert.equal(stateThreshold('VA').amount, 600);
  assert.equal(stateThreshold('CA'), null);
  assert.equal(stateThreshold(''), null);
  assert.equal(Object.keys(STRICTER_STATE_THRESHOLDS).length, 4);
});

test('STATE_OPTIONS lists every stricter state plus a not-sure and an other option', () => {
  const values = STATE_OPTIONS.map((o) => o.value);
  assert.deepEqual(values, ['', 'MD', 'MA', 'VT', 'VA', 'DC', 'IL', 'MO', 'NJ', 'AR', 'OTHER']);
});

test('federalEraNote flags the 2024 retroactive-correction wrinkle and is silent for every other year', () => {
  assert.match(federalEraNote(2024), /did not have to withdraw/);
  assert.equal(federalEraNote(2023), null);
  assert.equal(federalEraNote(2025), null);
  assert.equal(federalEraNote(2026), null);
});

test('the 1099-K furnish deadline is January 31, rolled to the next business day on a weekend', () => {
  // 2027-01-31 is a Sunday -> real cutoff is 2027-02-01.
  assert.equal(furnishDeadline(2026), '2027-02-01');
  // 2026-01-31 is a Saturday -> rolls two days to Monday.
  assert.equal(furnishDeadline(2025), '2026-02-02');
  // 2025-01-31 is a Friday -> no roll.
  assert.equal(furnishDeadline(2024), '2025-01-31');
});

test('2026: $20,001 across 201 transactions meets the federal threshold', () => {
  const result = checkSource({ platform: 'eBay', state: '', grossPayments: 20001, transactionCount: 201 }, { taxYear: 2026 });
  assert.equal(result.likely, true);
  assert.equal(result.reason, 'federal');
  assert.match(result.status, /federal threshold for 2026/);
});

test('2026: exactly $20,000 does not meet the federal threshold -- the IRS wording is "exceeds", not "at least"', () => {
  const result = checkSource({ platform: 'eBay', state: '', grossPayments: 20000, transactionCount: 250 }, { taxYear: 2026 });
  assert.equal(result.likely, false);
});

test('2026: $20,001 across exactly 200 transactions does not meet the federal threshold -- more than 200 is required, not 200 itself', () => {
  const result = checkSource({ platform: 'eBay', state: '', grossPayments: 20001, transactionCount: 200 }, { taxYear: 2026 });
  assert.equal(result.likely, false);
});

test('2026: $25,000 across only 50 transactions does not meet the federal threshold -- both conditions are required', () => {
  const result = checkSource({ platform: 'eBay', state: '', grossPayments: 25000, transactionCount: 50 }, { taxYear: 2026 });
  assert.equal(result.likely, false);
  assert.equal(result.reason, 'neither');
});

test('2024: $5,001 with a single transaction meets the transition-year threshold, since 2024 has no transaction-count minimum', () => {
  const result = checkSource({ platform: 'Venmo', state: '', grossPayments: 5001, transactionCount: 1 }, { taxYear: 2024 });
  assert.equal(result.likely, true);
  assert.equal(result.reason, 'federal');
});

test('2024: an unusable (missing) transaction count still resolves, since 2024 does not gate on it', () => {
  const result = checkSource({ platform: 'Venmo', state: '', grossPayments: 6000 }, { taxYear: 2024 });
  assert.equal(result.likely, true);
});

test("a stricter state threshold applies on its own even when the federal one is not met", () => {
  const result = checkSource({ platform: 'Etsy', state: 'MD', grossPayments: 700, transactionCount: 5 }, { taxYear: 2026 });
  assert.equal(result.likely, true);
  assert.equal(result.reason, 'state');
  assert.match(result.status, /Maryland/);
});

test('below both the federal and the state threshold reads as unlikely, not as "no income to report"', () => {
  const result = checkSource({ platform: 'Etsy', state: 'MD', grossPayments: 400, transactionCount: 3 }, { taxYear: 2026 });
  assert.equal(result.likely, false);
  assert.match(result.status, /not required/);
});

test('meeting both the federal and a stricter state threshold reports "both" as the reason', () => {
  const result = checkSource({ platform: 'eBay', state: 'VA', grossPayments: 21000, transactionCount: 210 }, { taxYear: 2026 });
  assert.equal(result.reason, 'both');
});

test('a negative or non-numeric gross-payments figure is flagged for correction rather than guessed at', () => {
  assert.equal(checkSource({ platform: 'eBay', grossPayments: -5 }, { taxYear: 2026 }).status, 'Check inputs');
  assert.equal(checkSource({ platform: 'eBay', grossPayments: 'abc' }, { taxYear: 2026 }).status, 'Check inputs');
});

test('checkAll assigns a stable sourceIndex to every row in input order', () => {
  const rows = checkAll(sampleSources(), { taxYear: 2026 });
  assert.deepEqual(rows.map((r) => r.sourceIndex), [0, 1, 2, 3]);
});

test('removeSource drops exactly the row at the given index and leaves the rest untouched', () => {
  const sources = sampleSources();
  const after = removeSource(sources, 1);
  assert.equal(after.length, sources.length - 1);
  assert.equal(after.find((s) => s.platform === 'Venmo (goods and services)'), undefined);
  assert.equal(sources.length, 4); // original array is not mutated
});

test('removeSource ignores an out-of-range index rather than throwing', () => {
  const sources = sampleSources();
  assert.deepEqual(removeSource(sources, 99), sources);
  assert.deepEqual(removeSource(sources, -1), sources);
  assert.deepEqual(removeSource('not an array', 0), []);
});

test('sampleSources demonstrates a mix of likely and unlikely outcomes, including a state-only trigger', () => {
  const rows = checkAll(sampleSources(), { taxYear: 2026 });
  assert.ok(rows.some((r) => r.reason === 'federal'));
  assert.ok(rows.some((r) => r.reason === 'state'));
});

test('toCsv quotes fields and round-trips the header plus one row per source', () => {
  const rows = checkAll(sampleSources(), { taxYear: 2026 });
  const csv = toCsv(rows);
  const lines = csv.split('\n');
  assert.equal(lines.length, rows.length + 1);
  assert.equal(lines[0], 'platform,state,grossPayments,transactionCount,status,deadline');
});

test('loadSources drops non-object rows and never throws on malformed JSON', () => {
  assert.deepEqual(loadSources(null), []);
  assert.deepEqual(loadSources('not json'), []);
  assert.deepEqual(loadSources('[1,2,{"platform":"eBay"}]'), [{ platform: 'eBay' }]);
  assert.deepEqual(loadSources(JSON.stringify(sampleSources())), sampleSources());
});

test('an unverified flagged state keeps the federal answer and adds a caution, never a guessed amount', () => {
  const below = checkSource({ platform: 'Etsy', state: 'IL', grossPayments: 3000, transactionCount: 10 }, { taxYear: 2026 });
  assert.equal(below.likely, false);
  assert.equal(below.stateThreshold, null);
  assert.match(below.stateCaution, /Illinois/);
  assert.match(below.status, /confirm with the state revenue department/);
  const above = checkSource({ platform: 'eBay', state: 'MO', grossPayments: 30000, transactionCount: 300 }, { taxYear: 2026 });
  assert.equal(above.likely, true);
  assert.doesNotMatch(above.status, /confirm with/);
  assert.equal(checkSource({ platform: 'x', state: 'OTHER', grossPayments: 1, transactionCount: 1 }).stateCaution, null);
});
