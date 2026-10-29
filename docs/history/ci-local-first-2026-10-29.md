# CI that runs the same locally (2026-10-29)

The owner asked for "the ci system we have by default using ci that is runnable
locally not just on gha runners. optimizing it. in general." This pass takes
that as a design rule: **a workflow step should be one repository command, and
a contributor runs that same command to get the same verdict.** GitHub Actions
then just schedules the commands. It continues `ci-perf-2026-10-21.md` and
`ci-perf-2026-10-24.md`.

## What was not local

`platform/ci/run_workflow_locally.py` already runs a workflow's `run:` steps on
this machine. It skipped any step that held a `${{ }}` expression, and every
diff-scoped step here reads its base as
`${{ github.event.pull_request.base.sha || github.event.before }}`. So locally:

| | steps run | steps skipped |
|---|---|---|
| `ventures-tests.yml` on `main` before this change | **0 of 4** | 4 (base fetch, venture tests, clause check, `tsc`) |
| after | **4 of 4** | 0 |
| all 131 workflows, before / after | 486 / 493 of 537 | 51 / 44 |

The 44 still skipped need a secret or a step output (`steps.deployment.outputs.page_url`)
that has no honest local value, so they stay skipped and named.

The venture tests were also two different things. `ventures-tests.yml` ran an
inline shell loop (`find *.test.mjs` from the repository root, one venture
after another), the docs told contributors to run `run_venture_tests.py
--changed`, and 418 `<slug>-ci.yml` files ran `node --test` from the venture's
own directory. These are three file sets and two working directories.

## The change

1. **`run_workflow_locally.py` evaluates the context it can answer honestly**:
   the PR base becomes the merge base with the branch `--for-changes` compares
   against (default `origin/main`), `github.sha` becomes HEAD,
   `github.workspace` the checkout and `runner.temp` a temporary directory.
   The report prints a `LOCAL` line naming each one it substituted.
   `github.event_name`, `inputs.*`, step outputs and secrets still mean a skip.
   `ventures-tests.yml` joined `VERIFICATION_ONLY`, so it runs by name and in
   `--tree`.
2. **`run_venture_tests.py` is the venture test step.** `ventures-tests.yml`
   now calls `python3 platform/ci/run_venture_tests.py --since "$BASE"`, the
   same script a contributor runs with `--changed`. That flag now includes
   uncommitted and untracked files, and the script runs suites in parallel,
   prints each as it finishes, shows each `not ok` block instead of the last
   3,000 characters, and kills a hung suite's whole process group after 20
   minutes. The script has unit tests now (`test_run_venture_tests.py`, run by
   the same workflow).
3. **418 per-venture workflows removed** (549 → 131 files). Each one's trigger
   was `ventures/<slug>/**` plus itself, its only actions were checkout and
   setup-node, and its only command was `node --test` (278 bare, the rest
   naming test files). `ventures-tests.yml` already runs on every such change.
   P016 removed the 384 byte-identical copies on 2026-10-16; these were the
   "variants", which differed only in comments, job names or an explicit file
   list.
4. **`validate_workflows.py` invariant 8** rejects such a workflow, so the
   copies don't grow back. Invariant 7's message used to say "copy a sibling",
   which is how there came to be 802 of them. Now it points at
   `ventures-tests.yml`. `PRODUCT_PLAYBOOK.md` and `ventures/CLAUDE.md` say the
   same.

### Which test files run

Node's default discovery from the venture directory (`node --test`, no
arguments) finds more than `*.test.mjs`. It also finds `*.test.js`, `test.mjs`,
`test/**` and, on Node 22.22, `*.test.ts`. The deleted workflows used it, and
four of those ventures depend on that: `sponsor-ready` (`*.test.js`), and
`cam-reconciliation-check`, `cash-runway-planner` and
`chargeback-evidence-packet` (`test.mjs`). The old `ventures-tests.yml` loop
would have dropped them.

Default discovery is wrong for a venture that keeps a workflow of its own.
`print-atelier`, `vendor-watch` and `real-estate-agent-photo-app` have
TypeScript or `npm`-dependent suites that their own workflows install and run.
Under default discovery they failed with `ERR_MODULE_NOT_FOUND`. So the rule
is:

- no other workflow names the venture: `node --test`, as its deleted
  workflow ran;
- another workflow names `ventures/<slug>/`: its `*.test.mjs` files only, as
  `ventures-tests.yml` always gave it (69 ventures, `own_workflow_slugs`).

## Verification

