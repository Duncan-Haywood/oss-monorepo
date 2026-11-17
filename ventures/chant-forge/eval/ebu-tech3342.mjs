#!/usr/bin/env node
// master.mjs loudnessRange against EBU Tech 3342 (November 2023), Table 1,
// "Minimum requirements test signals", read from tech.ebu.ch/docs/tech/tech3342.pdf
// on 2026-11-14. Cases 1-4 are synthesised from the table's words at 48 kHz in
// 64-bit floats: "Stereo sine wave, 1000 Hz ... (per-channel peak level); signal
// applied in phase to both channels ... 20 s duration; followed immediately by the
// same signal at" the next level. Cases 5 and 6 are authentic programme, only in
// the EBU's WAV set (403 from this session for Tech 3341's set), and are not run.
// The table also says "the expected response is unchanged if the test signal is
// repeated one or more times in its full length": each case is also run twice and
// three times over, and with the listing's 1.5 s of trailing silence.
// node eval/ebu-tech3342.mjs [--json]   exit 0 when every reading is inside tolerance
import { loudnessRange } from '../master.mjs';

const fs = 48000;
function tones(levels, seconds = 20) {
  const m = Math.round(seconds * fs), x = new Float64Array(m * levels.length);
  for (let s = 0, i = 0; s < levels.length; s++) {
    const a = 10 ** (levels[s] / 20);
    for (let k = 0; k < m; k++, i++) x[i] = a * Math.sin(2 * Math.PI * 1000 * i / fs);
  }
  return [x, x];
}
const CASES = [
  { id: 1, levels: [-20, -30], want: 10 },
  { id: 2, levels: [-20, -15], want: 5 },
  { id: 3, levels: [-40, -20], want: 20 },
  { id: 4, levels: [-50, -35, -20, -35, -50], want: 15 },
];
const rows = [];
for (const c of CASES) {
  for (const times of [1, 2, 3]) {
    const levels = Array.from({ length: times }, () => c.levels).flat();
    for (const tail of [0, 1.5]) {
      const r = loudnessRange(tones(levels), fs, { tailSeconds: tail });
      rows.push({ case: c.id, repeats: times, tailSeconds: tail, lra: +r.lra.toFixed(3), low: +r.low.toFixed(3), high: +r.high.toFixed(3), kept: r.kept, windows: r.windows, want: c.want, ok: Math.abs(r.lra - c.want) <= 1 });
    }
  }
}
// Negative control: case 3 (-40 then -20 dBFS: abs-gated mean about -23 LUFS) with
// BS.1770's integrated-loudness gate (-10 LU) instead of 3342's -20 drops the -40
// tone and must fail, or the tones would not be testing the gate. (Case 4 does not
// tell the two apart: its mean is about -26.7, so -35 passes either gate.)
const ctl = loudnessRange(tones(CASES[2].levels), fs, { relativeGateLu: -10 });
rows.push({ case: '3, -10 LU gate', repeats: 1, tailSeconds: 0, lra: +ctl.lra.toFixed(3), low: +ctl.low.toFixed(3), high: +ctl.high.toFixed(3), kept: ctl.kept, windows: ctl.windows, want: 20, ok: Math.abs(ctl.lra - 20) <= 1, control: true });
const pass = rows.every((r) => (r.control ? !r.ok : r.ok));
if (process.argv.includes('--json')) console.log(JSON.stringify(rows, null, 2));
else {
  console.log('case repeats tail  LRA     10th     95th    kept/windows  wanted');
  for (const r of rows) console.log(`${String(r.case).padEnd(r.control ? 16 : 5)}${String(r.repeats).padEnd(8)}${r.tailSeconds.toFixed(1).padEnd(6)}${r.lra.toFixed(3).padEnd(8)}${r.low.toFixed(2).padEnd(9)}${r.high.toFixed(2).padEnd(8)}${`${r.kept}/${r.windows}`.padEnd(14)}${r.want} +/-1 ${r.ok ? 'ok' : 'out'}`);
  console.log(`${rows.filter((r) => r.ok && !r.control).length} of ${rows.filter((r) => !r.control).length} inside tolerance; control ${rows.at(-1).ok ? 'PASSED (bad: the gate is untested)' : 'fails as it should'}`);
}
process.exit(pass ? 0 : 1);
