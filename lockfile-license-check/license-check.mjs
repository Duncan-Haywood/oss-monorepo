#!/usr/bin/env node
// Zero-dependency CLI: node license-check.mjs [package-lock.json] [--deny GPL-3.0,AGPL-3.0] [--fail-on copyleft|unknown|any] [--no-dev] [--json]
import { readFileSync } from 'node:fs';
import { analyze, summaryLine } from './classify.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const deny = (opt('--deny') || '').split(',').map((s) => s.trim()).filter(Boolean);
const failOn = opt('--fail-on');
const noDev = flag('--no-dev');
const json = flag('--json');
const file = args[0] || 'package-lock.json';

let text;
try { text = readFileSync(file, 'utf8'); } catch (e) { console.error(`cannot read ${file}: ${e.message}`); process.exit(2); }
const r = analyze(text, { deny, includeDev: !noDev });
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(summaryLine(r));
  for (const f of r.flagged) console.log(`  ${f.category.padEnd(15)} ${f.name}@${f.version}  ${f.license}${f.dev ? '  (dev)' : ''}`);
  if (r.denied.length) console.log(`denied: ${r.denied.map((d) => `${d.name}@${d.version}`).join(', ')}`);
}
const c = r.counts;
const bad = r.denied.length > 0
  || (failOn === 'copyleft' && (c['strong-copyleft'] || c.unlicensed))
  || (failOn === 'unknown' && (c['strong-copyleft'] || c.unlicensed || c.unknown))
  || (failOn === 'any' && r.flagged.length);
process.exit(bad ? 1 : 0);
