---
title: "Half a minute of frozen tab, gone: six changepoint settings in Web Workers"
seo_title: "Running a changepoint consensus in browser Web Workers"
date: 2026-11-11
tags: [changepoint-detector, time-series, performance, web-workers]
description: "The changepoint detector's agreed-changes panel froze the tab for 34 s on 7,980 points. In Web Workers, results show at 6.5 s and the page keeps responding."
---

Our [changepoint detector](/ventures/changepoint-detector/README.md) opens with
"Agreed changes": the changes that six different model settings all find. We
lead with it because it held up on labelled series we never tuned on (F1 0.71,
against 0.30 for the single level model). But it is expensive. Each setting is
a full analysis, so the panel costs about four times the main result.

On the page, all of that ran on the main thread, right after the main
analysis, with no length cap. Paste the 7,980-point tree-ring series and the
tab froze for about half a minute. You couldn't scroll, and you couldn't click
"Analyze" again to change your mind.

## What changed

The panel now runs in Web Workers, one setting per worker, up to the number of
cores the browser reports. The main results show first. The panel note
counts up ("3 of 6 settings done"), and the merged paragraph replaces it when
the last worker reports back. If you analyze again before it finishes, the old
workers are stopped.

Two smaller choices made a measurable difference:

- **Slowest first.** The six settings are not equal. On tree-ring the two
  AR(1) settings take about 7 s each and the two trend settings about 1 s. If
  the workers take settings in panel order, one slow setting can be left
  running alone at the end. So the page hands out the slow ones first.
- **Same answer, pinned.** The old `consensus()` function is now two pieces:
  run one setting, then merge. A test checks that merging the six results, in
  any finishing order, gives exactly what `consensus()` gives. The browser
  check compares the page's paragraph with Node's on every input, and they
  match character for character.

## Measured

Headless Chromium on four cores, timed from the click
(`eval/agreed-worker-browser.mjs`):

| series | main results | panel done | panel alone, one thread |
|---|---|---|---|
| 1,500 points | 0.3 s | 1.2 s | 1.4 s |
| 6,000 points | 3.3 s | 8.2 s | 12.2 s |
| tree-ring, 7,980 points | 6.5 s | 16.0 s | 27.2 s |

While the panel ran, a 50 ms timer on the page fired at most 80 ms late, so
clicks and scrolling kept working. Before the change, the tab was blocked for
the main analysis plus the whole one-thread panel: about 34 s on tree-ring.

## What's still slow

The main analysis still runs on the main thread, and it takes 6.5 s on
tree-ring. That's the next thing to move. The command line still skips the
panel above 2,000 points; Node's `worker_threads` could lift that cap the same
way. Nothing here changes what the tool finds. It only changes how long you
wait, and whether you can use the page while you wait.

The tool is free, runs entirely in your browser and is MIT licensed. Your data
never leaves your machine, including the copies sent to the workers.
