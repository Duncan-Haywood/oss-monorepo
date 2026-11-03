import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { netPerSale, yearOne, scenarios, validate, measuredTraffic, loadEvaluations, flagshipSlugs, ventureSlugs } from './evaluate.mjs';

test('merchant-of-record fee is 5% + 50c; donations carry none', () => {
  assert.equal(netPerSale(100, 'one-time'), 94.5);
  assert.equal(netPerSale(0.4, 'one-time'), 0);
  assert.equal(netPerSale(5, 'donation'), 5);
});

test('one-time revenue is visitors x conversion x net x 12', () => {
  const v = yearOne(1000, { unit: 'one-time', price_usd: 10.5, conversion: 0.01 });
  assert.equal(Math.round(v), Math.round(1000 * 0.01 * 12 * (10.5 * 0.95 - 0.5)));
});

test('monthly subscribers accumulate with churn', () => {
  const noChurn = yearOne(100, { unit: 'monthly', price_usd: 10.5, conversion: 0.01, monthly_churn: 0 });
  // 1 new subscriber a month, no churn: 1+2+...+12 = 78 subscriber-months.
  assert.equal(Math.round(noChurn * 100), Math.round(78 * (10.5 * 0.95 - 0.5) * 100));
  const churn = yearOne(100, { unit: 'monthly', price_usd: 10.5, conversion: 0.01, monthly_churn: 0.5 });
  assert.ok(churn < noChurn);
});

test('scenarios: gated mechanisms stay out of "now", flat services only in target', () => {
  const ev = {
    traffic_target_monthly: { value: 1000 },
    mechanisms: [
      { unit: 'one-time', price_usd: 20, conversion: 0.01, gate: 'payout-rail' },
      { unit: 'flat', price_usd: 400, conversion: 0, gate: 'payout-rail', expected_count_per_year: 2 },
      { unit: 'donation', price_usd: 5, conversion: 0.01, gate: 'none' },
    ],
  };
  const s = scenarios(ev, 100);
  assert.equal(s.now, 100 * 0.01 * 12 * 5);
  assert.ok(s.rail > s.now);
  assert.equal(Math.round(s.target), Math.round(1000 * 0.01 * 12 * (20 * 0.95 - 0.5) + 2 * (400 * 0.95 - 0.5) + 1000 * 0.01 * 12 * 5));
});

test('measured traffic scales by calendar span and skips breakdown keys', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mon-'));
  const f = path.join(dir, 'v.json');
  fs.writeFileSync(f, JSON.stringify({ days: { '2026-10-01': { a: 3, 'bot:x': 900 }, '2026-10-10': { 'a/sub': 3, b: 4 } } }));
  const t = measuredTraffic(f);
  assert.equal(t.dayCount, 10);
  assert.equal(t.perSlug.get('a'), 6 * 3);
  assert.equal(t.total, 10 * 3);
  assert.equal(measuredTraffic(path.join(dir, 'missing.json')).total, 0);
});

test('validate catches an uncovered category, a missing basis and an implausible conversion', () => {
  const data = { evaluations: [{ id: 'x', kind: 'category', evaluated: '2026-11-02', buyer: 'someone real', verdict: 'a verdict here', next_measurement: 'a measurement', gtm: ['a', 'b'], traffic_target_monthly: { value: 1, basis: 'b' }, mechanisms: [{ name: 'm', unit: 'one-time', price_usd: 1, conversion: 0.5, gate: 'none' }] }] };
  const problems = validate(data, { categories: new Set(['x', 'y']), flagships: [], slugs: new Set() });
  assert.ok(problems.some((p) => p.includes('category y has no evaluation')));
  assert.ok(problems.some((p) => p.includes('basis missing')));
  assert.ok(problems.some((p) => p.includes('conversion must be between')));
});

test('the committed file covers every flagship and every mechanism has a basis', () => {
  const data = loadEvaluations();
  const ids = new Set(data.evaluations.map((e) => e.id));
  for (const f of flagshipSlugs()) assert.ok(ids.has(f), `flagship ${f} not evaluated`);
  const slugs = new Set(ventureSlugs());
  for (const e of data.evaluations.filter((x) => x.kind === 'venture')) assert.ok(slugs.has(e.id), e.id);
  for (const e of data.evaluations) for (const m of e.mechanisms) assert.ok(m.basis, `${e.id}/${m.name}`);
});
