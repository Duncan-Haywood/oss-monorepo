#!/usr/bin/env node
// node ep-cli.mjs plan.json -o out-dir [--today YYYY-MM-DD] [--no-sing] [--rate 44100|48000] [--cover-size N]
// Builds a release folder from an EP plan: per track a MIDI, a WAV (singing preview choir,
// limited to -14 LUFS), timed lyrics and the GABC source; a cover drawn from the first
// track's melody; release.json; REPORT.md; then the release check. Exit 0 when the only
// failing checks are owner steps (artist, p/c-lines, ISRCs), 1 on a build fault, 2 on bad input.
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildEp } from './ep.mjs';

const USAGE = 'usage: node ep-cli.mjs plan.json -o out-dir [--today YYYY-MM-DD] [--no-sing] [--rate 44100|48000] [--cover-size N]';
export function run(argv, { log = () => {} } = {}) {
  let file = null, out = null, today, sing = true, rate = 44100, coverSize = 3000;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') out = argv[++i];
    else if (a === '--today') today = argv[++i];
    else if (a === '--no-sing') sing = false;
    else if (a === '--rate') rate = Number(argv[++i]);
    else if (a === '--cover-size') coverSize = Number(argv[++i]);
    else if (a === '-h' || a === '--help') return { code: 0, text: USAGE };
    else if (!file) file = a;
    else return { code: 2, text: `unexpected argument ${a}\n${USAGE}` };
  }
  if (!file || !out) return { code: 2, text: USAGE };
  if (![44100, 48000].includes(rate)) return { code: 2, text: '--rate must be 44100 or 48000 (what distributors take)' };
  if (!(Number.isInteger(coverSize) && coverSize >= 64 && coverSize <= 6000)) return { code: 2, text: '--cover-size must be a whole number of pixels from 64 to 6000' };
  if (today !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(today)) return { code: 2, text: '--today must be YYYY-MM-DD' };
  let plan;
  try { plan = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  let r;
  try { r = buildEp(plan, dirname(resolve(file)), resolve(out), { rate, sing, coverSize, today, log }); } catch (e) { return { code: 2, text: e.message }; }
  const lines = [
    `${r.release.type} "${r.release.title}": ${r.tracks.length} tracks in ${out}`,
    ...r.buildFaults.map((c) => `FAIL  ${c.name}: ${c.note}`),
    ...r.ownerSteps.map((c) => `OWNER ${c.name}: ${c.note}`),
    r.ready ? (r.ownerSteps.length ? `built; ${r.ownerSteps.length} owner step(s) left (REPORT.md)` : 'built and ready to upload (REPORT.md)') : 'build faults: see REPORT.md',
  ];
  return { code: r.ready ? 0 : 1, text: lines.join('\n') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const o = run(process.argv.slice(2), { log: (s) => console.error(s) });
  (o.code === 2 ? console.error : console.log)(o.text); process.exit(o.code);
}
