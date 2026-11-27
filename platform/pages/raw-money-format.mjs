// Static half of phone-probe's "money without thousands separators" rule.
//
// Why this exists: phone-probe-check.mjs (phone-probe.mjs, rule five) finds
// `$111111.11` on a rendered page, but only what the page prints at its
// defaults and its loaded example. Two polish runs on 2026-11-26 cleared 23
// such pages, and the second note counted about 100 more front-door
// `calc.mjs` files still formatting money as `` `$${x.toFixed(2)}` ``: they
// print `$1250.00` the first time a visitor types a bigger job than the
// example (docs/reports/polish-2026-11-26-unseparated-money-all-industries.md,
// "Still weakest", item 2). A browser cannot see that; a grep can.
//
// The rule: in the source of a tool that is a front door to a paid product
// (front-doors.json `tools`), a currency symbol followed by an interpolated
// `.toFixed(n)` is a finding. Format with
// `x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })`
// instead. A line that must keep the raw form (a sample CSV row mimicking a
// marketplace export the parser reads) carries `raw-amount-ok` in a comment,
// or pushes an array row (`out.push([`), which this skips the same way the
// fix did.
//
//   node platform/pages/raw-money-format.mjs          # list findings, exit 1 if any
//   node platform/pages/raw-money-format.mjs --all    # every venture, not only front doors

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');

/** `$${expr.toFixed(n)}`, also with £ and €. */
export const RAW_FORMAT_RE = /[$£€]\$\{[^{}`]*?\.toFixed\(\d\)\}/g;
/** Lines that keep the raw form on purpose. */
export const SKIP_LINE_RE = /raw-amount-ok|\b(?:out|it|rows|lines)\.push\(\s*\[/;

const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.next', 'vendor']);

/** Findings in one file's text: [{ line, text }]. */
export function findingsInText(text) {
  const out = [];
  String(text).split('\n').forEach((line, i) => {
    if (SKIP_LINE_RE.test(line)) return;
    for (const m of line.match(RAW_FORMAT_RE) || []) out.push({ line: i + 1, text: m });
  });
  return out;
}

function sourceFiles(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) out.push(...sourceFiles(p)); continue; }
    if (/\.(mjs|js|html)$/.test(e.name) && !/\.test\./.test(e.name) && !e.name.endsWith('.min.js')) out.push(p);
  }
  return out;
}

/** The front-door tool slugs (front-doors.json `tools`). */
export function frontDoorSlugs(root = ROOT) {
  const doors = JSON.parse(fs.readFileSync(path.join(root, 'platform/pages/front-doors.json'), 'utf8'));
  return Object.keys(doors.tools || {});
}

/** Findings for the given venture slugs: [{ file, line, text }]. */
export function scan(slugs, root = ROOT) {
  const out = [];
  for (const slug of slugs) {
    const dir = path.join(root, 'ventures', slug);
    if (!fs.existsSync(dir)) continue;
    for (const f of sourceFiles(dir)) {
      for (const hit of findingsInText(fs.readFileSync(f, 'utf8'))) {
        out.push({ file: path.relative(root, f), ...hit });
      }
    }
  }
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const all = process.argv.includes('--all');
  const slugs = all
    ? fs.readdirSync(path.join(ROOT, 'ventures'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)
    : frontDoorSlugs();
  const found = scan(slugs);
  for (const f of found) console.log(`${f.file}:${f.line}  ${f.text}`);
  const files = new Set(found.map((f) => f.file)).size;
  console.log(`${found.length} raw money formatter(s) in ${files} file(s) over ${slugs.length} ${all ? 'ventures' : 'front-door tools'}`);
  process.exit(found.length && !all ? 1 : 0);
}
