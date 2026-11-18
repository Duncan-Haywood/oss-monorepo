---
title: "Ten of the top twelve friction rows were locked: the ranking now says so"
seo_title: "Ten of the top twelve friction rows were locked"
date: 2026-11-15
description: "Process runs pick targets from friction_rank.py. Most top rows name owner-gated files, and parallel runs took the same row. It now tags both."
tags: [process, tooling]
---

When the process track in this repository has no open backlog item an agent
can take, its runs go looking for something to fix. The usual place they
look is `platform/ci/friction_rank.py`. It clusters the `doc_friction`
entries that every run record carries and ranks them by how many separate
sessions reported the same problem. The ranking works, and that turned out
to be part of the trouble: every process run reads the same list, sorted
the same way.

Two things went wrong with that, and run records show both of them.

**Parallel runs took the same row.** On 2026-11-15, PR #16028 and the run
behind PR #16035 built the same per-suite timing table for the perf prompt
within the same hour. The second run found the first only after about 40
minutes of work, and its record ends `partial`. On 2026-11-12, three
sessions (#15072, #15074, #15075) fixed the same `run_workflow_locally.py`
symptom one after another. The list gave no hint that a row was already
taken.

**Most top rows could not be landed.** Paths listed in `.github/CODEOWNERS`
(the prompts, CLAUDE.md files, `.github/`) wait for the owner's approval
before they merge. With `--live --days 4`, ten of the top twelve clusters
this morning named one of those files. Runs kept finding that out one row
at a time ("the three ungated ones I checked today...", process run,
2026-11-14).

## What changed

Each row in `friction_rank.py` now carries two more facts:

- `[owner-gated]` when the last matching CODEOWNERS rule for its file names
  an owner. GitHub applies the last match, so `/prompts/runs/`, which has no
  owner, stays open even though `/prompts/` is gated. `--ungated` hides the
  gated rows.
- `open PRs naming it (last 48 h): #N`, from the public REST pulls list
  (it works unauthenticated, and unlike search it shows a PR the minute it
  opens). A PR matches when its title names the reported file or a
  distinctive tool the reports mention (`pick_track`, `run_venture_tests`).
  Generic names such as `prompt-1` or `redteam` sit in too many titles to
  mean anything, so they are left out. An open PR older than 48 hours counts
  as stalled work, not a claim. `--no-prs` skips the network read.

The whole run still takes about 2 s. Twelve unit tests cover the gating
rules and the matcher (fork PRs, stale PRs, pagination, and a 403 that
leaves the PR column "unknown" instead of empty).

## What it does not do

A row with no PR listed is not proof that nobody is working on it. A session
that hasn't opened its draft yet is invisible. The habit that closes that
gap is still to open a draft PR before exploring and to run
`portfolio/router/claim_check.py` against it. The new column just makes the
most common collision visible at the moment a run is choosing.
