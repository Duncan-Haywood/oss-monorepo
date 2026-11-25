// Compare gcode-motion.mjs with the ;TIME: and ;Filament used: lines Cura
// writes, on Cura files people committed to public GitHub repositories.
// Cura's estimate uses the machine settings in the user's Cura profile, which
// the file does not carry unless it emits M201-M205, so the time column
// measures how far a printer-blind estimate lands, not our error alone.
// Usage: node eval/motion-vs-cura.mjs DIR
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { estimateMotion } from '../gcode-motion.mjs';

const dir = process.argv[2];
if (!dir) { console.error('usage: node eval/motion-vs-cura.mjs DIR'); process.exit(2); }
console.log('| file | flavor | M201-M205 lines | Cura time | ours | diff | Cura filament mm | ours mm |');
console.log('|---|---|---|---|---|---|---|---|');
for (const f of readdirSync(dir).sort()) {
  const text = readFileSync(join(dir, f), 'utf8');
  const t = Number(/^;TIME:(\d+(?:\.\d+)?)/m.exec(text)?.[1]);
  const m = /^;Filament used:\s*([\d.]+)m/m.exec(text);
  const flavor = /^;FLAVOR:(\S+)/m.exec(text)?.[1] ?? '?';
  const limits = (text.match(/^M20[1345]\b/gm) ?? []).length;
  const r = estimateMotion(text);
  const diff = t > 0 ? `${((r.seconds - t) / t * 100).toFixed(1)}%` : 'n/a';
  console.log(`| ${f.slice(0, 60)} | ${flavor} | ${limits} | ${t || 'n/a'} s | ${r.seconds.toFixed(0)} s | ${diff} | ${m ? (Number(m[1]) * 1000).toFixed(1) : 'n/a'} | ${r.filamentMm.toFixed(1)} |`);
}
