import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readWav, analyze, integratedLufs, truePeak, suggestGain, kWeight, kWeightedEnergy } from './master.mjs';
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
  // Spotify's own example: -20 LUFS with a -5 dBFS true peak is lifted only to -16
  const capped = platformPlayback(-20, undefined, -5).find((p) => p.name === 'Spotify');
  assert.equal(capped.gainDb, 4); assert.equal(capped.capped, true); assert.equal(capped.published, true);
  assert.equal(platformPlayback(-20, undefined, -10).find((p) => p.name === 'Spotify').gainDb, 6);
  assert.equal(platformPlayback(-20, undefined, -0.5).find((p) => p.name === 'Spotify').gainDb, 0);
  assert.deepEqual(platformPlayback(-20).filter((p) => p.published).map((p) => p.name), ['Spotify']);
  const s = sine(0.1, 5);
  const r = analyze({ rate: 48000, channels: [s, s] });
  assert.equal(r.platforms.length, 6);
});

// The pre-2026-11-13 truePeak, kept verbatim: the fast one (unchecked interior loop,
// windows that cannot raise the peak skipped) must return the same double.
function truePeakReference(x, factor = 4, half = 16) {
  const taps = [];
  for (let p = 0; p < factor; p++) {
    const t = [];
    for (let k = -half + 1; k <= half; k++) {
      const d = k - p / factor;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      t.push(sinc * (0.5 + 0.5 * Math.cos(Math.PI * d / half)));
    }
    taps.push(t);
  }
  let peak = 0;
  for (let i = 0; i < x.length; i++) {
    peak = Math.max(peak, Math.abs(x[i]));
    for (let p = 1; p < factor; p++) {
      let s = 0;
      for (let k = -half + 1, j = 0; k <= half; k++, j++) { const idx = i + k; if (idx >= 0 && idx < x.length) s += x[idx] * taps[p][j]; }
      peak = Math.max(peak, Math.abs(s));
    }
  }
  return peak;
}

test('truePeak returns the reference value bit for bit: random, bursty, short, clipped and NaN signals', () => {
  let s = 7;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const signals = [[], [0.5], [1, -1], new Float64Array(31).fill(0.3), new Float64Array(33).fill(-0.7)];
  for (const n of [5, 31, 32, 33, 64, 65, 100, 1000, 4097]) {
    signals.push(Float64Array.from({ length: n }, rnd));
    // quiet bed with rare loud bursts: most windows are skipped, the bursts are not
    signals.push(Float64Array.from({ length: n }, (_, i) => (i % 97 < 3 ? rnd() : rnd() * 0.01)));
    // alternating full-scale samples: inter-sample peaks well above the sample peak
    signals.push(Float64Array.from({ length: n }, (_, i) => (i % 2 ? 1 : -1) * (0.9 + 0.1 * Math.abs(rnd()))));
    // a sine near Nyquist/2 with a phase that puts the true peak between samples
    signals.push(Float64Array.from({ length: n }, (_, i) => 0.8 * Math.sin(Math.PI * (i + 0.5) / 2.03)));
  }
  const withNaN = Float64Array.from({ length: 200 }, rnd); withNaN[150] = NaN; signals.push(withNaN);
  for (const x of signals) {
    for (const [factor, half] of [[4, 16], [2, 8], [8, 4]]) {
      assert.ok(Object.is(truePeak(x, factor, half), truePeakReference(x, factor, half)), `n=${x.length} factor=${factor} half=${half}`);
    }
  }
});

test('truePeak with a floor is Math.max(floor, truePeak) bit for bit, including NaN either side', () => {
  let s = 11;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  const signals = [[], [0.5], new Float64Array(40).fill(0.3)];
  for (const n of [33, 100, 1000, 4097]) {
    signals.push(Float64Array.from({ length: n }, rnd));
    signals.push(Float64Array.from({ length: n }, (_, i) => (i % 97 < 3 ? rnd() : rnd() * 0.01)));
    signals.push(Float64Array.from({ length: n }, (_, i) => (i % 2 ? 1 : -1) * (0.9 + 0.1 * Math.abs(rnd()))));
  }
  const withNaN = Float64Array.from({ length: 200 }, rnd); withNaN[150] = NaN; signals.push(withNaN);
  for (const x of signals) {
    const own = truePeak(x);
    for (const floor of [0, 0.01, 0.5, own * 0.999, own, own * 1.001, 1.5, NaN]) {
      assert.ok(Object.is(truePeak(x, 4, 16, floor), Math.max(floor, own)), `n=${x.length} floor=${floor}`);
    }
  }
});

