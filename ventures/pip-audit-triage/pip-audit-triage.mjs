#!/usr/bin/env node
// Zero-dependency CLI: pip-audit -f json | node pip-audit-triage.mjs - [srcdir ...] [--fail-on-imported] [--json]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { triage, summaryLine } from './triage.mjs';

const args = process.argv.slice(2);
const flag = (name) => { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; };
const failOnImported = flag('--fail-on-imported');
const json = flag('--json');
const auditArg = args.shift() || '-';
const dirs = args.length ? args : ['.'];

const SKIP = new Set(['.git', '.venv', 'venv', 'env', 'node_modules', '__pycache__', 'build', 'dist', '.tox', '.mypy_cache', 'site-packages']);
function walk(dir, root, acc) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name.endsWith('.egg-info')) continue;
    const p = join(dir, name);
    let st; try { st = statSync(p); } catch { continue; }
    if (st.isDirectory()) walk(p, root, acc);
    else if (/\.py$/.test(name) && st.size < 2_000_000) acc.push({ path: relative(root, p) || name, text: readFileSync(p, 'utf8') });
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
  for (const i of r.items) console.log(`  ${String(i.score).padStart(3)}  ${i.bucket.padEnd(14)} ${i.name}==${i.version} (${i.vulns.map((v) => v.id).join(', ')})  -> ${i.fix}${i.evidence[0] ? `   [${i.evidence[0]}]` : ''}`);
}
process.exit(failOnImported && r.urgent.length ? 1 : 0);
