// Parity: app/mortality.js reproduces the Python competing-risks reference
// (reproducibility/un_wpp2024_mortality/extract.py) on 24 couples, and the table is sane.
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { strict as assert } from 'node:assert';
import { competingRisks, deathRate } from '../mortality.js';

const dir = new URL('../data/', import.meta.url);
const table = JSON.parse(readFileSync(new URL('us_mortality_wpp2024.json', dir)));
const cases = JSON.parse(readFileSync(new URL('us_mortality_wpp2024_testvectors.json', dir)));

const close = (x, y, what) => assert.ok(Math.abs(x - y) <= 1e-12 + 1e-9 * Math.abs(y), `${what}: js ${x} vs python ${y}`);

test('competing risks match Python on every test couple', () => {
  for (const [i, c] of cases.entries()) {
    const got = competingRisks(table, c.a, c.b, c.start_year, c.divorce_rates, c.horizon);
    const want = c.expected;
    assert.equal(got.years, want.years, `case ${i} years`);
    for (const k of ['p_divorce', 'p_widowhood', 'p_still_married']) close(got[k], want[k], `case ${i} ${k}`);
    want.married.forEach((m, k) => close(got.married[k], m, `case ${i} married[${k}]`));
    close(got.p_divorce + got.p_widowhood + got.p_still_married, 1, `case ${i} shares sum to 1`);
  }
  assert.ok(cases.some((c) => c.divorce_rates.includes(null)), 'a case stops at a year with no estimate');
});

test('death rates are monotone in old age and higher for men', () => {
  for (const year of [2024, 2050, 2100]) {
    assert.ok(deathRate(table, 'M', year, 80) > deathRate(table, 'M', year, 60));
    assert.ok(deathRate(table, 'M', year, 60) > deathRate(table, 'F', year, 60));
  }
  assert.equal(deathRate(table, 'F', 1990, 120), deathRate(table, 'F', 2024, 100), 'edges clamp');
  assert.ok(table.licence.includes('CC BY 3.0 IGO'));
});
