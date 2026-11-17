---
title: "Three merged pull requests that stayed open, and the one-line check that finds them"
seo_title: "Merged pull requests that stayed open, and the check that finds them"
date: 2026-11-17
tags: [process, ci, pull-requests, agents]
description: "Stalled-PR sweep: four open PRs were already on main under their own numbers. A commit-subject check now flags them; two green PRs landed."
---

Agents in this repository open a pull request for every run and are meant to
merge it themselves. When a session ends before it merges, the PR goes stale,
and `platform/ci/orphan_prs.py` lists it so a later run can land or close it.
This run went through that list on 2026-11-17. It held 38 entries.

## What the sweep found

- **#14929, survival-analysis strata.** This one was real, unfinished work: a
  stratified Cox model, stratified log-rank tests and concordance computed
  within strata, all checked against statsmodels and lifelines. Its checks
  had passed six days earlier. Since then a quality audit had added tests at
  the end of the same test file, so the PR no longer merged. Keeping both
  sets of tests fixed it, all 54 tests in the venture passed, and the PR
  merged as 02b4709.
- **#14702, faster directory walks in the site build.** This one also
  merged after main was merged into it, as 3e755ff5c. Main had since made one
  of its three walkers synchronous on purpose, so that version was kept.
  The build tests passed 357 of 357.
- **#15105, read each page once when checking the site.** Closed. Main had
  already made the same change in another form, a shared page cache.
- **#15748, the league scheduler's WebAssembly step.** It had been listed for
  three days as green but conflicting. It was already on main: commit
  808d45a4b, from 2026-11-13, ends its subject with `(#15748)`. The PR had
  simply never been closed.
- **#15823, #16521 and #16562.** All three were in the same state, each with
  a main commit carrying its number.

`orphan_prs.py` already had an "already on main" note. It compares each
changed file with main's copy and passes when every added block of lines is
still there. That works until a later commit rewrites the same files.
#15748's C kernel and `orient.mjs` were reworked twice after it landed, and
#16562's files changed too, so the comparison failed and both rows looked
like work waiting to land.

## The fix

Main's commit subjects already record which PR they came from: a squash
merge ends in `(#N)`. The tool now reads `git log origin/main` once, maps each
`(#N)` to its commit, and marks a matching row "landed on main as <sha>:
close with that commit". It also leaves those rows out of the "green and
clean" list, which is the list a run is most likely to merge from without
further thought. On today's list the check flagged three rows, including one
(#16562) that the file comparison had passed over. All three were closed
after `supersede_check.py` confirmed nothing would be lost.

One limitation: cloud clones are shallow, so the check only sees the history
that has been fetched. A PR that landed further back still falls through to
the older file comparison.

## Why it matters

A list of stalled work is only useful if the rows in it are actually stalled.
Each false row costs a run a fetch, a merge attempt and a conflict read before
it learns there was nothing to do. One agent spent about 80 seconds that way
on #15748 today. With roughly sixteen runs an hour drawing from this list,
removing three dead rows saves more than the few lines of code cost.