test('kWeightedEnergy is the running sum of squares of kWeight, bit for bit', () => {
  let s = 3;
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;
  for (const fs of [44100, 48000, 22050]) {
    for (const n of [0, 1, 2, 3, 500, 20000]) {
      const x = Float64Array.from({ length: n }, (_, i) => 0.6 * Math.sin(i * 0.031) + 0.3 * rnd());
      const w = kWeight(x, fs), ref = new Float64Array(n + 1);
      for (let i = 0; i < n; i++) ref[i + 1] = ref[i] + w[i] * w[i];
      const got = kWeightedEnergy(x, fs);
      assert.equal(got.length, n + 1);
      for (let i = 0; i <= n; i++) assert.ok(Object.is(got[i], ref[i]), `fs=${fs} n=${n} i=${i}`);
    }
  }
});

test('a master louder than -14 LUFS gets the -2 dBTP ceiling Spotify asks for', () => {
  const s = sine(0.5, 5); // about -9 LUFS stereo, true peak -6 dBTP: passes -2
  const r = analyze({ rate: 48000, channels: [s, s] });
  assert.match(r.checks.find((c) => c.name === 'true peak').note, /ceiling -2/);
  const t = sine(0.85, 5); // -1.4 dBTP: under -1, over -2
  const r2 = analyze({ rate: 48000, channels: [t, t] });
  assert.equal(r2.checks.find((c) => c.name === 'true peak').ok, false);
  const q = sine(0.1, 5); // quiet: the ordinary -1 ceiling
  assert.match(analyze({ rate: 48000, channels: [q, q] }).checks.find((c) => c.name === 'true peak').note, /ceiling -1$/);
});

test('momentary and short-term max: a 1 kHz tone reads its level, a short burst raises momentary not short-term', async () => {
  const { maxWindowLoudness, windowLoudnessRange, truePeakAnnex2 } = await import('./master.mjs');
  const fs = 48000, a = 10 ** (-23 / 20), x = new Float64Array(5 * fs);
  for (let i = 0; i < x.length; i++) x[i] = a * Math.sin(2 * Math.PI * 1000 * i / fs);
  assert.ok(Math.abs(maxWindowLoudness([x, x], fs, 0.4) - -23) < 0.1);
  assert.ok(Math.abs(maxWindowLoudness([x, x], fs, 3) - -23) < 0.1);
  const r = windowLoudnessRange([x, x], fs, 0.4, 1);
  assert.ok(r.max - r.min < 0.02);
  const y = new Float64Array(10 * fs);
  for (let i = 4 * fs; i < 4.4 * fs; i++) y[i] = a * Math.sin(2 * Math.PI * 1000 * i / fs);
  assert.ok(Math.abs(maxWindowLoudness([y, y], fs, 0.4) - -23) < 0.1);
  assert.ok(Math.abs(maxWindowLoudness([y, y], fs, 3) - (-23 + 10 * Math.log10(0.4 / 3))) < 0.1);
  assert.equal(maxWindowLoudness([new Float64Array(100)], fs, 0.4), -Infinity);
  // Annex 2 FIR on an fs/4 sine at 45 degrees (Tech 3341 case 16): within +0.2/-0.4 of -6 dBTP
  const z = new Float64Array(fs);
  for (let i = 0; i < z.length; i++) z[i] = 0.5 * Math.sin(Math.PI * i / 2 + Math.PI / 4);
  const tp = 20 * Math.log10(truePeakAnnex2(z));
  assert.ok(tp <= -5.8 && tp >= -6.4, String(tp));
});
