---
title: "34 test suites no workflow ran, and the one that was red. Red-teaming the dev-log builder"
seo_title: "Finding test suites no CI workflow runs by resolving node --test globs"
date: 2026-11-14
tags: [testing, mutation-testing, ci, github-actions, redteam]
description: "8 faults seeded into platform/devlog, 4 caught. The suite ran in no workflow. Neither did 33 others, and one of those had been red on main since this morning."
---

Today's red-team run drew `platform/devlog/devlog.mjs` as its target. That file
builds the site's [development analyses](https://marisstella.app/dev/analyses/)
page from the experiments log, the process backlog and the run records.
`redteam.py campaign` seeded 8 faults, one at a time, ran the suite after each
and restored the file. The suite caught 4.

| Line | Fault | Why it got through |
|---|---|---|
| 112 | `\|\|` to `&&` in the doc sort | no test had two docs on the same day, or an undated one |
| 167 | per-day track count starts at 1 | no test read `by_day[...].tracks` |
| 189 | `b.count - a.count` to `+` | the most-reported file was also the first one tallied |
| 189 | `\|\|` to `&&` in the same sort | no test had a tie on count |

The ranking gap is worth a sentence. The old test's top file happened to be
the first one tallied, so a comparator that always returned "keep the order"
still passed. The new test tallies two once-reported files first, then a
twice-reported one, and expects `[m.md 2, b.md 1, z.md 1]`. All four faults
now fail a test (`redteam.py rerun`: 8 of 8).

## Then the question behind the gaps

Who runs this suite? No workflow does. `portfolio-pages.yml` runs
`devlog/build.mjs` to build the page but never `node --test` on it. The
repository already had a tool for this exact hole, `platform/ci/unwired_checks.py`,
which runs every `platform/ci` check and Python suite that no pull-request
workflow names. It didn't look at node suites anywhere else in `platform/`.

Matching names wasn't good enough. Workflows say `node --test "*.test.mjs"`
with `working-directory: platform/pages` written *after* the `run:` line, or
`node --test platform/privacy/*.test.mjs`, or `cd platform/edge && node --test e.test.mjs`.
The new code finds each `node --test` line, takes the step it sits in, reads
that step's working directory and any `cd dir &&` in front of it, and expands
the arguments as globs from there. A suite counts as run only if one of those
globs reaches its file.

Of the 157 `*.test.mjs` files under `platform/`, 123 are run by some workflow.
The other 34 are run by none: 1 in `devlog`, 27 in `distribution`, 6 in
`proposal`.

## One of them was red

`platform/proposal/term-ids.test.mjs` checks that every bid calculator with a
deposit-and-terms panel carries those terms into its share link and its saved
draft. It failed on `locksmith-bid-calculator (save)`.

The page was fine. Earlier today PR #15774 changed the page's save from
`saveBid(localStorage, …)` to `saveBid(pageStorage(), …)`, so that a browser
with site data blocked no longer throws. The guard's regex had the literal
`localStorage` written into it. It went red the moment that PR merged, and
nothing ran it. The regex now accepts any storage handle.

This is the kind of red that does damage slowly. A guard nobody runs still
reads as protection to the next person who opens the file.

## What now runs on its own

`unwired_checks.py` runs on every venture pull request through
`run_venture_tests.py --since`. It now runs those 34 suites too, six at a time.
That adds about 30 seconds, most of it `android.test.mjs` (34 s alone).
`distribution/ios.test.mjs` is a named skip because one of its tests plans the
whole catalogue and takes over 120 s. When a workflow starts running one of
these suites, it drops out of the set without anyone editing a list. On its
first run the new check caught `term-ids.test.mjs`.

The last gap is still open: a PR that touches only `platform/` doesn't trigger
`ventures-tests.yml`. That workflow file is control plane, so the fix needs
the owner's approval. It is already in the red-team open list (2026-11-13).
