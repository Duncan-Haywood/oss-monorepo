// Compare gcode-motion.mjs with PrusaSlicer's own estimate and filament
// length, on G-code files PrusaSlicer wrote. Usage:
//   node eval/motion-vs-prusaslicer.mjs DIR_WITH_GCODE
// Prints one row per file: slicer time, our time, the difference, slicer
// filament mm, ours.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { estimateMotion } from '../gcode-motion.mjs';
import { parseDuration } from '../gcode.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node eval/motion-vs-prusaslicer.mjs DIR'); process.exit(2); }
const rows = [];
for (const f of readdirSync(dir).filter((n) => n.endsWith('.gcode')).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  const t = /^; estimated printing time \(normal mode\) = (.+)$/m.exec(text);
  const mm = /^; filament used \[mm\] = ([\d.]+)/m.exec(text);
  if (!t) continue;
  const ref = parseDuration(t[1]);
  const t0 = performance.now();
  const r = estimateMotion(text);
  const ms = performance.now() - t0;
  const diff = (r.seconds - ref) / ref * 100;
  rows.push({ f, ref, ours: r.seconds, diff, refMm: Number(mm?.[1]), oursMm: r.filamentMm, ms, cornering: r.cornering });
}
const fmt = (s) => `${Math.floor(s / 3600)}h ${String(Math.floor(s / 60) % 60).padStart(2, '0')}m ${String(Math.round(s % 60)).padStart(2, '0')}s`;
console.log('| file | PrusaSlicer | ours | diff | filament PrusaSlicer mm | ours mm | ms |');
console.log('|---|---|---|---|---|---|---|');
for (const r of rows) {
  console.log(`| ${r.f} | ${fmt(r.ref)} | ${fmt(r.ours)} | ${r.diff >= 0 ? '+' : ''}${r.diff.toFixed(1)}% | ${r.refMm.toFixed(2)} | ${r.oursMm.toFixed(2)} | ${r.ms.toFixed(0)} |`);
}
const abs = rows.map((r) => Math.abs(r.diff)).sort((a, b) => a - b);
if (abs.length) console.log(`\n${rows.length} files; median |diff| ${abs[Math.floor(abs.length / 2)].toFixed(1)}%, worst ${abs[abs.length - 1].toFixed(1)}%`);
