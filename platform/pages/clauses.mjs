// Checks that every page the Pages site would publish carries both
// PRODUCT_PLAYBOOK.md 5b liability clauses.
//
// Why this exists as its own entry point rather than only as an assertion in
// build.test.mjs: the clause requirement is a property of *hosting*, so it
// only became checkable once the Pages site existed — and the check landed in
// the Pages suite, which runs on `platform/pages/**`. A venture branch cut
// before the check and merged after it turns main red in a job that has
// nothing to do with the venture that broke it. That has now happened twice:
// #1747 (artificial-turf, asphalt-driveway-pave) and again on the
// sewer-line-replace merge, whose branch predated #1731 the same way.
//
// Reading the *sources* rather than a built site is the point. The build takes
// seconds and needs the whole tree; this walks the venture directories
// directly, so it is cheap enough to run from a venture's own CI — the only
// place a PR that adds a venture reliably gets checked, since PRs opened with
// GITHUB_TOKEN do not trigger the portfolio-wide workflows.
//
// The clause is matched loosely on purpose. Several ventures word it in their
// own voice ("Hosted URLs, when they exist, carry no availability SLA"), and
// demanding the playbook's exact prose would force a rewrite of correct pages
// rather than catch a missing one.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { REPO_ROOT, discoverSurfaces, isPublishable, publishedPages } from './build.mjs';

/** PRODUCT_PLAYBOOK.md 5b, first clause: no warranty of any kind. */
export const NO_WARRANTY = /no warranty/i;

/** PRODUCT_PLAYBOOK.md 5b, second clause: best-effort hosting, no uptime promise. */
export const NO_SLA = /best-effort hosting|no (availability )?sla|carry no availability|taken offline without notice/i;

/**
 * Every clause a page is missing, as `{ page, clause }` rows.
 *
 * `pages` maps a display path to its markup. Returned rather than thrown so
 * both the CLI and the test suite can report the whole set at once — fixing
 * these one failure per run is how the second venture in #1747 was missed on
 * the first pass.
 */
export function missingClauses(pages) {
  const missing = [];
  for (const [page, markup] of pages) {
    if (!NO_WARRANTY.test(markup)) missing.push({ page, clause: 'no-warranty' });
    if (!NO_SLA.test(markup)) missing.push({ page, clause: 'no-SLA' });
  }
  return missing;
}

/**
 * Every publishable `.html` page under `ventures/`, as `[displayPath, markup]`.
 *
 * `slug` limits the walk to one venture, which is what a venture's own CI
 * wants: a green run there should mean "my venture is clean", not "nobody
 * else's venture is dirty either".
 */
export async function collectPages({ venturesDir = path.join(REPO_ROOT, 'ventures'), slug } = {}) {
  const surfaces = (await discoverSurfaces(venturesDir)).filter((s) => !slug || s.slug === slug);
  const pages = [];

  for (const surface of surfaces) {
    for (const relative of await publishedPages(surface.sourceDir)) {
      // A venture may keep HTML fixtures beside its pages; the builder drops
      // them, so checking them would fail a page no visitor can reach.
      if (!relative.split('/').every((part) => isPublishable(part))) continue;
      const full = path.join(surface.sourceDir, relative);
      pages.push([`${surface.slug}/${relative}`, await fs.readFile(full, 'utf8')]);
    }
  }

  return { pages, surfaces };
}

export async function main(argv = process.argv.slice(2)) {
  const slug = argv.find((arg) => !arg.startsWith('-'));
  const { pages, surfaces } = await collectPages({ slug });

  if (slug && surfaces.length === 0) {
    // Not a failure: plenty of ventures are CLIs or libraries with no browser
    // entry point, and their CI passes this flag unconditionally.
    console.log(`${slug}: no published browser surface, nothing to check`);
    return 0;
  }

  const missing = missingClauses(pages);
  if (missing.length > 0) {
    console.error(
      `${missing.length} liability clause(s) missing from published pages:\n` +
        missing.map(({ page, clause }) => `  ${page} (${clause})`).join('\n') +
        '\n\nEvery hosted page needs both PRODUCT_PLAYBOOK.md 5b clauses:\n' +
        '  - No warranty: free and as-is, no liability, verify before relying on it.\n' +
        '  - Best-effort hosting, no SLA: may be slow, broken, moved, or taken\n' +
        '    offline without notice; not a system of record.\n' +
        'Copy the wording a sibling calculator already uses.',
    );
    return 1;
  }

  console.log(`${pages.length} published page(s) across ${surfaces.length} surface(s) carry both clauses`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
