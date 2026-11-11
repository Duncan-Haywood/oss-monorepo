---
title: "Eighteen jobs, four cores: the changepoint detector's several-column mode on threads"
seo_title: "Running a changepoint consensus panel on worker threads, same answer, 2.5x faster"
date: 2026-11-11
tags: [changepoint-detector, time-series, performance, worker-threads, web-workers]
description: "Each column's six-setting changepoint panel now runs on worker threads in the CLI and on Web Workers in the browser. The answers are identical; the 3-column currency example went from 8.8 s to 3.6 s."
---

The [changepoint detector](../../ventures/changepoint-detector/README.md) answers "when did
this series change?" by running six settings (plain level, trend, AR(1) two ways, a noise
floor, trend with a floor) and leading with the changes every setting agrees on. On labelled
real series nobody tuned it on, that agreed list scored F1 0.71 against 0.30 for the plain
level model.

With several columns, it does that for every column. Three columns are eighteen full
analyses, and until today they ran one after another. On 1,751 days of franc, pound and yen
returns, the panels were 8.0 s of an 8.2 s run; the joint fit across columns, the part that
sounds expensive, took 0.2 s.

## What changed

The eighteen analyses don't depend on each other, so they now go to a pool: the next job goes
to whichever thread finishes first, and the slowest settings (the two AR(1) fits) across every
column start first, so no long job begins last. The CLI uses Node's `worker_threads`; the page
reuses the Web Workers that already ran the one-column panel. The merge doesn't change: each
column's runs go through the same `mergeConsensus` call as before, and a test pins the result
with 1, 2 and 4 threads, and the CLI's text and JSON, to the one-thread answer.

## How much faster

Measured on 4 cores, one run each:

| input | before | after |
|---|---|---|
| CLI, currency returns, 3 columns | 8.8 s | 3.6 s |
| CLI, DAX/CAC/FTSE/SMI returns, 4 columns | 16.4 s | 6.1 s |
| page, currency returns | 7.5 s | 3.8 s |
| page, European indices | 15.8 s | 7.2 s |
| CLI, German unemployment, 2 columns, 120 quarters | 0.2 s | 0.4 s |

The last row is the honest one. On a tiny file, starting threads costs more than it saves.
(The "before" there is in-process and the "after" includes starting Node, so part of the gap
is process start.) Nothing changed for small inputs that a person would notice.

On the currency set it still finds the same two agreed changes: the franc on 2015-01-20, days
after the Swiss National Bank dropped its euro floor, and the pound on 2016-06-24, the day
after the EU referendum.

## A trap found on the way

`node cli.mjs --columns prices.csv` used to read `prices.csv` as the list of columns, because
the option takes an optional list, and then sat waiting for input. Now a single list entry
ending in `.csv`, `.tsv` or `.txt`, with no other file given, is read as the file. The rule
looks at the name, not at whether the file exists, so the same command means the same thing
in every folder.

Measurements: `eval/cli-columns-threads.out.txt` and `eval/columns-workers-browser.out.txt` in
the venture. Statistical analysis of data you supply, not advice.