| Check | Result |
|---|---|
| every venture, `run_venture_tests.py` (no args), 4-core container | 1,315 suites in 12m53s, 5 failed: the three own-workflow ventures above (fixed by the rule; each passes after it), plus `changepoint-detector` (hit the then 600s cap under a full parallel load; the cap is now 1,200s) and `shift-roster-builder` (below) |
| `shift-roster-builder` | 197 of 198 pass. Already red on `main`: its own `shift-roster-builder-ci.yml` failed its last 5 runs (2026-10-27/28, 6 to 9 minutes each). Not caused by this change; it now shows up in `ventures-tests.yml` whenever the venture is touched |
| `validate_workflows.py` | all 131 valid; invariant 8 flags exactly the 418 removed files (set-equal to the selection script) when they are present |
| `publish_surface.py --write` then `--check` | 131 workflows, 0 live |
| `python3 -m unittest test_run_workflow_locally` | 121 OK (118 before; 3 new: base substitution, unanswerable expression left alone, diff-scoped step collected as runnable) |
| `python3 -m unittest test_validate_workflows` | OK (6 new for invariant 8; two invariant-7 message tests updated to the new remedy) |
| `python3 -m unittest test_run_venture_tests` | 7 OK |
| `pytest gitops/tests/test_ci_runner.py` | 24 OK after `gitops/ci/sync_readme_counts.py` rewrote the README count (591/594 across 549 → 173/176 across 131) and its "> 200 workflows" sanity floor became "> 100" |

## Runner pool, measured before the change

    python3 platform/ci/ci_profile.py --runs 1000 --top 400

1,000 runs, 02:00 to 03:49 UTC on 2026-10-29: 1,119 jobs, 1,495.9 job-minutes,
checkout 327.7 (22%).

| Workflow | jobs | job-min | median job | checkout share | heaviest step |
|---|---|---|---|---|---|
| Portfolio Pages | 76 | 526.0 | 266s | 6% | Test the site builder (420.1m) |
| hetzner-gitops CI | 42 | 253.9 | 332s | 5% | pytest (230.0m) |
| Portfolio validate | 70 | 150.1 | 110s | 16% | Check inline scripts parse (17.1m) |
| Page integrity | 42 | 85.0 | 132s | 23% | Sweep every product page (59.9m) |
| ventures tests | 55 | 62.9 | 40s | 29% | node --test in each touched venture (37.0m) |
| the three per-venture workflows that ran in the window | 67 | 28.8 | 24-26s | 74-79% | `node --test` (0.1-0.7m) |

To be plain about the size of the runner saving: in this window the removed
kind of workflow cost 28.8 job-minutes (2% of the pool), nearly all of it
checkout, because only three of those ventures were touched. Each venture PR
now starts one job instead of two. The larger effects are on maintenance: 418
fewer files to keep in sync, one test command instead of three, and seven more
steps that run locally. Re-run `ci_profile.py` after a day of merges to read
the effect.

An independent audit the same day (`docs/reports/2026-10-29-ci-and-app-bloat-audit.md`,
merged while this PR was open) reached the same count, 418 `node --test`-only
per-product workflows, and named the same four ventures outside the old
`*.test.mjs` pattern; this PR is its suggested cut 3. Its cut 1 (retire
`hetzner-gitops-ci.yml`) is item 2 below.

The merge of `main` brought `dupehound-ci.yml` (132 workflows): it runs a
Rust build, so invariant 8 rightly leaves it alone.

## Not changed, ranked (for the next agent)

Search open PRs for each item's keywords before starting it.

1. **Portfolio Pages "Test the site builder", 420 of 1,496 job-minutes (28%).**
   Still item 1 from 2026-10-21. `node --test "*.test.mjs"` in
   `platform/pages` runs on every `ventures/**` PR. Profile per file with
   `node --test --test-reporter=spec` and per-file timing before changing the
   trigger. Never drop a test that reads real venture content.
2. **hetzner-gitops CI, 254 job-minutes, 4 of its last 8 `main` runs red**,
   testing an origin retired on 2026-10-01. It triggers on
   `platform/pages/build.mjs`, `check.mjs`, `launched.json` and
   `platform/marketing/**`, so Pages work pays for it. Narrowing or retiring it
   is a judgment call about a dead route (see 2026-10-21, item 3).
3. **`shift-roster-builder`** is red (1 of 198) and slow (about 6 minutes).
4. Other workflows with inline shell longer than a few lines could move into
   scripts the same way. `python3 platform/ci/run_workflow_locally.py --list
   <wf>` shows what still skips.
