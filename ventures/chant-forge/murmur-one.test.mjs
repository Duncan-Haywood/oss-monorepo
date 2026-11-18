// A nasal's murmur sung from one voice, not the beating chorus (sing.mjs `murmurSource: 'one'`, opt-in; README
// "A murmur dark in every phase").
import test from 'node:test';
import assert from 'node:assert/strict';
import { singNote, latinOnset, latinCoda } from './sing.mjs';
import { frameFeatures } from './onsets.mjs';

const rate = 44100, db = (a, b) => 10 * Math.log10((a + 1e-20) / (b + 1e-20));
const med = (a) => { const b = [...a].sort((x, y) => x - y); return b[b.length >> 1]; };
const dur = 60 / 88, f = 293.66; // a quarter at part c's tempo on D4
const bum = (lead, o = {}) => singNote(f, dur, rate, { vowel: 'u', onset: latinOnset('bum'), coda: latinCoda('bum'), lead, onsetLen: lead + 0.03, seed: 5, ...o });
// the murmur from 40 ms before the note's end to 80 ms after: its brightest 40 ms of tilt and its low band's deepest dip
const murmur = (x, lead) => {
  const t1 = lead + dur, tilt = [], low = [];
  for (let t = t1 - 0.04; t < t1 + 0.08; t += 0.005) { const q = frameFeatures(x, Math.round(t * rate), rate); tilt.push(db(q.hi1, q.low)); low.push(10 * Math.log10(q.low + 1e-20)); }
  const w = tilt.slice(0, tilt.length - 7).map((_, k) => med(tilt.slice(k, k + 8)));
  return { bright: Math.max(...w), dip: Math.min(...low) - med(low) };
};
const LEADS = [0.05, 0.07, 0.1, 0.13, 0.16];

test('one voice: the murmur stays dark and its low band holds at every lead', () => {
  for (const lead of LEADS) {
    const m = murmur(bum(lead, { murmurSource: 'one' }), lead);
    assert.ok(m.bright <= -38, `lead ${lead}: brightest ${m.bright.toFixed(1)} dB`);
    assert.ok(m.dip >= -6, `lead ${lead}: low band dips ${m.dip.toFixed(1)} dB`);
  }
});

test('the beating chorus (default) brightens or drops out at some lead: the fault the option removes', () => {
  const ms = LEADS.map((lead) => murmur(bum(lead), lead));
  assert.ok(ms.some((m) => m.bright > -32 || m.dip < -12), JSON.stringify(ms));
});

test('everything before the closure is the same samples either way', () => {
  const a = bum(0.1), b = bum(0.1, { murmurSource: 'one' }), end = Math.round((0.1 + dur - 0.1) * rate);
  for (let i = 0; i < end; i++) if (a[i] !== b[i]) assert.fail(`sample ${i} differs`);
  let diff = 0; for (let i = end; i < a.length; i++) diff += Math.abs(a[i] - b[i]);
  assert.ok(diff > 0, 'the murmur itself changes');
});
