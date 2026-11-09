# CI perf, 2026-11-09: ventures-tests sparse checkout (P063)

Reading (`ci_profile.py --runs 600 --top 25`, 618 jobs, 460 job-minutes, 140 of
them checkout): "ventures tests" is 32 jobs, 49.8 min, checkout share 22%.
P063 measured the job's checkout at a median 22.7 s of about 106 s
(`ci-perf-2026-11-07-pool-reading-cache-hit-confirmed.md`).

## Change (`.github/workflows/ventures-tests.yml`, own small PR: CODEOWNERS path)

- Checkout is blob-filtered and non-cone sparse: root files, `platform/`,
  `.github/`, `docs/`, `portfolio/`, and only the `*.mjs` of
  `hearth-and-horizon` and `saints-by-candlelight`.
- A new step adds `ventures/<slug>` for each slug in
  `git diff --name-only --no-renames $BASE HEAD -- ventures`, and runs
  `git sparse-checkout disable` when BASE is empty or zero (the "test every
  venture" and `ls ventures` paths).

## A trap the backlog item missed

`platform/pages/stories.mjs` statically imports four modules from those two
story ventures, and `clauses.mjs` loads `stories.mjs` for any slug. Without
them `node platform/pages/clauses.mjs <slug>` dies with ERR_MODULE_NOT_FOUND
(reproduced). Whole directories are 180 MB and 210 MB, so only their `.mjs`
(84 KB) stay. P063's grep covered `ventures/**` importing out, not `platform/`
importing in.

## Verification (local simulation, same patterns)

Depth-1 clone, the patterns above, `sparse-checkout add ventures/1099-k-threshold-checker`:
`run_venture_tests.py <slug>` ok, `clauses.mjs <slug>` ok, `typecheck.mjs <slug>`
ok; `test_run_venture_tests` OK. Working tree 113 MB. The local server ignores
`--filter`, so the blob-filter saving is not measured here.

## After number: not yet measured

Read checkout seconds for "ventures tests" from `ci_profile.py` once the PR has
merged and a few venture PRs have run (baseline 22.7 s). If the sparse path
breaks a suite that reads outside its venture, widen the patterns, don't revert.

## Not changed

Same small-guard checkout lever for Conflict markers, einvoice-preflight and
Portfolio validate (74% checkout each): all `.github/` edits, one PR each.
