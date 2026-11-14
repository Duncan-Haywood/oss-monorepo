#!/usr/bin/env node
// Cross-check master.mjs loudnessRange (EBU Tech 3342) against ffmpeg's ebur128
// filter, which prints LRA from the same definition (libavfilter keeps a 0.1 LU
// histogram, so a few hundredths of an LU apart is expected).
// node eval/ffmpeg-lra-check.mjs [--json]   (needs ffmpeg; skips with exit 0 if absent)
// Signals: Tech 3342 cases 1-4 as ffmpeg sines, pink-noise programmes with steps,
// a fade and a quiet bed, and chant-forge's own preview renders (cli.mjs, then
// render-cli.mjs) with and without --sections, which change the backing's energy.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readWav, loudnessRange } from '../master.mjs';

if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('ffmpeg not found: skipped'); process.exit(0); }
const here = dirname(dirname(fileURLToPath(import.meta.url)));
const dir = mkdtempSync(join(tmpdir(), 'cf-lra-'));
const sine = (db, d) => `sine=f=1000:d=${d}:r=48000,volume=${db}dB`;
// ffmpeg's sine source is at 1/8 full scale (-18.06 dBFS peak): lift it to the stated peak
// (a volume *expression* is a linear factor, not dB: hence pow(10, dB/20) below)
const steps = (levels) => `${levels.map((l, i) => `${sine(l + 18.0618, 20)}[s${i}]`).join(';')};${levels.map((_, i) => `[s${i}]`).join('')}concat=n=${levels.length}:v=0:a=1`;
const lavfi = [
  ['3342 case 1 (-20, -30 dBFS)', steps([-20, -30])],
  ['3342 case 2 (-20, -15)', steps([-20, -15])],
  ['3342 case 3 (-40, -20)', steps([-40, -20])],
  ['3342 case 4 (-50 -35 -20 -35 -50)', steps([-50, -35, -20, -35, -50])],
  ['pink noise, steady -23 dB', 'anoisesrc=d=30:c=pink:r=48000:seed=7,volume=-23dB'],
  ['pink noise, 6 dB steps every 5 s', "anoisesrc=d=30:c=pink:r=48000:seed=9,volume='pow(10,(-12-6*floor(t/5))/20)':eval=frame"],
  ['pink noise, 20 s fade-out', 'anoisesrc=d=40:c=pink:r=48000:seed=11,volume=-14dB,afade=t=out:st=20:d=20'],
  ['pink noise, loud 10 s then -60 dB bed', "anoisesrc=d=40:c=pink:r=48000:seed=13,volume='pow(10,if(lt(t,10),-12,-60)/20)':eval=frame"],
];
const rows = [];
function compare(name, file) {
  const p = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = p.stderr.slice(p.stderr.lastIndexOf('Summary:'));
  const ff = parseFloat(/LRA:\s+(-?[\d.]+) LU/.exec(s)[1]);
  const w = readWav(readFileSync(file));
  const r = loudnessRange(w.channels, w.rate), ours = r.lra;
  // The same gated levels read one rank either side of the listing's 10th and 95th
  // percentile index: where neighbouring windows are far apart (a steep level change
  // with few windows kept), a meter with another rank rule reads differently.
  const L = r.levels, n = L.length, at = (p, d) => L[Math.min(n - 1, Math.max(0, Math.round((n - 1) * p / 100) + d))];
  const lo = Math.min(...[-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => at(95, b) - at(10, a))));
  const hi = Math.max(...[-1, 0, 1].flatMap((a) => [-1, 0, 1].map((b) => at(95, b) - at(10, a))));
  const gap = ours === null ? null : +Math.abs(ours - ff).toFixed(2);
  // ffmpeg prints one decimal, so allow 0.05 LU of its rounding on the bracket
  const ok = gap !== null && (gap <= 0.2 || (ff >= lo - 0.05 && ff <= hi + 0.05));
  rows.push({ name, seconds: +(w.channels[0].length / w.rate).toFixed(1), kept: n, ffmpeg: ff, ours: ours === null ? null : +ours.toFixed(2), gap, rankBracket: [+lo.toFixed(2), +hi.toFixed(2)], ok });
}
for (const [name, src] of lavfi) {
  const f = join(dir, 'a.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', f]);
  compare(name, f);
}
const renders = [
  ['dies-irae.gabc', ['--fit', '8', '--genre', 'metal', '--halftime']],
  ['dies-irae.gabc', ['--fit', '8', '--genre', 'deep-house', '--sections']],
  ['pange-lingua-full.gabc', ['--fit', '8', '--genre', 'edm', '--sections']],
  ['te-deum.gabc', ['--fit', '8']],
];
for (const [gabc, opts] of renders) {
  const mid = join(dir, 'p.mid'), wav = join(dir, 'p.wav');
  execFileSync(process.execPath, [join(here, 'cli.mjs'), join(here, 'corpus', gabc), '-o', mid, ...opts], { stdio: 'pipe' });
  execFileSync(process.execPath, [join(here, 'render-cli.mjs'), mid, '-o', wav, '--rate', '48000'], { stdio: 'pipe' });
  compare(`render: ${gabc} ${opts.join(' ')}`, wav);
}
rmSync(dir, { recursive: true, force: true });
const worst = Math.max(...rows.map((r) => r.gap ?? Infinity));
const pass = rows.every((r) => r.ok);
if (process.argv.includes('--json')) console.log(JSON.stringify({ rows, worst, pass }, null, 2));
else {
  for (const r of rows) console.log(`${r.name.padEnd(60)} ${String(r.seconds).padStart(6)} s ${String(r.kept).padStart(5)} kept  LRA ffmpeg ${r.ffmpeg.toFixed(1).padStart(5)}  ours ${String(r.ours).padStart(6)}  +/-1 rank ${r.rankBracket.join('..')}${r.gap > 0.2 ? (r.ok ? '  (inside the rank bracket)' : '  OUT') : ''}`);
  console.log(`worst gap ${worst.toFixed(2)} LU; ${rows.filter((r) => r.gap <= 0.2).length} of ${rows.length} within 0.2 LU, ${rows.filter((r) => r.ok).length} of ${rows.length} within 0.2 LU or the +/-1 rank bracket`);
}
process.exit(pass ? 0 : 1);
