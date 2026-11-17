import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loudnessRange } from './master.mjs';

// eval/ebu-tech3342.mjs synthesises EBU Tech 3342 Table 1 cases 1-4 from the table's
// text (once, twice and three times over, with and without 1.5 s of trailing
// silence) and exits 0 only when all 24 readings are inside +/-1 LU and the -10 LU
// gate control falls outside.
test('EBU Tech 3342 minimum-requirements cases 1-4: every reading inside tolerance', () => {
  const script = fileURLToPath(new URL('./eval/ebu-tech3342.mjs', import.meta.url));
  const p = spawnSync(process.execPath, [script, '--json'], { encoding: 'utf8' });
  assert.equal(p.status, 0, p.stdout + p.stderr);
  const rows = JSON.parse(p.stdout);
  assert.equal(rows.filter((r) => !r.control && r.ok).length, 24);
  assert.equal(rows.find((r) => r.control).ok, false);
});

test('loudnessRange: percentile ranks as in the Tech 3342 MATLAB listing, both gates', () => {
  const fs = 8000; // a low rate keeps the test quick (the K-weighting shelf at 1.68 kHz needs a Nyquist above it)
  const tone = (levels, sec) => {
    const m = sec * fs, x = new Float64Array(m * levels.length);
    for (let s = 0, i = 0; s < levels.length; s++) for (let k = 0; k < m; k++, i++) x[i] = 10 ** (levels[s] / 20) * Math.sin(2 * Math.PI * 1000 * i / fs);
    return [x, x];
  };
  // silence: nothing passes -70
  assert.equal(loudnessRange([new Float64Array(10 * fs)], fs).lra, null);
  // shorter than one 3 s window
  assert.equal(loudnessRange(tone([-20], 2), fs).kept, 0);
  // a -80 dBFS tail is under the absolute gate; it must not widen the range
  const r = loudnessRange(tone([-20, -30, -80], 20), fs);
  assert.ok(Math.abs(r.lra - 10) < 0.1, String(r.lra));
  assert.equal(r.levels.length, r.kept);
  const n = r.kept, rank = (p) => Math.round((n - 1) * p / 100 + 1) - 1;
  assert.equal(r.low, r.levels[rank(10)]);
  assert.equal(r.high, r.levels[rank(95)]);
  // -20 LU relative gate keeps a tone 25 dB down when it is most of the programme...
  const quiet = loudnessRange(tone([-20, -45, -45, -45], 20), fs);
  assert.ok(quiet.lra > 20, String(quiet.lra));
  // ...and a hop finer than 0.1 s gives the same answer on steady segments
  const fine = loudnessRange(tone([-20, -30], 20), fs, { hopSeconds: 0.05 });
  assert.ok(Math.abs(fine.lra - 10) < 0.1, String(fine.lra));
});
