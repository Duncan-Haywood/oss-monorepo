// Checks that every page the Pages site would publish carries the no-warranty
// clause PRODUCT_PLAYBOOK.md 5b requires.
//
// Why only that half. 5b requires two clauses, and they are enforced in two
// different places for a reason the build itself draws:
//
//   - The **no-SLA** clause is about how these pages are hosted, which is the
//     build's own statement to make, so `build.mjs` injects it into any
//     published page that lacks one. That requirement now holds by
//     construction and needs no check in front of a contributor.
//   - The **no-warranty** clause is about what a given tool is not advice
//     *about* -- "not landscaping, construction, legal, tax, or financial
//     advice" -- which only the venture can write. It cannot be injected, so
//     it is still the venture's to get right, and it is still enforced only by
//     build.test.mjs, which runs on `platform/pages/**`.
//
// That last gap is what this closes. A venture branch that omits the clause
// merges cleanly and turns `main` red in the Pages job, naming an author who
// never saw the requirement, in a workflow they did not touch. It has happened
// repeatedly for the no-SLA half (#1747, #1763, sewer-line-replace); injection
// retired that recurrence, and left this one exactly as it was.
//
// Reading the *sources* rather than a built site is the point. The build takes
// seconds and needs the whole tree; this walks the venture directories
// directly, so it is cheap enough to run from a venture's own CI -- the only
// place a PR that adds a venture reliably gets checked, since PRs opened with
// GITHUB_TOKEN do not trigger the portfolio-wide workflows.
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

import { REPO_ROOT, discoverSurfaces, isPublishable, publishedPages } from './build.mjs';

/**
 * PRODUCT_PLAYBOOK.md 5b, first clause: free and as-is, no warranty of any
 * kind, not advice, verify before relying on it.
 *
 * Matched loosely on purpose. Ventures word the surrounding paragraph in their
 * own voice, and demanding the playbook's exact prose would force a rewrite of
 * correct pages rather than catch a missing one.
 */
export const NO_WARRANTY = /no warranty/i;

/**
 * Every page missing the clause, as `{ page, clause }` rows.
 *
 * `pages` maps a display path to its markup. Returned rather than thrown so a
 * run reports the whole set at once -- fixing these one failure per run is how
 * the second venture in #1747 was missed on the first pass.
 */
export function missingClauses(pages) {
  const missing = [];
  for (const [page, markup] of pages) {
    if (!NO_WARRANTY.test(markup)) missing.push({ page, clause: 'no-warranty' });
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

  // Whether `slug` names a venture at all, which is a different question from
  // whether it has a browser surface. Both produce zero surfaces, and the
  // callers must not treat them alike: one is a CLI venture behaving
  // normally, the other is a typo silently reporting nothing to do.
  const known = slug === undefined ? true : await isVenture(venturesDir, slug);

  return { pages, surfaces, known };
}

/**
 * The exit for a slug that names no venture, shared by the three tools that
 * take one.
 *
 * These tools all report rather than gate -- a venture with nothing to measure
 * is a normal, passing result, and their CI passes a slug unconditionally, so
 * a coverage number must never fail a run. But that made a mistyped slug
 * indistinguishable from a real venture with no browser surface: both printed
 * "nothing to measure" and exited 0. `faq-coverage.mjs amazon-fba-calculater`
 * reported success for a venture that does not exist.
 *
 * A slug that names nothing is a usage error, not a measurement, so it is the
 * one case that exits non-zero. That leaves "never a gate" intact: what fails
 * here is the question, not the answer.
 */
export function unknownVenture(slug, { log = console.error } = {}) {
  log(
    `${slug}: no such venture.\n` +
      'Nothing was measured. Check the spelling against `ls ventures/`; a\n' +
      'venture that exists but ships no browser surface reports zero and exits 0.',
  );
  return 1;
}

/** Does `slug` name a directory under `venturesDir`? */
async function isVenture(venturesDir, slug) {
  // Guard against a slug that is a path rather than a name -- `foo/../bar`, or
  // an absolute path -- which would otherwise stat something outside the tree.
  if (slug !== path.basename(slug)) return false;
  try {
    return (await fs.stat(path.join(venturesDir, slug))).isDirectory();
  } catch {
    return false;
  }
}

export async function main(argv = process.argv.slice(2)) {
  const slug = argv.find((arg) => !arg.startsWith('-'));
  const { pages, surfaces, known } = await collectPages({ slug });

  if (slug && !known) return unknownVenture(slug);

  if (slug && surfaces.length === 0) {
    // Not a failure: plenty of ventures are CLIs or libraries with no browser
    // entry point, and their CI passes this flag unconditionally.
    console.log(`${slug}: no published browser surface, nothing to check`);
    return 0;
  }

  const missing = missingClauses(pages);
  if (missing.length > 0) {
    console.error(
      `${missing.length} page(s) missing the no-warranty clause:\n` +
        missing.map(({ page }) => `  ${page}`).join('\n') +
        '\n\nEvery published page needs it (PRODUCT_PLAYBOOK.md 5b): free and\n' +
        'as-is, no liability, not [trade] advice, verify before relying on it.\n' +
        'Copy the paragraph from PRODUCT_PLAYBOOK.md rather than from a sibling\n' +
        'venture -- copying a sibling footer is how the clause goes missing.\n\n' +
        'The no-SLA clause is not checked here: build.mjs injects it into every\n' +
        'published page, so a venture does not have to carry it.',
    );
    return 1;
  }

  console.log(
    `${pages.length} published page(s) across ${surfaces.length} surface(s) carry the no-warranty clause`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
