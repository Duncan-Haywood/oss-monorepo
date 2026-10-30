import { test } from 'node:test';
import assert from 'node:assert/strict';
import { table, KS } from './eval/cyclic-power.mjs';

// Power on a known step inside a real cycle (README "Power on a step inside a cycle"): hits out of 3 positions per cell.
const want = {
  lynx: { mean: [2, 2, 3], 'min20': [2, 2, 3], ar1: [0, 0, 0], bootstrap: [0, 2, 3] },
  'sunspot-year': { mean: [3, 3, 3], 'min20': [2, 2, 3], ar1: [0, 0, 0], bootstrap: [0, 0, 3] },
};
for (const [f, w] of Object.entries(want)) {
  test(`${f}: --ar1 finds no inserted step at 0.5 to 2 sd; the bootstrap only at 2 sd`, () => {
    const hits = Object.values(table(f)).map((byK) => KS.map((k) => byK[k].hits));
    assert.deepEqual(hits, [w.mean, w.min20, w.ar1, w.bootstrap]);
  });
}
