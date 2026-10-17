#!/usr/bin/env node
// Zero-dependency CLI: node requirements-check.mjs [requirements.txt] [--require-hashes] [--fail-on high|medium|any] [--json]
import { readFileSync } from 'node:fs';
import { analyze, summaryLine } from './classify.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const failOn = opt('--fail-on');
const requireHashes = flag('--require-hashes');
const json = flag('--json');
const file = args[0] || 'requirements.txt';

let text;
try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
const r = analyze(text, { requireHashes });
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(summaryLine(r));
  for (const f of r.findings) console.log(`  line ${String(f.line).padEnd(4)} ${f.category.padEnd(15)} ${f.name}  ${f.detail}`);
}
const has = (...sev) => r.findings.some((f) => sev.includes(f.severity));
const bad = (failOn === 'high' && has('high'))
  || (failOn === 'medium' && has('high', 'medium'))
  || (failOn === 'any' && r.findings.length > 0);
process.exit(bad ? 1 : 0);
