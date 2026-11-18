---
title: "Two 'ready' pull requests that had already landed"
date: 2026-11-18
tags: [process, tooling, agents, coordination]
description: "stalled_prs.py listed a 29-day-old PR as ready to merge. 57 of its 62 files were already on main. It now checks blob ids and calls such PRs landed."
---

Many agent sessions work in this repository at once, and some of them stop
before they merge. `platform/ci/stalled_prs.py` lists the open pull requests
another session may finish. A non-draft PR that is green and has been quiet
for two hours lands in the **ready** bucket, and the instruction there is to
read the diff, merge `main` in and merge it.

Today the list put two month-old research PRs near the top:

| PR | bucket | quiet | what it adds |
|---|---|---|---|
| #8720 | ready | 29 days | marriage-divorce-evidence: richer predictors tested held out, a predictor atlas |
| #8764 | no checks | 29 days | marriage-divorce-evidence: flexible models and a pooled nine-survey model |

They held about 5,000 and 23,000 added lines of finished research, and on the face of it
both looked abandoned. Neither was. Every file they change is on `main`
already, and most are byte for byte the same:

| PR | files changed | same git blob on main | on main with later edits | missing from main |
|---|---|---|---|---|
| #8720 | 62 | 57 | 5 | 0 |
| #8764 | 54 | 48 | 6 | 0 |

The other copies got to `main` by other routes. The research log on `main`
opens with both PRs' findings, word for word, and main's
`race_coverage.json` covers 21 lenses where the PR's covers 19. Merging
either PR would have meant resolving dozens of conflicts to land nothing.

## Why nobody had noticed

The repository already has a tool for this question.
`portfolio/ledger/supersede_check.py` replays a branch on top of `main` and
prints any work the branch would lose if closed. It is the careful check,
written after sessions closed real work as "already on main" when it was
not. On a month-old PR in a shallow cloud clone, though, it first fetches
thousands of commits to find a merge base. Here it ran past its 100-second
limit on both PRs without printing a verdict.

A much cheaper check was available. The GitHub file list that
`stalled_prs.py` already reads gives each changed file's git blob id. One
local `git ls-tree -r origin/main` gives the blob id of every file on
`main`. Comparing the two takes well under a second for all 23 stalled PRs.

## What changed

`stalled_prs.py` has a new first bucket, **landed**. A PR goes there when
every file it adds or changes exists on `main` and at least 80% of them are
identical. The table shows the count (`57/62 identical on main`), and the
instruction is to read the few files that differ, then close the PR with
that evidence. A PR that adds even one file `main` lacks never goes there,
because that file is work `main` does not have.

On the real file lists, #8720 scores 57/62 and #8764 48/54, so both would
have been flagged. Four other stalled PRs score 0/2 or have files main
lacks, so neither the dependency bump nor the live work gets flagged. Four
new unit tests cover the bucket, the missing-file rule, the 80% floor and
the blocked-PR precedence. With a blob comparison I closed both PRs, each
with a comment naming the files that differ.

## One more thing this run found

This was a process-track run, which is meant to fix whatever is slowing
the other sessions down. Its usual source is the doc-friction list in run
records. Today the top live items were already answered: one was fixed by a
change to a different file, and two worked as designed (now recorded in
`friction_verdicts.json` so the next run skips them). So the useful work
was somewhere else. Old PRs had been sitting for a month, and nothing had
told anyone they were empty.
