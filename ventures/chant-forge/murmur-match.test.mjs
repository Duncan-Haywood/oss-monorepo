// The one-voice murmur at the chorus's level (sing.mjs `murmurSource: 'match'`, opt-in; README "One voice at the
// chorus's level", eval/murmur-match-check.md).
import test from 'node:test';
import assert from 'node:assert/strict';
import { singNote, latinCoda } from './sing.mjs';
import { frameFeatures } from './onsets.mjs';

const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const dur = 60 / 124 / 2, f = 146.83; // an eighth on D3 at part D's tempo
const um = (seed, o = {}) => singNote(f, dur, rate, { vowel: 'u', coda: latinCoda('um'), seed, ...o });
// the held murmur (from 30 to 10 ms before the note's end) against the vowel (45 to 105 ms in), dB of total power
const held = (x) => {
  const lv = (a, b) => { const v = []; for (let t = a; t < b; t += 0.005) v.push(frameFeatures(x, Math.round(t * rate), rate).tot); return med(v); };
  return db(lv(dur - 0.03, dur - 0.01), lv(0.045, 0.105));
};
const SEEDS = Array.from({ length: 12 }, (_, k) => 101 + 37 * k);

test("match: the murmur's level against its vowel follows the chorus's, note by note", () => {
  const one = [], match = [];
  for (const s of SEEDS) { const c = held(um(s)); one.push(held(um(s, { murmurSource: 'one' })) - c); match.push(held(um(s, { murmurSource: 'match' })) - c); }
  // 12 seeds on main: one -3 to +8 dB off the chorus (mean 3.3), match -4 to +5 (mean 1.9)
  const off = (a) => a.reduce((s, v) => s + Math.abs(v), 0) / a.length, msg = `one ${one.map((v) => v.toFixed(0))}, match ${match.map((v) => v.toFixed(0))}`;
  assert.ok(Math.max(...one) >= 7, msg); // the fault: the one voice far louder than the chorus on some note
  assert.ok(Math.max(...match.map(Math.abs)) <= 6, msg);
  assert.ok(off(match) < off(one) - 1, msg);
});

test('match: everything before the closure is the same samples as the chorus', () => {
  const a = um(5), b = um(5, { murmurSource: 'match' }), end = Math.round((dur - 0.1) * rate);
  for (let i = 0; i < end; i++) if (a[i] !== b[i]) assert.fail(`sample ${i} differs`);
});
