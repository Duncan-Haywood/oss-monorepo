#!/usr/bin/env node
// node release-cli.mjs release.json [--json] [--today YYYY-MM-DD] [--skip-master]
import { checkRelease, loadRelease } from './release.mjs';
import { pathToFileURL } from 'node:url';
export function run(argv) {
  const json = argv.includes('--json'), skipMaster = argv.includes('--skip-master');
  const ti = argv.indexOf('--today'), today = ti >= 0 ? argv[ti + 1] : undefined;
  const file = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--today');
  if (!file) return { code: 2, text: 'usage: node release-cli.mjs release.json [--json] [--today YYYY-MM-DD] [--skip-master]' };
  let r;
  try { const { rel, dir } = loadRelease(file); r = checkRelease(rel, dir, { today, skipMaster }); } catch (e) { return { code: 2, text: `${file}: ${e.message}` }; }
  if (json) return { code: r.pass ? 0 : 1, text: JSON.stringify(r, null, 2) };
  const lines = [...r.checks.filter((c) => !c.ok || argv.includes('--all')).map((c) => `${c.level}  ${c.name}: ${c.note}`),
    `${r.checks.length - r.fail - r.warn} pass, ${r.warn} warn, ${r.fail} fail`, r.pass ? 'ready to upload (warnings are judgement calls)' : 'not ready: fix the FAIL lines and re-run'];
  return { code: r.pass ? 0 : 1, text: lines.join('\n') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) { const o = run(process.argv.slice(2)); console.log(o.text); process.exit(o.code); }
