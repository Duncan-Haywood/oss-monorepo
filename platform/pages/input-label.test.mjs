// Every input in a generated table row must carry its own accessible name.
//
// WHY THIS EXISTS
//
// Most inputs in this fleet get their accessible name from a wrapping
// `<label>`, which is why a naive "does this input have a label?" scan reports
// thousands of false positives here and is worth nothing. The rows of a
// route/client table are the exception: they are `<td>`-per-cell, so there is
// no label to wrap them in, and a column header gives a sighted reader the
// context that a screen reader never receives. An input like
//
//   <td><input class="locationProfit" data-row="3" type="number"></td>
//
// is announced as "edit, number" and nothing else — the user cannot tell which
// location they are on, or which of two columns they are in.
//
// Found on 2026-09-06 by running `platform/pages/contrast.mjs` (axe-core) over
// a built artifact: 48 nodes, `label` rule, critical, across the three route
// tools that had shipped this pattern. It had never been caught because the
// browser-only checks in this directory need Playwright, and every session
// here had recorded "no Playwright in this environment" and skipped them --
// when the whole barrier was one `npm install`. See the browser-checks note in
// CLAUDE.md's merge checklist and `platform/ci/browser_checks.py`.
//
// This test is deliberately narrow. axe over a real build is the general
// guard and it is the one to trust; this exists so the specific regression
// cannot come back silently between browser runs, and so a *fourth* venture
// copying the route-table pattern fails here rather than shipping unlabelled.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolved from this file, not from the working directory. It was `'ventures'`
// until 2026-09-07, which resolves only when the runner happens to stand in
// the repository root -- and the workflow step that runs this suite does not:
// `portfolio-pages.yml` invokes `node --test "*.test.mjs"` from
// `platform/pages`. So the very first statement in the test threw
// `ENOENT: scandir 'ventures'` and the run was red without ever reading a page.
//
// That is worse than it sounds, because of what this file is. The comment
// above describes it as the cheap standing guard between full axe runs, and
// it carries a "guard the guard" assertion (`checked >= 24`) written so the
// suite could never pass while silently scanning nothing. The path bug
// defeated that assertion by never reaching it: the failure was real and
// loud, but it said `ENOENT`, so it read as environmental rather than as a
// guard that had stopped guarding. Every sibling test in this directory
// already resolved the tree this way -- see `saved-bids.test.mjs` -- which is
// what makes this a slip rather than a judgement call.
const HERE = dirname(fileURLToPath(import.meta.url));
const VENTURES = join(HERE, '..', '..', 'ventures');

// An input that lives in a generated row: `data-row="N"` is how all three
// route tables address their cells from JS.
const ROW_INPUT = /<input\b[^>]*\bdata-row="\d+"[^>]*>/g;

// axe's `label` rule is satisfied by any of these on the element itself
// (a wrapping <label> is impossible in a <td>-per-cell row).
const NAMED = /\b(aria-label|aria-labelledby|title)\s*=\s*"[^"]+"/;

function pagesOf(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.html')) out.push(join(dir, entry.name));
  }
  return out;
}

test('every generated table-row input carries an accessible name', () => {
  const offenders = [];
  let checked = 0;

  for (const slug of readdirSync(VENTURES, { withFileTypes: true })) {
    if (!slug.isDirectory()) continue;
    const dir = join(VENTURES, slug.name);
    if (!existsSync(dir)) continue;

    for (const page of pagesOf(dir)) {
      const html = readFileSync(page, 'utf8');
      for (const [tag] of [...html.matchAll(ROW_INPUT)].map((m) => [m[0]])) {
        checked++;
        if (!NAMED.test(tag)) offenders.push(`${page}: ${tag.slice(0, 120)}`);
      }
    }
  }

  // Guard the guard: if the row pattern is ever renamed, this test would pass
  // by checking nothing at all, which is the failure mode CLAUDE.md keeps
  // recording. Assert it still found the rows it was written for.
  assert.ok(
    checked >= 24,
    `expected at least the 24 known route-table inputs, scanned ${checked}. ` +
      'If the data-row pattern was renamed, update ROW_INPUT — do not delete this.',
  );

  assert.deepEqual(
    offenders,
    [],
    `${offenders.length} generated row input(s) have no accessible name:\n  ` +
      offenders.join('\n  '),
  );
});
