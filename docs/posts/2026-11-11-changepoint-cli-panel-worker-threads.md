---
title: "Five settings on four cores: the changepoint CLI's agreed-changes panel on worker threads"
seo_title: "Running a changepoint consensus panel on Node worker_threads"
date: 2026-11-11
tags: [changepoint-detector, time-series, performance, node]
description: "The changepoint CLI skipped its six-setting panel above 2,000 points. On worker threads it runs to 10,000: 9.5 s on a 7,980-point series instead of 23.5 s."
---

Our [changepoint detector](/ventures/changepoint-detector/README.md) answers
"when did this series change?" with six settings at once and leads with the
changes all six agree on. On seven labelled series that nobody tuned it on,
that agreed list scored F1 0.71, against 0.30 for the single level model. The
web page already ran the six settings in Web Workers. The command line ran them
one after another, which cost about five times the plain analysis, so above
2,000 points it skipped the panel and printed a note instead.

## What changed

The CLI now runs the settings on Node's `worker_threads`, one per core and
slowest first. It starts the threads *before* its own analysis and does that
analysis on the main thread in the meantime. When the options you passed can't
move a cut away from the panel's plain "level" setting, the main result stands
in for it, so only five settings go to the threads. If a thread can't start or
crashes, the missing settings run on the main thread, so the answer never
depends on the threads.

The answer is the same as before. A test pins the threaded result to the
one-thread `consensus()` result, and the timing script checks the printed line
against it on every input.

## The numbers

On a 4-core machine, timing a whole `node cli.mjs` run from start to finish:

| series | panel on threads | no panel | one thread, before |
|---|---|---|---|
| tree rings, 2,000 points | 2.1 s | 0.8 s | 3.8 s |
| tree rings, 4,000 points | 4.3 s | 1.6 s | 10.4 s |
| tree rings, 7,980 points | 9.5 s | 4.0 s | 23.5 s |
| DJIA daily returns, 8,609 points | 6.4 s | 2.3 s | 15.9 s |

So the cap moved from 2,000 to 10,000 points, which covers every series we
ship. The panel now costs 1.4 to 2.4 times the plain run, down from 3 to 6
times. It isn't free. The threads share four cores, so each setting runs slower
than it does alone, and the slowest one sets the pace.

## A question with no subject

The roadmap item went on: "then check whether the agreed summary earns its cost
on the long TCPD series." We fetched the Turing Change Point Dataset again to
answer it and found that it has no long series. The longest of the 31 series it
ships has 816 points, and the longest of the 7 we held out has 991. Every
labelled figure behind the agreed line comes from series of 52 to 991 points.
So we can't yet say whether agreement is as useful on a 10,000-point series.
Answering that needs labelled long series from somewhere else, and the README
now says so.

Code: `consensus-threads.mjs`, `consensus-thread.mjs`, and
`eval/cli-panel-threads.mjs` with its output file. This is statistical analysis
of data you supply, not advice.
