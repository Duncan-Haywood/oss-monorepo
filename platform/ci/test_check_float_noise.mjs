// Unit tests for the float-noise sweep's matcher (no browser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { findNoise } from './check_float_noise.mjs';

test('classic binary float errors are found', () => {
  assert.equal(findNoise('Total: 0.30000000000000004 kg').length, 1);
  assert.equal(findNoise('Rate 1.2999999999999998%').length, 1);
  assert.equal(findNoise('$14.000000000000002').length, 1);
  assert.equal(findNoise('-2.0000000000000004 m').length, 1);
});

test('rounded and deliberate precision is not noise', () => {
  assert.deepEqual(findNoise('Total $1,234.50, rate 3.125%, pi 3.14159265'), []);
  assert.deepEqual(findNoise('1.0000001 is seven places'), []);
  assert.deepEqual(findNoise('0.000000 and 1.999999'), []);
  assert.deepEqual(findNoise('year 2026, id 100000000001'), []);
});

test('context around the hit is returned once per hit', () => {
  const h = findNoise('a 0.1 + 0.2 = 0.30000000000000004 here, and 0.7000000000000001');
  assert.equal(h.length, 2);
  assert.match(h[0], /0\.30000000000000004/);
});
