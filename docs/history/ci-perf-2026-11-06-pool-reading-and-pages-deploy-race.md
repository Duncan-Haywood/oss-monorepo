# CI perf, 2026-11-06 (late): pool reading, and a Pages deploy race

**Reading.** `ci_profile.py --runs 600` (563 jobs, 519 job-minutes, window
14:12 to 16:07 UTC): Portfolio Pages 230 min (13% checkout), Portfolio validate
65, ventures tests 56, Conflict markers 28 (74% checkout), Portfolio Pages site
build 28 (45% checkout), Page integrity 19 (68% checkout). Queue p50/p90 were
3 s / 3-7 s everywhere: the pool was not starved in this window.
Checkout was 146 of 519 minutes (28%).

**What I looked at and did not change.**

- "Test the site builder": 75 min over 110 jobs (about 41 s each). Worked three
  times today already (`pages-test-perf-2026-11-06-*`); a fourth profile
  would repeat their reading. Their ranked item 1 (is `share-cards-*` hitting in
  CI?) is still unanswered; it needs a run log with the cache step, not a local
  profile.
- "Install dependencies" in Portfolio validate (2.3 min over 43 jobs, ~3 s
  each): a one-package pip install. No lever worth a workflow edit.
- "Deploy to GitHub Pages" (10.8 min over 50 jobs): time spent inside
  `actions/deploy-pages` polling GitHub; not ours to shorten.
- Conflict markers: the sparse, blob:none checkout is already the narrowest
  that still reads every tracked text file; the guard's comment says why it is
  not diff-only.

**A finding: a red `deploy` on main that is not a regression.** Run
42248027153 (merge of #13587) failed its GitHub Pages `deploy` job with
`Deployment request failed ... due to in progress deployment. Please cancel
1ea8665... first or wait for it to complete`, although the earlier run's
workflow had completed 25 minutes before. The job already has
`concurrency: github-pages-deploy`, so this is GitHub's own Pages deployment
still shown as in progress, not two of our jobs overlapping. A later main run
supersedes it. The serving site (Cloudflare) has its own job. A retry step
would live in `.github/workflows/portfolio-pages.yml`, a CODEOWNERS path, so it
needs the owner's approval and a PR of its own; not done here. If it recurs,
that PR is the fix: re-run `deploy` once after a wait when the error text
contains `in progress deployment`.

**Not changed, ranked for the next run.**
1. Read the `share-cards-*` cache step in a recent main log
   (`get_job_logs`, "Test the site builder" job) and record hit or miss.
2. Count how often `deploy` fails with `in progress deployment` over the last
   50 main runs; if more than 1 in 20, send the retry PR above.
3. Conflict markers and Page integrity checkouts (68-74% of their minutes) stay
   the pool-wide cost; the only remaining lever is a smaller tree.
