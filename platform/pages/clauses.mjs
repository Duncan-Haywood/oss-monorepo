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
// directly, so it is cheap enough to run from a venture's own CI, scoped to
// just that slug (`node platform/pages/clauses.mjs <slug>`, wired into every
// venture-ci.yml) -- a second, redundant check next to `portfolio-validate.yml`
// running the same command unscoped over every venture on any PR touching
// `ventures/**/*.html`.
//
// That redundancy is deliberate, not leftover: this comment used to justify
// the venture-scoped run as "the only place a PR that adds a venture reliably
// gets checked, since PRs opened with GITHUB_TOKEN do not trigger the
// portfolio-wide workflows." Neither half held. `portfolio-validate.yml`'s own
// `pull_request.paths` already covers `ventures/**/*.html`, and an agent PR
// here authenticates with a fine-grained PAT (`GH_TOKEN`), not the in-workflow
// `secrets.GITHUB_TOKEN` GitHub's no-recursion rule applies to, so it triggers
// `pull_request` workflows the same as a human's PR (see CLAUDE.md's "Absent
// CI is not failed CI"). The venture-scoped run stays worth keeping anyway:
// it is the faster, narrower signal on the PR that actually adds the venture,
// and it still catches the omission if `portfolio-validate.yml`'s own path
// list ever falls behind a new publishable extension the way it once did for
// `.css`/`.js` (see that workflow's own trigger comment).
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
 * PRODUCT_PLAYBOOK.md 5f: a page that names a specific commercial product to
 * compare against it (`vs-<competitor>.html`) has to say, in terms a reader
 * and a trademark owner both parse the same way, that it isn't that
 * product's page. Nominative fair use -- naming a trademark only to say what
 * you are not -- is a real defense; naming one and staying silent about
 * affiliation is what invites the claim the defense exists to answer.
 *
 * Matched loosely, same reasoning as NO_WARRANTY: 172 of 173 comparison pages
 * on `main` already carry some wording of this on their own, in the author's
 * own voice ("Not affiliated with ServiceMonster.", "not affiliated with,
 * endorsed by, or sponsored by ServiceMonster"), so the check has to accept
 * that range rather than demand one sentence.
 */
export const NOT_AFFILIATED = /not\s+affiliated\s+with/i;

/**
 * A comparison page compares this free tool against one specific named
 * product or company, which is the case the trademark disclaimer exists for.
 * A page that compares against a generic category or role -- "your title
 * company's net sheet", nobody's trademark -- is not one, and requiring the
 * disclaimer there would demand a sentence about a party that does not
 * exist. There is exactly one such page on `main` today; list it here by its
 * `slug/relative` display path, with why, rather than loosening the pattern
 * for everyone else.
 */
const COMPARISON_DISCLAIMER_EXEMPT = new Set([
  // Compares against "your title company's net sheet" -- a role every deal
  // has, not a company or product this could be mistaken for.
  'seller-net-sheet/vs-title-company-net-sheet.html',
  // Compares against "a published custom rate survey" -- a category of
  // publication (state extension services, farm trade press) that several
  // different publishers produce, not one specific company or product this
  // could be mistaken for. The page's own FAQ already says so explicitly
  // ("does not name or link to any specific survey publisher").
  'custom-farm-rate-calculator/vs-survey-rates.html',
  // Compares against "a PPO fee-schedule negotiation service" -- an industry
  // role many different firms perform, charging a flat per-payer fee or a
  // percentage of the increase they win. The page names no specific company
  // and its own footer says so explicitly.
  'dental-ppo-writeoff-calculator/vs-ppo-fee-negotiators.html',
  // Compares against "a spreadsheet or mental math" -- a method every
  // adjuster already has, not a company or product this could be mistaken
  // for.
  'cat-adjuster-fee-calculator/vs-spreadsheet-comparison.html',
  // Compares against "a spreadsheet or a guess under a deadline" -- a
  // method every reporter already has, not a company or product this could
  // be mistaken for.
  'court-reporter-transcript-calculator/vs-spreadsheet-or-guessing.html',
  // Compares against reconciling a 1099-K by hand in a spreadsheet -- a
  // method every marketplace seller already has, not a company or product
  // this could be mistaken for. Same reasoning as the cat-adjuster page
  // above.
  '1099k-reconciliation-worksheet/vs-spreadsheet-comparison.html',
  // Compares against "checking pricing pages and doing the arithmetic by
  // hand" -- a generic method every user of the calculator already has
  // access to, not a company or product this could be mistaken for.
  'ai-coding-plan-cost-calculator/vs-checking-pricing-pages-yourself.html',
  // Compares against "clicking Re-run failed jobs and seeing what happens" --
  // a generic manual habit every GitHub Actions user already has, not a
  // company or product this could be mistaken for.
  'actions-runner-starvation-check/vs-rerunning-the-job.html',
  // Compares against "pricing an add-on by comparing to what other studios
  // charge" -- a generic pricing method every independent photographer
  // already uses, not one specific company or product this could be
  // mistaken for. The page's own FAQ says so explicitly ("has no data on
  // what any other studio charges").
  'photo-addon-pricing-calculator/vs-pricing-by-comparing-to-other-studios.html',
]);

/** Does `page`'s filename mark it as a named-competitor comparison page? */
function isComparisonPage(page) {
  return /(?:^|\/)vs-[^/]+\.html$/i.test(page);
}

/**
 * Every page missing a required clause, as `{ page, clause }` rows.
 *
 * `pages` maps a display path to its markup. Returned rather than thrown so a
 * run reports the whole set at once -- fixing these one failure per run is how
 * the second venture in #1747 was missed on the first pass.
 */
export function missingClauses(pages) {
  const missing = [];
  for (const [page, markup] of pages) {
    if (!NO_WARRANTY.test(markup)) missing.push({ page, clause: 'no-warranty' });
    if (
      isComparisonPage(page) &&
      !COMPARISON_DISCLAIMER_EXEMPT.has(page) &&
      !NOT_AFFILIATED.test(markup)
    ) {
      missing.push({ page, clause: 'not-affiliated' });
    }
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
    const byClause = { 'no-warranty': [], 'not-affiliated': [] };
    for (const m of missing) byClause[m.clause].push(m.page);

    const lines = [`${missing.length} page(s) missing a required clause:`];
    if (byClause['no-warranty'].length > 0) {
      lines.push(
        `\nno-warranty (PRODUCT_PLAYBOOK.md 5b) -- free and as-is, no liability,\n` +
          'not [trade] advice, verify before relying on it. Copy the paragraph\n' +
          'from PRODUCT_PLAYBOOK.md rather than from a sibling venture -- copying\n' +
          'a sibling footer is how the clause goes missing:',
        ...byClause['no-warranty'].map((page) => `  ${page}`),
      );
    }
    if (byClause['not-affiliated'].length > 0) {
      lines.push(
        `\nnot-affiliated (PRODUCT_PLAYBOOK.md 5f) -- a vs-<competitor> page names a\n` +
          'trademark and has to say plainly that it is not that product\'s page,\n' +
          'not affiliated with, endorsed by, or sponsored by it. If the page truly\n' +
          'compares against a generic role rather than a named product or company,\n' +
          'add it to COMPARISON_DISCLAIMER_EXEMPT in clauses.mjs with why:',
        ...byClause['not-affiliated'].map((page) => `  ${page}`),
      );
    }
    lines.push(
      '\nThe no-SLA clause is not checked here: build.mjs injects it into every\n' +
        'published page, so a venture does not have to carry it.',
    );
    console.error(lines.join('\n'));
    return 1;
  }

  console.log(
    `${pages.length} published page(s) across ${surfaces.length} surface(s) carry their required clauses`,
  );
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(await main());
}
