# Actions usage: what was changed on 2026-10-30, and what to measure next

**Asked by:** the owner ("looks like the actions usage hit a limit ... work on
actions usage optimization"; then: "there was like 2k$ of actions minutes
usage. it's not billed because it's a public repo, but i think it's a good
signal"). **Post:**
[`docs/posts/2026-10-30-cancelling-superseded-ci-runs.md`](../posts/2026-10-30-cancelling-superseded-ci-runs.md).

## What was observed

- The repository is public (`visibility: public`), so standard GitHub-hosted
  minutes are not billed. The owner reads about $2k of minutes at list price
  on the billing page. That is a measure of how much compute the runs use, not
  a bill.
- What does limit work is the free plan's **20 concurrent jobs** per account.
  At about 21:48Z the 30 most recent runs were all `queued` or `pending`,
  from just two merges and two PR pushes. `main` validate runs that started at
  21:22Z finished at 21:37 to 21:45Z, mostly time spent waiting for a runner.
- The 2026-10-29 audit
  ([`2026-10-29-ci-and-app-bloat-audit.md`](2026-10-29-ci-and-app-bloat-audit.md))
  counted 58,776 runs in a week. In its 103-minute timed window, Portfolio
  Pages took 451.6 of 1,476.0 job-minutes, and its "Test the site builder"
  step alone took 334.0 (22.6%).

## What changed

1. **`portfolio-pages.yml`: the `test` job skips on push to `main`.** The PR
   that changed a site input already ran it. The three-hourly schedule and
   `workflow_dispatch` still run it against `main`. Deploy never waited on
   `test`, so deploys are unchanged.
2. **19 pull-request workflows gained a concurrency group** that cancels a
   superseded PR run (`cancel-in-progress` only when `event_name ==
   'pull_request'`; every `main` run is kept). This includes Portfolio
   validate, Conflict markers, Checklist coverage, Doc references, the
   `hetzner-gitops` CI, and the five-job Agent cross-review, which is grouped
   per PR number. The other 94 PR workflows already had a group.
3. **`agent-pr-auto-merge.yml`: a concurrency group with no cancel.** Each
   completed cross-review starts a sweep over every open PR. Now there is one
   sweep running with at most one waiting, and older waiting runs are dropped.
   Event-specific runs are grouped per PR.
4. **`validate_workflows.py` invariant 9:** a workflow triggered by
   `pull_request` must declare `concurrency:` (top level or on every job).
   It has unit tests plus a check over the real workflow tree, so a new
   workflow cannot bring the gap back.

## What this does not claim

No before or after job-minute figure was measured in this session: `gh` has no
token in the container, and `ci_profile.py` needs one. The saving from (1) is
at most the share of the 334 test-step minutes that came from `main` pushes.
The audit did not split that share, so this report does not give one.

## To measure next (a later run)

- `python3 platform/ci/ci_profile.py --runs 1000 --top 40` on a weekday
  evening, compared with the 2026-10-29 window: Portfolio Pages job-minutes,
  and total job-minutes per merged PR.
- Count of `cancelled` PR runs. It should rise, and each one is a run that
  freed its runner.
- Median queue time (`run_started_at` of the first job minus `created_at`)
  for Portfolio validate on PRs.

## Next cuts, not made here

- Retire `hetzner-gitops-ci.yml` (audit cut 1; it serves a dead origin, and 99
  of its 134 runs in the audit week failed) after moving the tests that guard
  live code.
- Agent cross-review runs five jobs per non-draft PR push. A single job that
  calls the four reviewers in sequence would hold one slot, not five.
- `conflict-markers-ci.yml` has no path filter. It could become a step inside
  an existing always-on job.
