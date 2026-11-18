#!/usr/bin/env node
// Cross-check master.mjs against ffmpeg's ebur128 filter (BS.1770 / EBU R128).
// node eval/ffmpeg-check.mjs   (needs ffmpeg on PATH; skips with exit 0 if absent)
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readWav, integratedLufs, truePeak } from '../master.mjs';

if (spawnSync('ffmpeg', ['-version']).status !== 0) { console.log('ffmpeg not found: skipped'); process.exit(0); }
const dir = mkdtempSync(join(tmpdir(), 'cf-'));
const cases = [
  ['sine 997 Hz -20 dB', 'sine=f=997:d=10,volume=-20dB'],
  ['sine 100 Hz -14 dB', 'sine=f=100:d=10,volume=-14dB'],
  ['sine 5 kHz -18 dB', 'sine=f=5000:d=10,volume=-18dB'],
  ['pink noise -23 dB', 'anoisesrc=d=10:c=pink:r=48000:seed=7,volume=-23dB'],
  ['white noise -16 dB', 'anoisesrc=d=10:c=white:r=48000:seed=3,volume=-16dB'],
  ['gated noise (loud 3 s, quiet 7 s)', 'anoisesrc=d=10:c=pink:r=48000:seed=5,volume=-12dB:eval=frame,volume=enable=\'gt(t,3)\':volume=-30dB'],
];
let worst = 0, worstTp = 0;
for (const [name, src] of cases) {
  const f = join(dir, 'a.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-ac', '2', '-ar', '48000', '-c:a', 'pcm_f32le', f]);
  const p = spawnSync('ffmpeg', ['-nostats', '-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  const s = p.stderr.slice(p.stderr.lastIndexOf('Summary:'));
  const I = parseFloat(/I:\s+(-?[\d.]+) LUFS/.exec(s)[1]);
  const tp = parseFloat(/Peak:\s+(-?[\d.]+) dBFS/.exec(s)[1]);
  const w = readWav(readFileSync(f));
  const ours = integratedLufs(w.channels, w.rate).lufs;
  const tpo = 20 * Math.log10(Math.max(...w.channels.map((c) => truePeak(c))));
  worst = Math.max(worst, Math.abs(ours - I)); worstTp = Math.max(worstTp, Math.abs(tpo - tp));
  console.log(`${name.padEnd(34)} LUFS ffmpeg ${I.toFixed(1)} ours ${ours.toFixed(2)} | true peak ffmpeg ${tp.toFixed(1)} ours ${tpo.toFixed(2)}`);
}
console.log(`worst LUFS gap ${worst.toFixed(2)} LU, worst true-peak gap ${worstTp.toFixed(2)} dB`);
rmSync(dir, { recursive: true, force: true });
process.exit(worst < 0.2 && worstTp < 0.5 ? 0 : 1);
