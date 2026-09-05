/**
 * The subsetting knob the seven browser checks did not have.
 *
 * WHY THIS EXISTS
 *
 * `.github/workflows/browser-checks-ci.yml` runs `sideways`, `presets`,
 * `roundtrip`, `highlight`, `contrast`, `sweep` and `journey` nightly rather
 * than on every pull request, and its header gives the reason in one clause:
 * "a full run is the whole site -- 510 pages, no per-page or per-venture
 * subsetting knob exists in any of the seven -- and takes on the order of
 * 20-30 minutes". Gating ~18 commits a day on that is hours of metered
 * Actions minutes, which is how the 2026-08-26 starvation window happened.
 *
 * So the cost argument is right and this does not challenge it. What it
 * removes is the premise: with a filter, a pull request that touches one
 * venture can run the browser checks against *that venture's* pages in about
 * a minute, and the nightly still sweeps everything.
 *
 * That gap has already cost real money in the product. #3137 (2026-09-04)
 * found five bid calculators whose share links silently dropped the deposit
 * percentage, the validity window and the payment terms -- a contractor sent
 * a link priced at 50%/15 days and the recipient saw the venture's default
 * 30%/30 days. `roundtrip` is the only check that catches that class, and it
 * caught it the morning after it shipped, not at merge.
 *
 * THE FAILURE MODE THIS FILE IS MOST CAREFUL ABOUT
 *
 * A filter is a way to verify less. This repository has been bitten three
 * times by a check that reported a clean run it had not performed --
 * `highlight` written and left out of `CHECKS` so "the browser checks" ran
 * six of seven; a stale server answering for the build under test, which is
 * why the harness now plants a sentinel; `supersede_check.py` exiting 1 on
 * 65 of 66 PRs. A filter that silently matches nothing and exits 0 would be
 * the fourth and the worst, because it would be *requested* rather than
 * accidental.
 *
 * Two rules keep that from happening, and both are enforced rather than
 * documented:
 *
 *   1. A filter that matches nothing is an error, never an empty pass. Each
 *      check that applies one exits 2 ("nothing was verified") when the
 *      filter leaves it with no pages. `browser_checks.py` goes further and
 *      refuses before any browser starts if a requested slug is not in the
 *      built tree at all, so a typo names itself instead of quietly halving
 *      the run.
 *   2. A filtered run never reports as a full one. Every check prints the
 *      filter in its own header, and the harness stamps "FILTERED" on the
 *      summary line that would otherwise read "all 7 browser checks passed".
 *
 * WHAT IS NOT FILTERED, AND WHY
 *
 * `journey.mjs` is a single narrative over the whole site -- sitemaps, every
 * sitemap URL, the 404, the catalogue's own counts -- on one fixed slug. It
 * has no per-venture dimension to subset, and subsetting the site underneath
 * it would make its catalogue assertions fail for a reason that is not a
 * defect. It ignores `ONLY_SLUGS` and says so.
 */

/**
 * The filter for this run, as a Set, or null for "check everything".
 *
 * Two sources, argv first. `presets`, `roundtrip` and `highlight` have each
 * taken `node platform/pages/roundtrip.mjs <slug> <slug>` since they were
 * written, so argv keeps working exactly as it did -- this reads that
 * mechanism rather than adding a second one beside it. `ONLY_SLUGS` exists
 * because `browser_checks.py` runs the checks as `node <path>` with no
 * arguments and passes an environment, so the env var is the only channel
 * that reaches all seven from the harness and from CI.
 *
 * (The four checks that had no filter at all -- `sideways`, `contrast`,
 * `sweep`, and `journey`, which stays unfiltered by design -- are why the
 * workflow header's "no per-page or per-venture subsetting knob exists in
 * any of the seven" was true end to end even though three of them had one.)
 *
 * Null and empty-set are deliberately different values here, and callers must
 * keep them different: null means no filter was asked for, the empty set
 * would mean a filter that matches nothing. Returning null for a blank
 * variable is what lets `ONLY_SLUGS=` (an unset CI input expanding to the
 * empty string) mean a full run rather than a run of nothing.
 */
export function onlySlugs(env = process.env, argv = process.argv.slice(2)) {
  const fromArgv = argv.map((s) => s.trim()).filter(Boolean);
  if (fromArgv.length) return new Set(fromArgv);
  const raw = (env.ONLY_SLUGS || '').trim();
  if (!raw) return null;
  const slugs = raw.split(',').map((s) => s.trim()).filter(Boolean);
  return slugs.length ? new Set(slugs) : null;
}

/** True when `slug` survives the filter (or there is no filter). */
export function keepSlug(slug, only) {
  return !only || only.has(slug);
}

/**
 * True when a built page's path survives the filter.
 *
 * `rel` is relative to DIST, as the checks walk it: `<slug>/index.html`,
 * `<slug>/should-i-x.html`, `<slug>/<sub>/index.html`, and also the shared
 * pages that belong to no venture at all (`index.html`, `about/index.html`,
 * `c/trades/index.html`). Those last ones have no slug to match, so under a
 * filter they are dropped: a run scoped to one venture is asking about that
 * venture, and the catalogue pages are what the nightly is for.
 */
export function keepPagePath(rel, only) {
  if (!only) return true;
  const first = rel.split('/')[0];
  // A top-level `.html` file is a site page, not a venture's.
  if (first.endsWith('.html')) return false;
  return only.has(first);
}

/**
 * The one-line description every filtered check prints before it starts.
 *
 * Always called, and returns the empty string when there is no filter, so a
 * check cannot accidentally print a reassuring header on a filtered run by
 * forgetting the conditional.
 */
export function describeFilter(only) {
  if (!only) return '';
  const slugs = [...only].sort();
  return `FILTERED to ${slugs.length} venture(s): ${slugs.join(', ')}`;
}

/**
 * Exit 2 if a filter has left a check with nothing to do.
 *
 * Exit 2, not 1: `browser_checks.py` and the CI workflow both reserve 2 for
 * "nothing was verified" and 1 for "something is actually broken", and an
 * over-narrow filter is the former. Reporting it as a site defect would send
 * whoever reads it looking for a bug in a calculator that is fine.
 */
export function requireNonEmpty(items, only, what = 'pages') {
  if (items.length) return;
  const scope = only ? ` matching ONLY_SLUGS=${[...only].sort().join(',')}` : '';
  console.error(
    `No ${what}${scope}. Nothing was verified, so this is a skip and not a pass.\n` +
    (only
      ? 'Check the slug spelling against the built tree — a venture directory is\n' +
        'named by its directory under `ventures/`, which is what the build emits.'
      : `The built tree has no ${what} at all, which is a build problem, not a\n` +
        'defect in any one page.'),
  );
  process.exit(2);
}
