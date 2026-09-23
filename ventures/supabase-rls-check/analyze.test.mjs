import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReport } from './analyze.mjs';

function result(overrides) {
  return { table: 't', ok: true, status: 200, rowsReturned: 0, totalCount: null, columns: [], error: null, ...overrides };
}

test('a table returning real rows is classified as exposed, with a danger finding', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'profiles', rowsReturned: 1, totalCount: 42, columns: ['id', 'email', 'is_admin'] }),
  ]);
  assert.equal(report.ok, false);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].table, 'profiles');
  assert.equal(report.findings[0].severity, 'danger');
  assert.match(report.findings[0].detail, /42 row\(s\) total/);
  assert.match(report.findings[0].detail, /id, email, is_admin/);
});

test('a table that rejects the anon key with 401 is classified as blocked, no finding', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'private_orders', ok: false, status: 401, rowsReturned: 0 }),
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.blocked.length, 1);
  assert.equal(report.blocked[0].table, 'private_orders');
});

test('a table that rejects with 403 is also blocked', () => {
  const report = buildReport('https://x.supabase.co', [result({ table: 't', ok: false, status: 403 })]);
  assert.equal(report.blocked.length, 1);
});

test('zero rows with zero exact count is unconfirmed, not a finding either way', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'maybe_empty', rowsReturned: 0, totalCount: 0 }),
  ]);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.unconfirmed.length, 1);
  assert.equal(report.ok, true);
});

test('zero rows with no count header at all is also unconfirmed', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'no_count_header', rowsReturned: 0, totalCount: null }),
  ]);
  assert.equal(report.unconfirmed.length, 1);
  assert.equal(report.dangerCount, 0);
});

test('a nonzero exact count with zero returned rows still counts as exposed (count leak)', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'counted_only', rowsReturned: 0, totalCount: 7 }),
  ]);
  assert.equal(report.dangerCount, 1);
  assert.equal(report.findings[0].table, 'counted_only');
});

test('a failed request is an error, never read as either exposed or blocked', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'unreachable', ok: false, status: null, error: 'timed out' }),
  ]);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.blocked.length, 0);
  assert.equal(report.unconfirmed.length, 0);
  assert.equal(report.errors.length, 1);
  assert.equal(report.incomplete, true);
});

test('an unexpected 5xx status is an error, not a finding', () => {
  const report = buildReport('https://x.supabase.co', [result({ table: 't', ok: false, status: 503 })]);
  assert.equal(report.errors.length, 1);
  assert.equal(report.dangerCount, 0);
});

test('a schemaError makes the whole report incomplete and not ok', () => {
  const report = buildReport('https://x.supabase.co', [], { schemaError: 'HTTP 401 reading the schema root' });
  assert.equal(report.ok, false);
  assert.equal(report.incomplete, true);
  assert.equal(report.tablesChecked, 0);
});

test('a clean project with every table blocked is ok with no findings', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'a', ok: false, status: 401 }),
    result({ table: 'b', ok: false, status: 403 }),
  ]);
  assert.equal(report.ok, true);
  assert.equal(report.dangerCount, 0);
  assert.equal(report.tablesChecked, 2);
});

test('truncated flag is carried through from meta', () => {
  const report = buildReport('https://x.supabase.co', [result({ table: 'a' })], { truncated: true });
  assert.equal(report.truncated, true);
});

test('multiple exposed tables all appear as separate findings', () => {
  const report = buildReport('https://x.supabase.co', [
    result({ table: 'a', rowsReturned: 1, totalCount: 1 }),
    result({ table: 'b', rowsReturned: 1, totalCount: 5 }),
    result({ table: 'c', ok: false, status: 401 }),
  ]);
  assert.equal(report.dangerCount, 2);
  assert.deepEqual(report.findings.map((f) => f.table).sort(), ['a', 'b']);
});
