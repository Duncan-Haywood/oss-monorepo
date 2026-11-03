import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWav, analyze, verdict, integratedLufs } from './mastercheck.mjs';

function wav(chans, rate = 48000, bits = 16) {
  const n = chans[0].length, ch = chans.length, bytes = bits / 8;
  const b = Buffer.alloc(44 + n * ch * bytes);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * ch * bytes, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(ch, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * ch * bytes, 28); b.writeUInt16LE(ch * bytes, 32); b.writeUInt16LE(bits, 34);
  b.write('data', 36); b.writeUInt32LE(n * ch * bytes, 40);
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) {
    const v = Math.max(-1, Math.min(1, chans[c][i]));
    if (bits === 16) b.writeInt16LE(Math.round(v * 32767), 44 + (i * ch + c) * 2);
    else b.writeIntLE(Math.round(v * 8388607), 44 + (i * ch + c) * 3, 3);
  }
  return b;
}
const sine = (amp, f = 997, secs = 5, rate = 48000) => Float64Array.from({ length: secs * rate }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / rate));

test('full-scale 997 Hz stereo sine reads 0.0 LUFS (BS.1770 calibration: a 997 Hz stereo sine reads its dBFS)', () => {
  const s = sine(1); const w = parseWav(wav([s, s]));
  assert.ok(Math.abs(integratedLufs(w.chans, w.rate) - 0) < 0.1);
});
test('-20 dBFS stereo sine reads -20.0 LUFS, 16 and 24 bit alike', () => {
  const s = sine(0.1);
  for (const bits of [16, 24]) {
    const w = parseWav(wav([s, s], 48000, bits));
    assert.ok(Math.abs(integratedLufs(w.chans, w.rate) - -20) < 0.1, `${bits}`);
  }
});
test('quiet passages under the gate do not pull the reading down', () => {
  const loud = sine(0.1, 997, 5), quiet = sine(0.00005, 997, 5);
  const s = Float64Array.from([...loud, ...quiet]);
  const w = parseWav(wav([s, s]));
  assert.ok(Math.abs(integratedLufs(w.chans, w.rate) - -20) < 0.2);
});
test('inter-sample peak: a sine at fs/4 with 45 degree phase has samples at 0.707 but true peak near 1', () => {
  const s = Float64Array.from({ length: 4800 }, (_, i) => Math.sin(Math.PI / 2 * i + Math.PI / 4));
  const m = analyze({ rate: 48000, chans: [s.map((v) => v * 0.99), s.map((v) => v * 0.99)] });
  assert.ok(m.truePeakDb > -0.4 && m.truePeakDb < 0.2, String(m.truePeakDb));
});
test('clipping is counted and fails the verdict', () => {
  const s = sine(1.5).map((v) => Math.max(-1, Math.min(1, v)));
  const m = analyze(parseWav(wav([s, s])));
  assert.ok(m.clippedSamples > 100);
  assert.ok(verdict(m).some((x) => x.level === 'fail'));
});
test('out-of-phase stereo is flagged', () => {
  const s = sine(0.2); const m = analyze({ rate: 48000, chans: [s, s.map((v) => -v)] });
  assert.ok(m.mono.correlation < -0.99);
  assert.ok(verdict(m).some((x) => /correlation/.test(x.msg)));
});
test('silence is reported, not crashed on; bad files are refused', () => {
  const z = new Float64Array(48000 * 2);
  assert.equal(analyze({ rate: 48000, chans: [z, z] }).lufs, null);
  assert.throws(() => parseWav(Buffer.from('nope')), /RIFF/);
});
test('a -14 LUFS mix with a low peak passes', () => {
  const s = sine(10 ** (-14 / 20));
  const m = analyze(parseWav(wav([s, s])));
  assert.deepEqual(verdict(m), []);
});
