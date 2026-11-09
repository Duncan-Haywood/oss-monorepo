---
title: "CI perf, 2026-11-09: ventures-tests sparse checkout (P063)"
---
# CI perf, 2026-11-09: ventures-tests sparse checkout (P063)

Reading: `ci_profile.py --runs 200 --steps 15` (2026-11-09 08:18Z to 09:15Z). No
pool lever remained outside CODEOWNERS paths: "Test the site builder" (204 s
median) and "Build the site" were worked in the pages-test-perf passes.

Change (`.github/workflows/ventures-tests.yml` only): blob-filtered checkout
with a cone sparse set of `platform`, `.github`, `docs`, `portfolio`; after
the base fetch, `git sparse-checkout add ventures/<slug>` for each slug the
diff touches, or `git sparse-checkout disable` when there is no usable BASE
(every venture runs). Evidence that research/ and prompts/ are never read by
venture suites is in the P063 backlog row.

Before: checkout 22.7 s per job (3 runs, 2026-11-07). After: not yet
measured; read it from `ci_profile.py` once the owner approves and the PR
merges. Not run locally: the change is CI-only, YAML parses, and
`run_venture_tests.py`/`clauses.mjs`/`typecheck.mjs` only key on touched slugs
(`existsSync`-guarded in clauses.mjs).
