#!/usr/bin/env node
// Zero-dependency CLI: npm audit --json | node audit-triage.mjs - [srcdir ...] [--fail-on high|critical|moderate|low] [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { triage, summaryLine, SEVERITIES } from './triage.mjs';

const args = process.argv.slice(2);
const opt = (name) => { const i = args.indexOf(name); return i < 0 ? null : args.splice(i, 2)[1]; };
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const failOn = opt('--fail-on');
const json = flag('--json');
if (failOn && !SEVERITIES.includes(failOn)) { console.error(`--fail-on must be one of ${SEVERITIES.join(', ')}`); process.exit(2); }
const auditArg = args.shift() || '-';
const dirs = args.length ? args : ['.'];

const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', 'out']);
const EXT = /\.[cm]?[jt]sx?$|\.vue$|\.svelte$/;
function walk(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, root, acc);
    else if (EXT.test(name) && st.size < 2_000_000) acc.push({ path: relative(root, p) || name, text: readFileSync(p, 'utf8') });
  }
}

let auditText;
try { auditText = readFileSync(auditArg === '-' ? 0 : auditArg, 'utf8'); } catch (e) { console.error(`cannot read ${auditArg}: ${e.message}`); process.exit(2); }
const files = [];
try { for (const d of dirs) walk(d, d, files); } catch (e) { console.error(`cannot scan source: ${e.message}`); process.exit(2); }

const r = triage(auditText, files);
if (r.error) { console.error(r.error); process.exit(2); }
if (json) console.log(JSON.stringify(r, null, 2));
else {
  console.log(summaryLine(r));
  for (const i of r.items) console.log(`  ${String(i.score).padStart(3)}  ${i.severity.padEnd(8)} ${i.bucket.padEnd(14)} ${i.name}  -> ${i.fix}${i.evidence[0] ? `   [${i.evidence[0]}]` : ''}`);
}
const gate = failOn ? SEVERITIES.indexOf(failOn) : -1;
const bad = gate >= 0 && r.items.some((i) => (i.bucket === 'imported' || i.bucket === 'via-imported') && SEVERITIES.indexOf(i.severity) <= gate);
process.exit(bad ? 1 : 0);
