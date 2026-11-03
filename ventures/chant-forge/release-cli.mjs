#!/usr/bin/env node
// node release-cli.mjs release.json [--json]   exit 0 ready, 1 problems, 2 unreadable
import { readFileSync } from 'node:fs';
import { checkRelease } from './release.mjs';
export function run(argv) {
  const json = argv.includes('--json');
  const file = argv.find((a) => !a.startsWith('--'));
  if (!file) return { code: 2, text: 'usage: node release-cli.mjs release.json [--json]' };
  let rel;
  try { rel = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  const r = checkRelease(rel);
  if (json) return { code: r.ok ? 0 : 1, text: JSON.stringify(r, null, 2) };
  const lines = r.findings.map((x) => `${x.level.toUpperCase().padEnd(5)} ${x.where}: ${x.msg}`);
  lines.push(r.ok ? `no errors (${r.warnings} warning${r.warnings === 1 ? '' : 's'}): the owner can upload` : `${r.errors} error${r.errors === 1 ? '' : 's'}, ${r.warnings} warning${r.warnings === 1 ? '' : 's'}: not ready`);
  return { code: r.ok ? 0 : 1, text: lines.join('\n') };
}
if (import.meta.url === `file://${process.argv[1]}`) { const o = run(process.argv.slice(2)); console.log(o.text); process.exit(o.code); }
