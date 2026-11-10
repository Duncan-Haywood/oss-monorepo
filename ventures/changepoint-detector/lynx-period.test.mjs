import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SETUPS, count } from './eval/lynx-period.mjs';

// Lynx has no documented step, so every cut is a false alarm (README "Lynx: a known period does not remove the cycle").
test('lynx: giving the period leaves 10 to 24 false steps, never zero', () => {
  const got = Object.fromEntries(Object.entries(SETUPS).map(([k, o]) => [k, count(o)]));
  assert.deepEqual(got, {
    '--period 8': 24, '--log --period 8': 18, '--period 9': 19, '--log --period 9': 16,
    '--period 10': 16, '--log --period 10': 18, '--period 11': 17, '--log --period 11': 12,
    '--period 12': 18, '--log --period 12': 10, '--period 10 --drift': 17,
  });
});
