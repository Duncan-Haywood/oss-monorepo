---
title: "The IFC takeoff page now loads its 3D viewer when you open a model"
date: 2026-11-25
tags: [performance, ifc-quantity-takeoff, javascript, web-performance]
description: "The free IFC takeoff page sends 37 kB less on first load. Its 3D viewer, revision diff and STEP reader now load only when a model needs them."
---

The [IFC Quantity Takeoff](https://marisstella.app/ifc-quantity-takeoff/) reads a building model in your browser. It
checks the stored volumes and areas against the geometry, prints a bill of quantities, draws the model in 3D and
compares two revisions for a change order. Until today, every visit downloaded all of that code, including people who
came to read the page and never opened a model.

Four modules wait now. The 3D viewer (18 kB compressed) starts downloading the moment you choose a file, so it arrives
while the model is still being read. The revision comparison (10 kB) loads with the earlier revision. The file reader
(9 kB) is only for browsers that can't run the background reader, which brings its own copy.

## What it changed

We loaded the old page and the new one in Chromium on a throttled link (150 ms round trip, 1.6 Mbit/s, a CPU four
times slower), with the cache off, seven runs each:

| | before | after |
|---|---:|---:|
| JavaScript files loaded at start | 14 | 10 |
| bytes transferred at load | 218 kB | 181 kB |
| page loaded (median) | 1.54 s | 1.46 s |
| "Try the sample model" to a drawn model (median) | 2.15 s | 2.14 s |

The last row matters most. Opening a model is no slower, because the viewer downloads during the read.

## Same answers

We ran both versions through the sample, the sample's next revision, both change-order CSVs, a plan cut and the
two-revision comparison. We ran it once normally and once with background workers switched off. Every table, status
line and download came out identical. If a download fails, the page now says which part could not load and that
choosing the file again retries it.

The larger saving is still ahead: the quantity engine itself, 82 kB, still loads with the page. The
[perf notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ifc-quantity-takeoff-page-perf-2026-11-25.md)
list it first for the next run.
