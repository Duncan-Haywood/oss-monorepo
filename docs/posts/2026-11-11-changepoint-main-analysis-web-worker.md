---
title: "The last frozen seconds: moving the changepoint detector's main analysis into a Web Worker"
seo_title: "A changepoint analysis in a browser Web Worker, without the freeze"
date: 2026-11-11
tags: [changepoint-detector, time-series, performance, web-workers]
description: "The changepoint page froze 4.7 s on a 7,980-point series. In a Web Worker it answers within 30 ms, and a new click cancels the old run."
---

Earlier today our [changepoint detector](/ventures/changepoint-detector/README.md)
moved its six-setting "Agreed changes" panel into Web Workers. That took the
long freeze away, but not all of it. The main analysis, the one whose chart and
tables you see first, still ran on the page's main thread. On the 7,980-point
tree-ring series the tab sat frozen for 4.7 seconds before anything showed. You
couldn't scroll, and clicking "Find changepoints" again with a different
setting just queued another freeze behind the first.

## What changed

The main analysis now runs in its own worker too. The page sends the request as
plain data: the CSV text and the options for one column, or the column list
for several. The worker sends back the result or an error message. Three
details mattered more than the move itself:

- **A new click cancels the old run.** The page keeps one worker. If you click
  again while it is busy, the page terminates it and starts a fresh one, so a
  slow stale result can never land on top of the one you asked for second. The
  browser check starts a 7,980-point run, swaps in the 100-point Nile series
  after 100 ms, and confirms the Nile summary is still there 1.5 seconds later.
- **The same code runs without workers.** An old browser, or the page opened
  from a `file:` path, gets the identical call on the main thread, after a
  30 ms pause so the "Working" note can paint first. The check removes `Worker`
  from the page and gets the same summary.
- **The page's own result is reused.** The panel's first setting is the plain
  level model, which is often exactly what the main analysis just ran. When
  nothing in your options changes where the cuts fall, the page hands its own
  result to the panel, which then runs five analyses instead of six. A test
  checks this gives the same agreed changes as running all six, on seven option
  sets, and that nine option sets that could move a cut don't get the shortcut.

## What it measured

Headless Chromium, 4 cores, one run each in the same container:

| series | tab frozen before | after: worst timer delay | results shown | panel done, before → after |
|---|---|---|---|---|
| 6,000 seeded points | 2.2 s | 21 ms | 2.2 s | 5.6 s → 5.0 s |
| tree-ring, 7,980 points | 4.7 s | 29 ms | 4.7 s | 11.9 s → 11.0 s |

The results don't arrive any sooner, because the worker does the same work.
What changes is that the page keeps responding the whole time. A 50 ms timer
fired at most 29 ms late, where before it would have waited out the whole
analysis. The panel finished 7 to 11% sooner. That's one run each on a shared
machine, though, so read it as "one fewer analysis", not a speed-up we can quote.

## What's still open

The command line's panel still runs in one thread and skips series over 2,000
points. Node's `worker_threads` could lift that cap the same way. And the
bigger question is still unanswered: on the long labelled series in the Turing
Change Point Dataset, does the agreed summary earn the five extra analyses it
costs?

Everything runs in your browser; nothing you paste is uploaded. The tool is
free and MIT licensed. It is not financial, legal or professional advice.
