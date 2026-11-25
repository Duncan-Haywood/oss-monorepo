# Per-venture CI workflows: sparse checkout (2026-11-25)

Perf track run. P063 and P064 are the two open `perf:` backlog items; both
already have stalled PRs (#13748, #13868, #14240, #14251 for P063) and
neither was taken here. This pass went to the pool reading instead.

## Reading

`python3 platform/ci/ci_profile.py --runs 1000 --top 200 --json` on
2026-11-25 (window 00:49 to 01:23 UTC, a burst after several merges): 633
jobs, **806.2 job-minutes, of which checkout 374.1 (46%)**. A 600-run reading
the same hour said 380.4 and 186.1 (49%).

Checkout is now 30 to 68 s per job, where the 2026-10-21 pass measured about
16 s: the tree has grown to 51k files. The biggest share of that is no single
workflow but the long tail of per-venture `<slug>-ci.yml` workflows. Each one
checks out the whole tree to run a few seconds of tests in one directory:

| | |
|---|---|
| workflows changed here that ran in the window | 33 (49 jobs) |
| their job-minutes | 40.3 |
| their checkout-minutes | 33.8 (84%) |
| median checkout per job | 43 s (range 30 to 59 s) |

Examples: `sbom-diff-check CI` 63 s job, 56 s checkout; `publish-kit CI`
74 s / 68 s (not changed, see below); `actions-permissions-check CI` 60 s /
55 s; `world-clock-widget CI` 68 s / 47 s across 7 jobs (not changed).

## Change

44 workflows (every non-`priv-` workflow whose checkouts all use the same
`persist-credentials: false` block and whose steps all run in one
`ventures/<slug>`, minus the ones below) get, on each checkout:

```yaml
filter: blob:none
sparse-checkout: |
  .github
  ventures/<slug>
```

Cone mode also keeps the root files (`pyproject.toml`, `ruff.toml` and the
like), so tools that walk up for config see the same files. `.github` is
there because several of these products scan the repository's own
workflows in CI (deploy-concurrency-check, the `actions-*-check` family).
The pattern is the one `duplicate-symbols-ci.yml`, `prompts-ci.yml` and the
guard workflows already use (P048).

## Verification

New script: `platform/ci/sparse_checkout_verify.py <workflow> <paths...>`.
It builds a sparse worktree of HEAD with just those paths, runs every `run:`
step of the workflow in the full tree and then in the sparse one, and
compares each step's exit code **and its test-count lines** (`# tests`,
`# skipped`, `Ran N tests`, any line naming a skip). Exit codes alone were not
enough: a suite that skips when a file is missing passes either way.

Run against all 66 candidates. It rejected these, so they keep the full checkout:

| workflow | what changed when sparse |
|---|---|
| devsec-toolkit-ci.yml | 12 failures, 2 errors (adapters read outside the venture) |
| einvoice-preflight-ci.yml | browser suite 2332 tests to 2328, fails 1 to 2 |
| llm-spend-guard-ci.yml | node suite fails (imports `platform/`) |
| mcp-supply-chain-watch-ci.yml | site tests 48 to 41, one failure |
| publish-kit-ci.yml | clause check needs `platform/pages` |
| liability-audit-ci.yml | sweeps every venture by design |

Left out because they could not be checked here, not because they failed:
ai-engineering-academy (matrix job, `${{ }}` working directory),
agentic-trading-lab (one test errors on a local pyo3 panic in both trees),
ig-media-pipeline, photos-import-tools, vendor-change-watch (no pytest for
the container's python3), world-clock-widget (no swift here), and the slow
suites with `../..` references whose runs were stopped or never started
(local-site-studio, open-robot-mower, open-tennis-robots, photo-editing,
photo-editing-docs-site, quick-pick-survey, real-estate-agent-photo-app,
retail-pilot-intel, shed-designer-browser, shed-designer-fuzz). 44 changed,
6 rejected and 16 unchecked make the 66 candidates.

The 44 that changed matched step for step and count for count. In six of
them one step fails in both trees on this container, identically: ruff lint
findings (quote-margin-check, backup-verification-evidence,
repository-branch-hygiene, ubuntu-agent-server, probably a different local
ruff), deploy-concurrency-check's scan of this repository's own workflows,
and one vendor-watch node test. Each of those steps runs to the end and gives
the same output either way, so the sparse tree is not what decides them.

Locally on the changed workflow files: `priv-ci-policy.yml`,
`workflow-self-audit.yml`, `priv-control-plane-guard.yml`,
`agent-permission-harness-ci.yml` (its results file names workflows),
`secrets-inventory-ci.yml`, `priv-conflict-markers-ci.yml` all exit 0 under
`run_workflow_locally.py`; `validate_workflows.py`: all 137 valid.
`priv-security-gate.yml` needs the PR's own data, so CI runs it.

## After

This PR's own CI ran every changed workflow (head b966f6a1f). Step
timestamps from `actions/runs/<id>/jobs` for the 59 jobs of the 44 changed
workflows: **checkout median 2 s (max 7 s), job median 8 s**, against 43 s
and about 50 s before. At the window's rate that is about 30 job-minutes
saved per 1,000 runs. The local worktree could not measure this (it shares
the full object store). One job failed: deploy-concurrency-check's scan of
this repository's workflows, which has been red on `main` since
2026-11-19 (12 findings in other workflows) and failed the same way in the
full tree here.

## Not changed (ranked)

1. **Portfolio Pages** (154.5 job-minutes, 61 jobs, checkout 47 s median):
   `priv-portfolio-pages.yml`, owner-only. Its "Test the site builder" step
   (84.5 min) is the largest single step in the pool.
2. **P063, ventures-tests** (checkout now about 46 s, 29% of a 160 s job): four stalled
   PRs exist; consolidate one of them rather than opening a fifth.
3. **CI policy / Conflict markers** (91% and 86% checkout): `priv-`, owner-only.
4. The rejected six above: each needs its sparse list widened to the exact
   `platform/` paths it reads (`sparse_checkout_verify.py` with the extra
   paths), then re-checked.
5. The 16 unchecked above, from a container with pytest and swift.
