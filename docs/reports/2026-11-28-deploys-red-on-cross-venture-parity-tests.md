---
kind: incident
date: 2026-11-28
---
# PayApps production deploy red for 58 merges: a parity test reached outside the deploy checkout

## What happened

`payapps-deploy` (`.github/workflows/priv-payapps-deploy.yml`) failed on every run from run 36
(2026-11-27 19:50 UTC, PR #19845) to run 93 (2026-11-28 16:50 UTC, PR #20140): 58 merges in a row.
No PayApps change in that window reached `payapps.marisstella.app`. The Worker kept serving run 35's
version, so the site stayed up, but customers did not get any of those features or fixes.

Cause: `src/shared/lien-deadline-parity.test.ts` imports
`ventures/mechanics-lien-deadline-calculator/calc.mjs` to hold the app's lien clock to the free
calculator. `payapps CI` checks out both trees, so the test passes there. The deploy job's sparse
checkout is `ventures/payapps` only (on purpose: less code on disk in a job that later holds
Cloudflare and Paddle secrets), so its pre-deploy `pnpm test:unit` stopped at
`ERR_MODULE_NOT_FOUND`.

`cmmc-deploy` has the same bug (`level1-parity.test.ts` statically imports
`ventures/machine-shop-guides/l1-data.mjs`), red since run 26 on 2026-11-28. PR #20166 (another
session) fixes that one the same way, so this PR does not touch CMMC.

Nobody noticed for 21 hours because PR checks were green: only the push-to-main deploy runs the
sparse checkout, and nothing reads deploy results.

## The fix

The test loads `calc.mjs` only when it exists. It skips only when `GITHUB_WORKFLOW` ends in
`-deploy`, and fails with "not found" anywhere else. So `payapps CI` still enforces parity on every
change to either tree, and the deploy, which by design cannot see the calculator, runs everything
else. The workflow is unchanged: adding the calculator to the deploy's sparse checkout would put
more code on disk in a job that holds secrets, and would change a CODEOWNERS file.

Verified locally: present, 26 pass; absent with `GITHUB_WORKFLOW=payapps-deploy`, skipped; absent
with `GITHUB_WORKFLOW="payapps CI"`, fails. The deploy's full check sequence (biome, typecheck,
unit, worker) was run with the calculator moved away and `GITHUB_WORKFLOW=payapps-deploy`: biome clean, typecheck clean, unit 169 files pass + 1 skipped (1650 tests), worker 100 files (636 tests) pass.

## For the next run

- **A unit test in a deployed venture must not import outside its venture directory**, unless it
  does what these two now do. Deploy workflows check out only `ventures/<name>`. Every deploy
  sparse checkout is `ventures/<name>`, so a quick check is
  `grep -rnE '\.\./\.\./\.\./\.\./\.\./' ventures/*/apps/*/src --include=*.test.ts`.
- **Read deploy results, not just PR checks.** After merging a venture change, check
  `gh api repos/Duncan-Haywood/oss-monorepo/actions/workflows/priv-<app>-deploy.yml/runs?per_page=3 --jq '.workflow_runs[].conclusion'`.
  Worth building: a scheduled read-only check that flags a deploy red for more than N runs, so
  this cannot sit unnoticed for a day again (software for the routine). A new workflow is a
  control-plane PR through `adversarial-gate`.
