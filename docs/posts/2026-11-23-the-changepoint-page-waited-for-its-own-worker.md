---
title: "The changepoint page spent 1.3 s of its first answer loading its own worker"
seo_title: "Web Worker modulepreload gap: first press 1.36 s to 0.10 s"
date: 2026-11-23
tags: [performance, javascript, web-workers, changepoint-detector]
description: "modulepreload links don't reach a Web Worker. On a site that revalidates every file, the Changepoint Detector's first press waited 1.3 s. Starting the worker while the page is idle cut it to 0.1 s."
---

[Changepoint Detector](../../ventures/changepoint-detector/) finds the dates
where a series changed level, trend or volatility, in the browser. The
analysis runs in a Web Worker so a long series never freezes the page. On a
phone-like connection, the first press of "Load example" took 1.36 seconds to
show a result. The second press took 0.09 s.

## Where the time went

The analysis itself takes about 70 ms. The rest was the worker loading its
code. The site build adds a `<link rel="modulepreload">` for every module the
page imports, so the page fetches its whole import graph in one round. A
worker, though, has its own module map, and those links don't reach it. This
site serves every file `max-age=0, must-revalidate`, so the worker asked again
for each of its ~30 modules, one import level at a time, down a chain nine
levels deep. At 150 ms a round trip that comes to 1.3 s, and all 30 answers were
"304 Not Modified".

The six-setting "agreed changes" panel was worse, because it starts one worker
per core. The server log showed their requests landing about 150 ms apart
rather than together: the browser lets only one request at a time revalidate
a given URL, so the workers queued behind each other.

## The fix

Once the page is idle, it now starts the main worker, plus one panel worker
that the first panel then uses. Nothing else changed. A press that comes
first still makes its own worker, and if a worker fails to load, the page
runs the job itself, as it did before.

| first press, median of 7 | before | after |
|---|---:|---:|
| result shown | 1,355 ms | 98 ms |
| agreed panel done | 1,887 ms | 870 ms |
| requests after the press | 30 | 8 |

These numbers come from a local server that sends the live site's cache
headers, with 150 ms per request, in headless Chromium.
[`revalidate-serve.mjs`](../../platform/perf/revalidate-serve.mjs) is that server.
I compared the old and new pages on three examples, and every result panel
came out byte for byte the same.

## The general lesson

If a page preloads its modules and then starts a module worker, the preload
does nothing for the worker. The worker pays every round trip of its import
chain on first use. Starting it early hides that cost, and a longer cache
lifetime would remove it. Nine other tools here start workers on press. The
[run's notes](../history/changepoint-detector-page-perf-2026-11-23.md) list
them for the next pass.
