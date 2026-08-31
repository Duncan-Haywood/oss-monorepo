// Sweep every browser-local product page in the portfolio and fail on any page
// a browser would not actually run.
//
// This is deliberately a repo-wide sweep rather than a `page.test.mjs` per
// venture. Two reasons:
//
//   1. A new venture is covered the day its page lands, with nothing to wire up.
//      The defect this guards against reached production in a venture that had
//      no CI at all, so a guard you must remember to opt into would not have
//      caught it.
//   2. Several sessions ship venture code concurrently. Adding a file to eight
//      venture directories creates eight chances to conflict; one sweep in a new
//      directory creates none.
//
// Ventures that want stronger, page-specific assertions (required ids, exact
// disclaimer wording) can still add their own `page.test.mjs` on top via
// `checkPageIntegrity` directly — see the example at the foot of page-integrity.mjs.
//
// Every .html file under ventures/ is checked, including written reports and
// build-step app shells. There is no skip list on purpose: an unclosed tag
// renders a report just as broken as it renders a calculator dead, and a path
// heuristic that exempts a directory is how a real product eventually slips
// through it. Shells whose code loads via `src=` pass trivially, which is the
// correct answer for them rather than a special case.
//
// Usage:
//   node platform/webcheck/check_pages.mjs          # sweep and report
//   node platform/webcheck/check_pages.mjs --quiet  # only print failures

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkPageIntegrity } from './page-integrity.mjs';

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const ROOTS = ['ventures'];
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'out', 'coverage']);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (entry.endsWith('.html')) yield full;
  }
}

const quiet = process.argv.includes('--quiet');
const pages = [];
for (const root of ROOTS) {
  const abs = join(REPO, root);
  try {
    statSync(abs);
  } catch {
    continue;
  }
  pages.push(...walk(abs));
}
pages.sort();

let failed = 0;
for (const abs of pages) {
  const rel = relative(REPO, abs);
  const findings = checkPageIntegrity(readFileSync(abs, 'utf8'));
  if (findings.length) {
    failed++;
    console.error(`FAIL ${rel}`);
    for (const f of findings) console.error(`       - ${f}`);
  } else if (!quiet) {
    console.log(`ok   ${rel}`);
  }
}

if (failed) {
  console.error(`\n${failed} of ${pages.length} pages would not render correctly in a browser.`);
  process.exit(1);
}
console.log(`\n${pages.length} pages checked, all sound.`);
