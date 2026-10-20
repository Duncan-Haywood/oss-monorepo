# One no-warranty check instead of 281 copies (2026-10-20)

Item B of `docs/history/pages-build-perf-2026-10-20.md` ("For the next
agent"; PR 8767): stop running `node platform/pages/clauses.mjs <slug>` from
281 per-venture workflows, without losing what the per-venture runs were for.

## What was there

- **281 `<slug>-ci.yml` files** each ended with the same step, usually after
  a 5-7 line comment: `working-directory: .`,
  `run: node platform/pages/clauses.mjs <slug>`.
- **`ventures-tests.yml`** (added by process backlog P016 on 2026-10-16) ran
  the same command in its per-venture loop, but only for touched ventures
  that have `*.test.mjs` files. A venture with only pages skipped it,
  because the loop hits `continue` before reaching the check.
- **`portfolio-validate.yml`** runs it unscoped on any PR touching
  `ventures/**/*.html` (and `.mjs`, `.css`, `.js`, `VENTURE.yaml`).

The rationale at the top of `clauses.mjs` explains why the per-venture runs
existed. The venture that breaks the rule should be the one that goes red, on
its own PR, and the failure should name it.

## A correction to item B's premise

Item B says "each copy books a runner for a 1.3s check". It doesn't. In
every one of the 281 files the clause check is a *step* in a job that already
runs the venture's own tests: 273 jobs have two `run:` steps, and none has the
clause check as its only step. Removing the step frees no runner. It removes
about 1.3s from each of those jobs, and it removes a duplicate: for a venture
with tests, `ventures-tests.yml` already ran the same check on the same PR.

What the change does buy:

- **One place to change.** Before, a fix to how the check is invoked had to
  be made 281 times, and every new venture workflow had to remember to copy
  the step.
- **A gap closed.** Under the old setup, a page-only venture (no tests, so
  no `<slug>-ci.yml` that `validate_workflows.py` requires) got no
  per-venture run at all. Only the unscoped backstop covered it.
- **A better failure.** Under GitHub Actions the new run annotates the
  offending file in the PR's diff, and its log ends with
  `Venture(s) to fix: <slug>`.
- **About 1,380 fewer lines in `.github/workflows/`.**

## The change

- `clauses.mjs` gained `--changed-since <base>`, which checks every venture
  `git diff <base> HEAD -- ventures` touched. Deleted ventures are skipped.
  With no usable base (empty or all zeros) it checks every venture. It also
  takes several positional slugs at once now, and `main()` accepts
  `{ repoRoot, env, log, error }` so it can be tested against a fixture repo.
- `ventures-tests.yml` runs it as its own step,
  `Published pages carry the no-warranty clause (each touched venture)`,
  with `if: ${{ !cancelled() }}` so a test failure doesn't hide a clause
  failure. It is outside the loop that needs `*.test.mjs` files. The
  workflow fires on any `ventures/**` change, on PRs and on pushes to `main`.
- The step and its comment were removed from all 281 `<slug>-ci.yml` files.
  One more copy (`interview-content-studio-ci.yml`) arrived on `main` while
  this PR was open; it was removed by the same script after merging `main`.
  In `backup-verification-evidence-ci.yml` the lint job's `setup-node` (and
  the comment justifying it) existed only for that step, so they went too.
- `portfolio-validate.yml` keeps its unscoped run as the portfolio-wide
  backstop. Only its comment changed.
- `PRODUCT_PLAYBOOK.md` (5b and the definition of done) and
  `platform/pages/README.md` now say where the check runs.

Item B also asked for these to be checked:

- **`platform/ci/validate_workflows.py` and `test_validate_workflows.py`:**
  nothing expects the step. Invariant 7 already accepts `ventures-tests.yml`
  as the portfolio-wide runner.
- **`gitops/ci/sync_readme_counts.py`:** counts `runs-on` lines, not steps.
  It reports the README current.
- **Scaffolding:** nothing in the tree generates a `<slug>-ci.yml` with the
  step. New venture workflows are copied by hand, which is the reason one
  place is better than 281.

## Proof that the replacement fails on a bad page

`platform/pages/clauses.test.mjs` builds throwaway git repos:

- **`--changed-since` fails on a touched venture page with no warranty clause,
  naming the venture.** The venture has no tests, which is the case the old
  loop skipped. The test expects exit 1, the page listed,
  `Venture(s) to fix: broken-tool`, an untouched clean venture not mentioned,
  and an `::error file=ventures/broken-tool/index.html,...` annotation.
- **Passes when the touched venture carries the clause.**
- **Checks only what the change touched.** A dirty venture already on the
  base doesn't fail an unrelated PR; the unscoped backstop reports that one.
- **No usable base means every venture.**
- **Several slugs at once, failing one named.**
- **`ventures-tests.yml` runs `clauses.mjs --changed-since "$BASE"` as its own
  `!cancelled()` step,** outside the `*.test.mjs` gate, and still triggers on
  `ventures/**`. This guards the reason the copies could go.

## Verification (this container, Node 22)

```
node --test platform/pages/clauses.test.mjs   # 27 pass, 0 fail
node --test <the 7 platform/pages files that import clauses.mjs> platform/marketing/workflow-coverage.test.mjs  # 75 pass
python3 platform/ci/validate_workflows.py    # All 543 workflow files are valid.
python3 platform/ci/publish_surface.py --check  # matches the snapshot (543 workflows, 0 live)
python3 platform/ci/checklist_coverage.py    # all covered
python3 gitops/ci/sync_readme_counts.py --check  # current
(cd platform/ci && python3 -m unittest test_validate_workflows test_publish_surface test_browser_state test_adopt_stranded test_checklist_coverage)  # OK
node platform/pages/clauses.mjs               # 2897 pages across 1302 surfaces carry their clauses
```

`run_workflow_locally.py --for-changes` was not finished. A diff that touches
281 workflow files pulls in every one of them, and the run stalled on an
unrelated one. Instead, the workflows this change reaches were run by name:

- `--force firewood-profit-calculator-ci.yml`: 1/1 `run:` step passed.
- `--force backup-verification-evidence-ci.yml`: the tests pass. `ruff check .`
  passes with the pinned 0.15.8. The container's own ruff 0.16.9 flags files
  this change does not touch.
- The new `ventures-tests.yml` step's command, run on this branch's diff:
  `no venture touched, nothing to check`, exit 0.
