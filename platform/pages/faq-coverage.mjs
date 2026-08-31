// Which entry pages will ship `FAQPage` structured data, and which will not.
//
// This exists because the obvious way to count it is wrong, and a session
// acting on the wrong count wastes its run. On 2026-08-30 the ledger recorded
// "146 of 163 ventures still lack an `id="faq"` section" as the FAQ backlog.
// That figure counts a *wrapper element*. `faqEntries()` in build.mjs does not
// look at wrappers at all — it derives schema from any `h2`/`h3` whose text
// ends in a question mark, plus `<details><summary>`. So pages with full,
// well-written FAQ sections and full schema (`where-to-sell-calculator`,
// `amazon-fba-calculator`, `etsy-profit-calculator`, `shopify-fee-calculator`,
// `janitorial-bid-calculator`, among others) were counted as missing, and the
// real backlog — 107 entry pages, not 146 — was overstated by a third while
// pointing at several pages that were already done.
//
// Measuring it the way the builder does is the only reading that cannot drift:
// this imports `faqEntries` rather than reimplementing it, so a change to what
// the builder derives changes what this reports, in the same commit.
//
// Entry pages only. `faqEntries()` runs for `isEntry` surfaces, so a secondary
// landing page's hand-authored JSON-LD is a different concern with its own
// guard (`faq-visible.test.mjs`).
//
//   node platform/pages/faq-coverage.mjs            # summary + the missing list
//   node platform/pages/faq-coverage.mjs --quiet    # summary line only
//   node platform/pages/faq-coverage.mjs --json     # machine-readable
//   node platform/pages/faq-coverage.mjs <slug>     # one venture

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPages, unknownVenture } from './clauses.mjs';
import { faqEntries } from './build.mjs';

/**
 * One row per entry page: its slug and how many Q&A the builder will derive
 * from it. Zero means the built page ships no `FAQPage` block at all.
 */
export function coverage(pages) {
  const rows = [];
  for (const [page, html] of pages) {
    const [slug, ...rest] = page.split('/');
    // The entry page is the venture's own index. A deep page such as
    // `slug/should-i-do-x.html` authors its own schema and is out of scope.
    if (rest.join('/') !== 'index.html') continue;
    rows.push({ slug, entries: faqEntries(html).length });
  }
  return rows.sort((a, b) => a.slug.localeCompare(b.slug));
}

export async function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const quiet = argv.includes('--quiet');
  const slug = argv.find((arg) => !arg.startsWith('-'));

  const { pages, known } = await collectPages({ slug });
  const rows = coverage(pages);

  if (slug && !known) return unknownVenture(slug);

  if (slug && rows.length === 0) {
    // Consistent with clauses.mjs: a CLI or library venture has no entry page,
    // and that is not a failure.
    console.log(`${slug}: no published entry page, nothing to measure`);
    return 0;
  }

  const missing = rows.filter((row) => row.entries === 0);
  const covered = rows.length - missing.length;

  if (json) {
    console.log(JSON.stringify({ total: rows.length, covered, missing: missing.map((r) => r.slug) }, null, 2));
    return 0;
  }

  console.log(`FAQPage coverage: ${covered} of ${rows.length} entry page(s) will ship derived FAQ schema.`);

  if (missing.length > 0 && !quiet) {
    console.log(`\n${missing.length} entry page(s) with no question-shaped heading:`);
    for (const row of missing) console.log(`  ${row.slug}`);
    console.log(
      '\nTo fix one: add a section of `<h3>A real question?</h3><p>…</p>` pairs to\n' +
      "the venture's own index.html, derived from what its calc.mjs actually does.\n" +
      'Do not hand-write a `FAQPage` block — build.mjs derives it from the visible\n' +
      'copy, which is what keeps the schema and the page from drifting apart.',
    );
  }

  // Reporting only. This is a backlog worth seeing, not a gate: a venture may
  // legitimately have nothing worth asking, and failing CI over it would push
  // sessions toward padding pages with filler questions.
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
