#!/usr/bin/env node
// node master-cli.mjs track.wav [--json]
import { readFileSync } from 'node:fs';
import { readWav, analyze } from './master.mjs';
export function run(argv) {
  const json = argv.includes('--json');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) return { code: 2, text: 'usage: node master-cli.mjs track.wav [--json]' };
  let r;
  try { r = analyze(readWav(readFileSync(file))); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  if (json) return { code: r.pass ? 0 : 1, text: JSON.stringify(r, null, 2) };
  const lines = [`${file}: ${r.seconds.toFixed(1)} s, ${r.rate} Hz, ${r.channels} ch`, ...r.checks.map((c) => `${c.ok ? 'PASS' : 'FAIL'}  ${c.name}: ${c.note}`), r.pass ? 'ready for the streaming targets' : 'not ready: fix the FAIL lines and re-run'];
  return { code: r.pass ? 0 : 1, text: lines.join('\n') };
}
if (import.meta.url === `file://${process.argv[1]}`) { const o = run(process.argv.slice(2)); console.log(o.text); process.exit(o.code); }
