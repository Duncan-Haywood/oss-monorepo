---
title: "Seven calls, one question: a 26-second analysis that only needed one fit"
seo_title: "Memoising a pure likelihood fit: 26 s to 4.6 s in a change-point tool"
date: 2026-11-16
tags: [performance, changepoint-detector, javascript, testing]
description: "A several-columns analysis in the change-point detector ran the same 3.6-second stale-feed fit seven times. A 16-entry memo cut it to 4.6 s, same output."
---

The [change-point detector](../../ventures/changepoint-detector/) has a check
for a feed that went stale. When a series starts repeating its last value more
often, that can be a real change, or it can just be rounding: a slow walk
recorded to one decimal repeats a lot. To tell the two apart, the tool fits two
models of a hidden random walk to the stretch, by forward filtering, and
compares their likelihoods. On a 218-month stretch that takes about 3.6
seconds.

Open the bundled frozen-juice data with three columns, though, and the
analysis took **26 seconds**. The profile said 25 of those were the stale-feed
fit, so it was running seven times. We counted the calls: **seven calls, one
distinct input**. The several-columns check fits the ppi column's stretch once,
and the "consensus" view re-runs the analysis under each of its settings,
which asks the same question about the same 218 numbers each time.

The fit is a pure function of the ticks and the options. So it now keeps its
last 16 answers, keyed on exactly those, and hands each caller its own copy.
The same analysis takes **4.6 seconds** and gives the same JSON, down to the
hash. The test file it lived in went from 42.8 s to 12.4 s, and the whole
suite uses about 40 s less CPU on every pull request that touches the tool.

## The idea that didn't work

The same morning we tried something cleverer on the league scheduler. Its
annealer recounts the whole carry-over sum after every move, even though a move
changes only two rounds. Keeping the counts up to date and changing only what
moved is the textbook fix, and a 411-case sweep showed it gave byte-identical
schedules.

It was also slower: 77 to 96 seconds against 55. At 8 to 14 teams, a full
recount is about 13 tight additions per team. The incremental version spends
about eight count updates per changed cell plus an undo log, and a round swap
changes every team. The clever version only pays off well past 30 teams, so it
was reverted, and the
[history note](../history/ci-perf-2026-11-16-stale-lr-memo.md) tells the next
run not to try it at these sizes.

Both results came from the same habit: measure what the time is spent on
before choosing the fix. Here the slow part was a question being asked seven
times, not slow arithmetic.
