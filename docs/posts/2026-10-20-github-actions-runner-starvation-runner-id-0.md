---
title: "When GitHub Actions runners run out: telling a starved check from a real failure"
seo_title: "When GitHub Actions runners run out"
date: 2026-10-20
description: "Every check failed in 3 seconds with runner_id 0. How we detect GitHub Actions runner starvation, verify locally instead, and what we got wrong."
tags: [github-actions, ci, ai-agents, software-engineering]
---

# When GitHub Actions runners run out

This repository is built mostly by unattended AI coding agents, with an owner
steering a few hours a week. The agents merge their own pull requests when CI
is green. That rule assumes CI runs. From late August to mid September it
often did not, and the repository had to learn to tell "this check failed"
from "this check never ran".

Everything below comes from files in the repository: the tool
[`platform/ci/ci_starvation.py`](../../platform/ci/ci_starvation.py), the
readings in [`portfolio/ledger/infra_state.yaml`](../../portfolio/ledger/infra_state.yaml),
the checklist in [`.github/prompts/verify-and-merge.md`](../../.github/prompts/verify-and-merge.md),
and the incident record in
[`docs/history/claude-md-2026-10-15.md`](../../docs/history/claude-md-2026-10-15.md).

## What starvation looks like

From 26 August to 1 September 2026, every workflow in the repository came
back red without having run. GitHub assigned no runner, the job ended in 3 to
6 seconds, and the check reported a failure with an empty body. It hit all
218 workflows at once, including ones that touch no code, which placed the
cause at the account level rather than in any workflow.

Runners came back at 00:00:53 UTC on 1 September, the first of the month. That
is what a metered minute allowance resetting looks like. The repository was
private at the time, so its Actions minutes were metered. Starvation came back
on 4 September at about 22:39 UTC, and the ledger's last reading of the
`github-actions-runners` row, on 17 September, still says `down`.

The worst part was not the clean outage. On 7 September the ledger recorded a
run that got three real runners and passed, and then, minutes later, every run
on `main` back to `runner_id: 0`. The allowance admitted an occasional job and
starved the rest. A single green run read as recovery when it was not.

## One field settles it

A starved job and a fast real failure look alike: both are red, both are
quick. Duration cannot tell them apart, because a real job can fail in three
seconds.

The field that settles it is `runner_id`. A job GitHub never scheduled
carries `runner_id: 0` and an empty `runner_name`. No runner was assigned, so
no step ran, and that cannot mean anything else. `ci_starvation.py` votes on
that field alone. Duration and the empty body are printed as context and never
change the verdict.

```
python3 platform/ci/ci_starvation.py --run <run_id>   # or a bare job id
```

| Exit | Meaning | What a session does |
|---:|---|---|
| 0 | every job got a real runner | the failure is real and yours; fix it |
| 1 | at least one job was starved | verify locally, say what you ran |
| 2 | this run cannot answer | pick a different run |

The tool reaches the API three ways, in order: the `gh` CLI, direct HTTPS with
a token, or a saved JSON payload passed with `--from-json`. The second route
was added on 31 August because the cloud sessions that most needed the tool
had no `gh` CLI, so until then it exited 2 in exactly the place it was meant
for.

## The mistakes it prevents

Both directions cost real work.

- **Reading starvation as a real failure.** Four pull requests were triaged
  that way on 27 August, which means sessions went looking for bugs in code
  that was fine.
- **Reading a real failure as starvation.** On 7 September, #3671 merged with
  four red checks nobody could see. Three were live, user-facing defects: a
  calculator that rendered "$-1.46", and two pages whose FAQ structured data no
  longer matched their visible text. #3691 fixed them.
- **A false green from the wrong run.** On 17 September a session picked "the
  most recent run" to check whether runners were back. It got GitHub's managed
  `pages build and deployment` run, which is not an Actions workflow, does not
  draw on the metered pool, and kept running through the outage. The tool said
  every job got a real runner. One minute earlier, `Portfolio validate` and
  `Conflict markers` had both been `runner_id: 0`, and all 60 completed runs of
  the Pages publishing workflow had starved. The tool now refuses that run and
  exits 2.
- **The wrong API.** On 28 August four PRs were read as "no checks ran" because
  the commit-status endpoint returns only legacy statuses. Each had six to
  eight red check runs. Use `/commits/<sha>/check-runs` or the PR's checks
  tab.

What the tool cannot tell you is *why* runners stopped. Spent minutes, a
spending limit, a payment problem and disabled Actions all look the same from
a session. The run-timing API is no help: it reported zero billable
milliseconds even for a run that held a runner for 99 seconds. Only the
owner's billing page answers that.

## The local checklist

When the tool says starvation, "merge when CI is green" becomes "run CI here".
The checklist in `verify-and-merge.md` is about two dozen commands: the Node
test suites for each platform area, the venture tests your branch touches,
the Python suites for `gitops/`, `platform/ci/` and `portfolio/`, prompt
validation, and `run_workflow_locally.py`, which reads the workflow files and
runs their steps so the list cannot drift from what CI would have run.

Each line exists because something outside the list went unrun while `main`
broke. The history file records the incidents:

| Date | What broke while CI was dark | Line it added or fixed |
|---|---|---|
| 5 Sep | `main` red on four tests across #3324, #3325 and #3326: three pages missing from the regenerated mirror, one link contrast below WCAG AA | the front-door regeneration and marketing suites |
| 7 Sep | `validate_doc_consistency.py` red on `main` for at least a day; no test imported it | `run_workflow_locally.py --for-changes` |
| 7 Sep | `score_ventures.py --check` red across five merges, each of which verified only its own diff | `run_workflow_locally.py --tree`, which asks whether `main` itself is green |
| 17 Sep | the venture glob missed 21 of 299 ventures that keep tests in a subdirectory: 95 test files and 1,055 passing assertions never ran | quoted `'ventures/<slug>/**/*.test.mjs'`, checked by `checklist_coverage.py` |

The 17 September case is worth spelling out. A `node --test` glob that matches
no files prints `# pass 0` and exits 0. That is a green run that ran nothing,
and nothing flagged it until a session counted.

Browser checks sit beside the list. The first full run, on 6 September, found
48 critical accessibility violations that every other check had passed.

## The fallback that was not one

There was a planned way out. In September all 218 workflows read
`runs-on: ${{ vars.CI_RUNNER || 'ubuntu-latest' }}`, so one repository
variable could move all of them to self-hosted runners, which are not metered.
But those runners were pods in the project's k3s cluster, and the cluster went
down on 4 September, the same day starvation recurred. The owner deleted the
servers on 1 October, so that fallback is gone. A companion post,
[Moving off a Kubernetes cluster to GitHub Pages](2026-10-20-moving-from-kubernetes-to-github-pages.md),
covers the hosting side.

## What we would tell another team

- Classify before you debug. A red check is a claim about code only if a
  runner ran it.
- Never infer recovery from one green run, and never classify a run that is
  not one of your own workflows.
- Keep a local checklist that runs what CI runs, read from the workflow files
  rather than copied from them.
- Treat "zero tests ran" as a failure, not a pass.

This is one repository's experience with metered Actions minutes, not
professional engineering advice for your CI setup. Re-measure on your own
account before relying on any of it.
