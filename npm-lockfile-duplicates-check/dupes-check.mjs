#!/usr/bin/env node
// Zero-dependency CLI: node dupes-check.mjs [package-lock.json] [--max N] [--max-same-major N] [--ignore a,b] [--no-dev] [--json]
import { readFileSync } from 'node:fs';
import { analyze, summaryLine, overridesHint } from './dupes.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const max = opt('--max');
const maxSame = opt('--max-same-major');
const ignore = (opt('--ignore') || '').split(',').map((s) => s.trim()).filter(Boolean);
const noDev = flag('--no-dev');
const json = flag('--json');
const file = args[0] || 'package-lock.json';

let text;
try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
const r = analyze(text, { includeDev: !noDev, ignore });
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(summaryLine(r));
  for (const d of r.duplicates) {
    console.log(`  ${d.kind.padEnd(11)} ${d.name}  ${d.versions.join(', ')}  (${d.copies} copies; via ${d.parents.slice(0, 4).join(', ')}${d.parents.length > 4 ? ', ...' : ''})`);
    if (d.kind === 'cross-major') console.log(`              ${overridesHint(d)}`);
  }
  if (r.counts['same-major']) console.log('Try: npm dedupe');
}
const bad = (max !== null && r.duplicates.length > Number(max))
  || (maxSame !== null && r.counts['same-major'] > Number(maxSame));
process.exit(bad ? 1 : 0);
