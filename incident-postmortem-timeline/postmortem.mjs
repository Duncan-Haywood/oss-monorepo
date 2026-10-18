#!/usr/bin/env node
// Zero-dependency CLI: node postmortem.mjs [incident.txt] [--title "Checkout outage"] [--md] [--json] [--max-ttr 60m]
// Reads the file (or stdin when the name is "-"); exit 1 if --max-ttr is exceeded, 2 on unreadable or unusable input.
import { readFileSync } from 'node:fs';
import { analyze, summaryLine, toMarkdown } from './classify.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const title = opt('--title') || 'Incident';
const maxTtr = opt('--max-ttr');
const md = flag('--md');
const json = flag('--json');
const file = args[0] || 'incident.txt';

function seconds(s) {
  const m = String(s).match(/^(\d+)\s*(s|m|h)$/);
  return m ? Number(m[1]) * { s: 1, m: 60, h: 3600 }[m[2]] : NaN;
}

let text;
try { text = readFileSync(file === '-' ? 0 : file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
const r = analyze(text);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify({ metrics: r.metrics, missing: r.missing, startEstimated: r.startEstimated, gaps: r.gaps.map((g) => g.seconds), problems: r.problems }, null, 2));
else if (md) console.log(toMarkdown(r, title));
else {
  console.log(summaryLine(r));
  if (r.startEstimated) console.log('note: no start event marked; first line used');
  if (r.missing.length) console.log(`missing: ${r.missing.join(', ')}`);
  for (const p of r.problems) console.log(`line ${p.line}: ${p.reason}`);
}
if (maxTtr) {
  const limit = seconds(maxTtr);
  if (Number.isNaN(limit)) { console.error('--max-ttr takes a value like 90s, 45m or 2h'); process.exit(2); }
  if (r.metrics.ttr === null || r.metrics.ttr > limit) process.exit(1);
}
