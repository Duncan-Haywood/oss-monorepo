import test from 'node:test';
import assert from 'node:assert/strict';
import { numCell, parseSeries } from './parse-series.mjs';
import * as engine from './engine.mjs';

test('numCell reads a comma by its shape', () => {
  assert.equal(numCell('1,200.50'), 1200.5);
  assert.equal(numCell('$3,000'), 3000);
  assert.equal(numCell('-1,234'), -1234);
  assert.equal(numCell('29,99'), 29.99); // an EU-locale decimal comma, read as 2999 before 2026-11-20
  assert.equal(numCell('1.234,56'), 1234.56);
  assert.ok(Number.isNaN(numCell('1,2345'))); // neither thousands nor decimal: not a number
  assert.equal(numCell(' 7 '), 7);
  assert.ok(Number.isNaN(numCell('')));
  assert.equal(numCell('1.234,5', true), 1234.5);
});

test('a quoted decimal-comma cell in a comma CSV parses, and an odd comma is skipped', () => {
  const r = parseSeries('day,sales\n1,"29,99"\n2,"1,250.00"\n3,"1,2345"\n4,30');
  assert.deepEqual(r.values, [29.99, 1250, 30]);
  assert.equal(r.skipped, 1);
});

test('parseSeries handles more rows than a spread call allows', () => {
  const csv = Array.from({ length: 200000 }, (_, i) => String(i % 7)).join('\n');
  assert.equal(parseSeries(csv).values.length, 200000);
});

test('engine.mjs re-exports the moved parsers', () => {
  assert.equal(engine.numCell, numCell);
  assert.equal(engine.parseSeries, parseSeries);
});
