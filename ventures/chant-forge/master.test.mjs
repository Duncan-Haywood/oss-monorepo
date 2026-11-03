import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWav, analyze, integratedLufs, truePeak, suggestGain } from './master.mjs';
import { run } from './master-cli.mjs';

function wav(chs, rate, bits = 16) {
  const n = chs[0].length, c = chs.length, by = bits / 8;
  const b = Buffer.alloc(44 + n * c * by);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * c * by, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(bits === 32 ? 3 : 1, 20); b.writeUInt16LE(c, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * c * by, 28); b.writeUInt16LE(c * by, 32); b.writeUInt16LE(bits, 34); b.write('data', 36); b.writeUInt32LE(n * c * by, 40);
  for (let i = 0; i < n; i++) for (let k = 0; k < c; k++) {
    const o = 44 + (i * c + k) * by, v = chs[k][i];
    if (bits === 16) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32768))), o); else b.writeFloatLE(v, o);
  }
  return b;
}
const sine = (amp, secs, rate = 48000, f = 997) => Float64Array.from({ length: secs * rate }, (_, i) => amp * Math.sin(2 * Math.PI * f * i / rate));

test('0 dBFS 997 Hz sine on both channels measures 0.0 LUFS and mono -3.01 (BS.1770 reference)', () => {
  const s = sine(1, 5);
  assert.ok(Math.abs(integratedLufs([s, s], 48000).lufs - 0) < 0.05);
  assert.ok(Math.abs(integratedLufs([s], 48000).lufs - -3.01) < 0.05);
});
test('level scales one for one, and a mono 0 dBFS sine is 3 LU quieter than stereo', () => {
  const s = sine(0.1, 5), t = sine(1, 5);
  assert.ok(Math.abs(integratedLufs([s, s], 48000).lufs - -20) < 0.05);
  assert.ok(Math.abs(integratedLufs([t], 48000).lufs - -3.01) < 0.05);
});
test('silence and the absolute gate give -Infinity', () => {
  assert.equal(integratedLufs([new Float64Array(96000)], 48000).lufs, -Infinity);
});
test('true peak finds an inter-sample overshoot that sample peak misses', () => {
  // fs/4 sine at 45 degrees: samples are +-0.707 of a 1.0-amplitude wave, true peak 1.0
  const x = Float64Array.from({ length: 400 }, (_, i) => Math.sin(Math.PI / 2 * i + Math.PI / 4));
  const sp = Math.max(...x.map(Math.abs));
  assert.ok(sp < 0.71);
  assert.ok(truePeak(x) > 0.98 && truePeak(x) < 1.02);
});
test('wav round trip, a good master passes, a hot one and a phase-inverted one fail', () => {
  const good = sine(0.45, 6); // about -7 dBFS; make loudness near -14 with a lower amp
  const quiet = sine(0.1, 6);
  const inv = quiet.map((v) => -v);
  const r1 = analyze(readWav(wav([sine(0.2, 6), sine(0.2, 6)], 48000)));
  assert.ok(r1.pass, JSON.stringify(r1.checks));
  const r2 = analyze(readWav(wav([good.map((v) => Math.min(1, v * 3)), good.map((v) => Math.min(1, v * 3))], 48000)));
  assert.ok(!r2.pass && r2.clipRuns > 0);
  const r3 = analyze(readWav(wav([sine(0.2, 6), sine(0.2, 6).map((v) => -v)], 48000)));
  assert.ok(!r3.checks.find((c) => c.name === 'mono compatibility').ok);
  assert.ok(inv.length === quiet.length);
});
test('float32 wav and cli output', async () => {
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os'); const { join } = await import('node:path');
  const f = join(mkdtempSync(join(tmpdir(), 'cf-')), 't.wav');
  writeFileSync(f, wav([sine(0.2, 6), sine(0.2, 6)], 48000, 32));
  const o = run([f]);
  assert.equal(o.code, 0); assert.match(o.text, /PASS {2}loudness/);
  assert.equal(run([]).code, 2);
  assert.equal(run(['/nonexistent.wav']).code, 2);
});

test('suggestGain hits the target, is capped by true-peak room, and is null for silence', () => {
  assert.equal(suggestGain(-16.8, -12), 2.8);
  assert.equal(suggestGain(-20, -3), 2);
  assert.equal(suggestGain(-8, -1), -6);
  assert.equal(suggestGain(-Infinity, -Infinity), null);
  const s = sine(0.1, 5); // -20 LUFS stereo, quiet peak
  const r = analyze({ rate: 48000, channels: [s, s] });
  assert.ok(Math.abs(r.suggestedGainDb - 6) < 0.1);
});

test('platform playback gain: turn-down everywhere, turn-up only where the service does it', async () => {
  const { platformPlayback } = await import('./master.mjs');
  const loud = Object.fromEntries(platformPlayback(-8).map((p) => [p.name, p.gainDb]));
  assert.equal(loud.Spotify, -6); assert.equal(loud['Apple Music'], -8); assert.equal(loud.Deezer, -7);
  const quiet = Object.fromEntries(platformPlayback(-20).map((p) => [p.name, p.gainDb]));
  assert.equal(quiet.Spotify, 6); assert.equal(quiet.YouTube, 0); assert.equal(quiet.Tidal, 0);
  assert.equal(platformPlayback(-Infinity), null);
  const s = sine(0.1, 5);
  const r = analyze({ rate: 48000, channels: [s, s] });
  assert.equal(r.platforms.length, 6);
});
