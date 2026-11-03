# Pages tests: a full read of the suite found it red, not slow (2026-11-03)

**Reading.** `ci_profile.py --runs 600 --top 15` (509 jobs, 510.7 job-minutes):
"Test the site builder" is the heaviest step in the pool, 71.1 of 510.7
minutes (Portfolio Pages workflow, 217.7 min over 91 jobs). To see where a
passing run spends it, the whole suite was run once here
(`node --test --test-reporter=spec "*.test.mjs" "cloudflare/*.test.mjs"` in
`platform/pages`, 4-core sandbox): 1418 tests, **1414 pass, 3 fail**, 12m58s
wall (29m user). The sandbox is far slower than the runners; use the ratio, not
the figure.

**Why this matters for the metric.** `main` was red since the chant-forge
browser studio (#12840) landed, so every PR touching the pages paid for a
failing 71-minute step. A red suite also hides real regressions in the same
step. Fixing it is the cheapest change to that step's total.

The three failures, all from one new venture:

1. `faq-visible`: the page's JSON-LD FAQ answers differed from the visible
   prose (three answers). The JSON-LD now carries the page's own sentences.
2. `flagship-cta`: the only `.cta` link sat 6000+ characters below the h1; it
   now sits under the intro paragraph (limit 2500).
3. `build.test.mjs` catch-all bound: `chant-forge` made six tools in "More
   free tools" (bound 5). Added a "Music & audio" section for it rather than
   raising the bound; the section count assertion went 15 to 16.

**Verification.** See the run record for the full-suite result after the fix.

**Not changed, ranked.** 1. The passing suite is dominated by one ~10 s build
shared by ~300 tests plus per-test DOM parsing; a per-test profile is next.
2. The first `site()` caller's reported duration includes waiting for the
shared build (the 550 s figures in the spec log are that wait, not test work).
3. Nothing here guards the pages tests against a venture landing a page that
fails them: the venture-test jobs do not run `platform/pages` tests. A cheap
path filter on `ventures/*/index.html` into the Pages test job would catch it
on the PR that causes it.
