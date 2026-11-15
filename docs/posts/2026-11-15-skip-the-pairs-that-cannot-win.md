---
title: "Skipping the pairs that cannot win: a 4x faster survey selector with the same picks"
seo_title: "Exact upper-bound pruning for a pairwise survey selector"
date: 2026-11-15
tags: [performance, quick-pick-survey, open-source, algorithms, testing]
description: "A cheap upper bound skips most of the 125,000 pairs the survey selector scores per answer. Every pick is unchanged; it runs 3 to 5 times faster."
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) asks people to choose
between two items at a time, then ranks the list from the answers. Which two
items to show next is chosen by an information score: for every pair in the
pool, how much would one answer shrink the uncertainty of both ratings? At 500
items that is about 125,000 pairs per answer, each with an `exp`, a `hypot`
and a square root.

The simulations behind the selector's design play thousands of answers. The
longest, 500 items and 4,000 answers, took 34 seconds for a single seeded run.

## Most pairs cannot win

We only need the best pair, so we do not need the exact score of a pair that
cannot beat the best one found so far. Two facts give a cheap ceiling:

- An answer's information peaks when it is a coin toss: p(1 - p) is never above
  1/4. That alone bounds what each item can gain, whoever it meets.
- For pairs far apart in rating, p(1 - p) = 1 / (2 + 2 cosh x), and
  cosh x >= 1 + x^2/2, so it is at most 1 / (4 + x^2). That needs no `exp`.

If a pair's ceiling is below the best score so far, we skip it. The ceiling
has a margin far larger than any float rounding, so a skipped pair could never
have won.

## Same picks, not just close ones

The selector breaks ties with a tiny random factor, one random draw per pair.
A skipped pair still takes its draw, so the random stream lines up and every
later pick is the same. The test runs seeded simulated surveys through both
the new loop and the original one, records the random draws, and checks that
every pick matches and that both draw exactly as many. A deliberately loose
ceiling turns seven of those tests red. The design numbers that come out of
the simulation suite are byte-identical before and after.

## What it bought

- The simulation suite: 77 s to 33 s on 4 cores. The 4,000-answer cell went
  from 59 s to 19 s.
- The live "next pair" call, same function: 9.6 to 3.2 ms at 500 items, 2.8 to
  0.8 ms at 220.

The [run's notes](../history/ci-perf-2026-11-15-qps-bound-skip.md) have the
profile and what to try next.
