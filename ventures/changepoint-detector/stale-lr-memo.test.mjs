// staleLRMarkov keeps its last few answers (rounded-walk.mjs, markovMemo): a repeat question gets the
// answer a fresh fit gives, as its own copy, and a different stretch or option set is fitted afresh.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { staleLRMarkov } from './rounded-walk.mjs';

function mulberry32(a) {
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// a one-tick walk recorded rounded, with a stretch carried forward: 40 steps, cheap to fit
function ticks(seed, n = 41) {
  const rand = mulberry32(seed), out = [];
  let x = 0;
  for (let t = 0; t < n; t++) { x += (rand() - 0.5) * 1.6; out.push(t > 20 && t % 3 ? out[t - 1] : Math.round(x)); }
  return out;
}

test('a repeat gets the same answer, as a copy the caller may change', () => {
  const k = ticks(7);
  const a = staleLRMarkov(k);
  assert.ok(a && Number.isFinite(a.lr));
  a.lr = -1;
  const b = staleLRMarkov(k.slice());
  assert.notEqual(b.lr, -1, 'the first caller changing its copy does not reach the second');
  assert.notStrictEqual(a, b);
  assert.deepEqual(staleLRMarkov(k), b);
});

test('a different stretch or option is fitted, not read from the memo', () => {
  const k = ticks(11), k2 = k.slice();
  k2[30] += 1;
  const base = staleLRMarkov(k);
  const other = staleLRMarkov(k2);
  assert.notDeepEqual(other, base);
  // nus: Infinity alone is a different question from the default grid (2, 4, 10, Infinity)
  const gauss = staleLRMarkov(k, { nus: [Infinity] });
  assert.equal(gauss.nu0, Infinity);
  assert.deepEqual(staleLRMarkov(k, { nus: [Infinity] }), gauss);
  // too short is still null, every time
  assert.equal(staleLRMarkov(k.slice(0, 10)), null);
  assert.equal(staleLRMarkov(k.slice(0, 10)), null);
});
