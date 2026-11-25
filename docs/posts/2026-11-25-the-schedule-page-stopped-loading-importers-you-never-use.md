---
title: "The staff schedule page stopped downloading importers most visitors never use"
seo_title: "Faster free staff scheduler: importers load on demand"
date: 2026-11-25
tags: [performance, shift-roster-builder, javascript, web-performance]
description: "The free staff scheduler now loads its 7shifts, Deputy, Square and When I Work importers only when you pick a file, and is ready 14% sooner on slow links."
---

The [Shift Roster Builder](https://marisstella.app/shift-roster-builder/) builds a week's staff schedule in your
browser. It can also read the staff and shift exports from 7shifts, When I Work, Square, Deputy and plain CSV files.
Those seven readers came to 46.5 kB of compressed JavaScript, about a quarter of the page's code, and every visitor
downloaded them. That included the many who type their team in or start from the example and never pick a file.

Now the readers load the first time you choose a file. The staff readers load on a staff file and the shift readers
on a shift file. If the download fails, the page says so, and picking the file again retries it.

## What it changed

We loaded the old page and the new one in Chromium on a throttled link (150 ms round trip, 1.6 Mbit/s, a CPU four
times slower), with the cache off, seven runs each:

| | before | after |
|---|---:|---:|
| JavaScript files loaded at start | 13 | 6 |
| bytes transferred at load | 219 kB | 171 kB |
| page ready (median) | 1.74 s | 1.49 s |

## Same answers

The aim was a faster page with no change in results. We fed both versions the same nine sets of files: CSVs, a CSV
with no name column, and the saved API responses from each scheduler. We changed the location picker where a file
had two shops. All 14 resulting screens were identical, down to the status message. A new test fails if the page
ever asks a reader module for a function that module doesn't export.

The rest of the page is one large scheduling engine, which every button calls. Splitting that up is the next job,
and the [perf notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/shift-roster-builder-page-perf-2026-11-25.md)
list it first.
