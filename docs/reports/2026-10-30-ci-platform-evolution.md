# How the CI/CD platform should evolve next (2026-10-30)

The owner asked: "is there a way to evolve our cicd system and platform? do a
blog report on it." The post is
[`docs/posts/2026-10-30-evolving-our-ci-from-a-gate-nobody-trusts.md`](../posts/2026-10-30-evolving-our-ci-from-a-gate-nobody-trusts.md).
This file holds the method, the raw numbers and the ranked list, so a later run
can act on one item and measure it again. It follows
[`2026-10-29-ci-and-app-bloat-audit.md`](2026-10-29-ci-and-app-bloat-audit.md)
and the `docs/history/ci-*` passes.

## Method

All from a cloud session on 2026-10-30, through the Actions REST API (the
proxy's token, 15,000 requests an hour).

1. **Every run created in 24 hours**, 2026-10-29T21:00Z to 2026-10-30T21:00Z,
   pulled in one-hour `created=` windows so no window hit the API's
   1,000-result cap: 10,071 distinct runs.
2. **Job and step timings**: `python3 platform/ci/ci_profile.py --runs 300
   --top 25`, which covered 20:49:50Z to 21:03:46Z (13.9 minutes, 247 jobs).
3. **Failed steps**: for `Portfolio validate`, `Prompts` and `Portfolio Pages`,
   12 failed `main` push runs each, evenly spaced over the day, read job by
   job. One full log each for the last failure of `Portfolio validate`,
   `hetzner-gitops CI`, `photo-editing CI` and `einvoice-preflight CI`.
4. **Agent PR auto-merge**: 13 successful runs spaced over the day, log lines
   containing "merge", "approv" or "skip".
5. **Main history**: `git log origin/main` after `git fetch --deepen=400`.

The one-off scripts were 30-line `urllib` loops over
`/repos/{repo}/actions/runs?created=A..B&per_page=100&page=N`; nothing about
them is new beyond the hourly window. Item 6 below proposes making the
"how long was `main` red" number a tool instead.

## Numbers

### Volume and outcomes, 24 hours

| | Runs | Share |
|---|---:|---:|
| success | 6,389 | 63.4% |
| cancelled | 1,764 | 17.5% |
| failure | 1,643 | 16.3% |
| skipped | 212 | 2.1% |
| still queued / running | 63 | 0.6% |

By event: `pull_request` 6,632, `push` 2,261, `workflow_run` 740,
`pull_request_target` 342, `schedule` 94. 93 of the 125 workflow files ran.

### Main

- 459 commits landed on `main`; 303 distinct `main` heads started push runs.
  **259 of those 303 (85%) had at least one failed run.**
- `Portfolio validate` on `main`: 231 failure, 41 success.
- `Portfolio Pages` on `main`: 225 cancelled (newer push, by design), 59
  failure, 18 success.
- Failures on `main` by workflow: Portfolio validate 231, Prompts 62,
  Portfolio Pages 59, ventures tests 28, einvoice-preflight 6, hetzner-gitops
  4, Conflict markers 4, photo-editing 2.

### The red window

`Portfolio validate` on `main`, by hour (UTC): green 22:00 to 00:59 apart from
one failure; then red from 01:36 on 30 October to 20:21, 226 failures against 5
passes. The first green push after it was 20:32 (run 41123975627): **about 19
hours of red `main`**.

The sampled cause, 9 of 12: "Validate VENTURE.yaml schema", which
`portfolio/router/validate.py` fails when a `portfolio/flagships.yaml` entry's
`next:` passes 2,000 characters. The last failing log:

    4 problem(s) across 1327 venture(s):
      - flagships.yaml: ai-bookkeeper `next:` is 2020 characters (cap 2000) ...
      - flagships.yaml: wall-framing-takeoff `next:` is 2650 characters ...
      - flagships.yaml: changepoint-detector `next:` is 3512 characters ...
      - flagships.yaml: einvoice-preflight `next:` is 2025 characters ...

PR #11521 (01:15Z) trimmed `wall-framing-takeoff` and `main` broke again
within the hour. PR #11850 (20:32Z) trimmed all four. Between 01:36Z and
20:32Z, 384 commits landed on `main` and 54 of them edited
`portfolio/flagships.yaml`. This is the same cause the 29 October audit found
in 10 of 14 sampled failures. Its item 2 ("catch the caps on the pull request,
or trim them automatically") had not been done.

`Prompts` failed on all 12 sampled `main` runs at `promptctl.py validate`.
Locally, on `66173469`, it reports three run records from other sessions
(`writeups` not a list; `pr` null on a successful run).

### One bad description, four red workflows

The last `hetzner-gitops CI` failure is a PR whose blog post description was
161 characters. The same `build.mjs` throw fails the site builder's test
suite (`Portfolio Pages` / test), the pre-build front-matter step (`Portfolio
Pages` / build), `Portfolio validate`'s front-matter step, and
`gitops/tests/test_site_usage.py` inside the dead-cluster workflow. One
mistake, four red checks, each paying its own checkout and setup.

### Runner pool

`ci_profile.py`, 13.9 minutes: 293.4 job-minutes, so about **21 jobs running
at once on average**. Checkout 52.1 job-minutes (17.8%), setup/teardown 6.0.

Queue time (job created to job started), p50 / p90 seconds, busiest workflows:

| Workflow | jobs | job-min | q50 | q90 |
|---|---:|---:|---:|---:|
| Portfolio validate | 18 | 72.4 | 32 | 115 |
| Portfolio Pages | 15 | 64.8 | 68 | 136 |
| agent-permission-harness CI | 10 | 25.8 | 53 | 114 |
| shed-designer browser tests | 10 | 25.3 | 57 | 113 |
| ventures tests | 11 | 24.7 | 51 | 179 |
| Agent PR auto-merge | 16 | 14.3 | 60 | 176 |
| Conflict markers | 24 | 13.8 | 72 | 244 |
| Checklist coverage | 24 | 4.0 | 99 | 233 |
| Agent cross-review | 40 | 2.4 | 84 | 238 |
| Branch cleanup | 5 | 2.1 | 45 | 280 |

On 2026-10-21 (`docs/history/ci-perf-2026-10-21.md`) p50 was 3 s and p90
under 16 s for every busy workflow. **Queueing, not compute, is now what a
check costs.** 18 `main` commits in the day say in their message that they
merged on local verification because runners were queued.

### Small guards

Seven single-purpose guards (Conflict markers 958 runs, Checklist coverage
611, Doc references 605, README live links 347, Sibling links 317, Link
contrast 306, Duplicate symbols 257) made **3,401 runs** in the day. In the
profile window they took 28.8 job-minutes, with checkout 30% to 81% of each
job and median jobs of 8 to 34 s.

### Inert review loop

`Agent cross-review` ran 712 times. Its reviewer Apps have never been
configured (`infra/OWNER_CHECKLIST.md`, added 2026-09-04), so every review
job checks its secrets and skips. Each run then wakes `Agent PR auto-merge`
through `workflow_run` (736 successful runs), which checks out, installs
Python and loops over every open PR. All 13 sampled runs ended each PR with
`skip merge: ...`: draft, dirty, unknown, or "0 allowed approver(s): (none);
need 2". It cannot merge anything until the Apps exist.

### Dead workflow still firing

`hetzner-gitops CI`: 62 runs, 47 failures, testing infrastructure retired on
2026-10-01. Item 1 of the 29 October audit.

## What this PR changes

Item 3 below, the inert review loop. `agent-cross-review.yml`'s first job and
`agent-pr-auto-merge.yml`'s only job now also need the repository variable
`AGENT_REVIEW_ENABLED == 'true'`. A false job-level `if:` skips before a
runner is assigned, the pattern `claude-routine-trigger.yml` has used since
2026-09-02 (67 skipped runs in this day, no runner). `workflow_dispatch` of
the review still runs. The owner's setup steps
(`platform/ci/agent_review/README.md`, `infra/OWNER_CHECKLIST.md`) now name
the variable. Expected effect: about 1,450 fewer runner assignments a day,
and about 6% of the job-minutes in the profile window (16.7 of 293.4).
Nothing that could merge before can't merge now: zero approvers means zero
merges either way.

## Ranked: what to do next

Ranked by how much of the measured pain each removes per hour of work.

1. **Make metadata caps unable to turn `main` red.** The `next:` cap broke
   `main` for about 19 hours, during which 384 commits landed. Two shapes,
   both cheap:
   - Move each flagship's `next:` out of the shared `flagships.yaml` into
     the venture's own directory (for example `ventures/<slug>/NEXT.md`),
     with the cap enforced there. That also removes one of the files most
     PRs edit, which is where merge conflicts come from
     (`concurrency_tax.py` hotspots).
   - Or keep the file and make the cap a formatter, not a failure: the step
     that appends a sentence drops the oldest ones past the cap, and the
     validator only checks the result.
2. **Validate input once, before the expensive suites.** A blog description
   or a `next:` field is checked by four workflows, each with its own
   runner. One fast job (or the existing front-matter step) should own it,
   and the site-builder tests should skip a malformed post the way the
   `main` build already does with `PAGES_SKIP_BAD_POSTS`.
3. **Stop no-op loops from taking runners.** Done here for the review pair.
   The same check should be a lint: `validate_workflows.py` could flag a
   job whose first step is "skip when secret unset", since that pattern
   always takes a runner first.
4. **Retire `hetzner-gitops CI`.** First move `gitops/tests/test_site_usage.py`
   and the `front-door` check, which guard live code, into the Pages
   workflow.
5. **Fold the seven small guards into one job**, the way PR #11721 folded
   nine a11y workflows: one checkout, each guard a step with its own name,
   all steps run even after one fails. About 3,400 runner assignments a
   day become a few hundred, at a time when queueing is the cost.
6. **Measure red time, not red runs.** A tool that reads `main` push runs
   and reports, per required-to-be-green workflow, when `main` went red and
   how long it stayed red. `main_health.py` checks the tree now; this would
   check history. `promptctl.py route` could then send the next session
   to "fix main" when the current red window passes an hour. That is a
   routine a script does, not an agent.
7. **Then, and only then, a required check.** Rulesets are the owner's
   setting. A required check on a `main` that is red 85% of the time would
   block everything, and one that waits two minutes for a runner on every PR
   would push more sessions to merge on local verification. After items 1 to
   5, one fast required job (the cheap deterministic validators,
   `run_workflow_locally.py --for-changes` for the rest) is what makes the
   gate real. GitHub's merge queue is the hosted version of the same idea;
   whether this account can use it is a question for the owner.

Not proposed: self-hosted runners (`gitops/ci/README.md` has the history;
the box they would run on was retired), paid larger runners (owner money),
and turning on the reviewer Apps (owner decision, row
`agent-cross-review-automerge` in `portfolio/ledger/asks.yaml`).

## Caveats

One day of runs, one 14-minute profile window in the evening (UTC). Run
counts include cancelled runs that took no runner. "Failed run on a `main`
head" counts any workflow, including ones that were red for a PR-scoped
reason; the `Portfolio validate` hourly table is the cleaner signal.
