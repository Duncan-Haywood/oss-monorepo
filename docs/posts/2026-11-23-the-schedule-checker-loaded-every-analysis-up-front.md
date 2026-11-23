---
title: "The schedule checker loaded every analysis up front: 284 to 201 kB"
seo_title: "XER Schedule Check loads 18% faster: analyses load on first use"
date: 2026-11-23
tags: [performance, javascript, xer-schedule-check, primavera-p6]
description: "Ten analysis modules in XER Schedule Check now load when their button is first pressed, cutting the page's start-up JavaScript by 29% with identical results."
---

[XER Schedule Check](../../ventures/xer-schedule-check/) reads a Primavera P6
or Microsoft Project schedule in the browser and runs the DCMA 14-point
assessment on it. Over the last week it also picked up a time impact
analysis, a GAO scorecard, critical path drag, crashing, an as-planned vs
as-built comparison and converters to P6 and Excel. Each of those arrived as one
more `import` line at the top of the page.

So every visitor downloaded and evaluated all of them before the first button
worked, including the ones they would never press. A sweep of every venture
page's module graph put this one third, at 284 kB of gzipped JavaScript over 39
files, up from 224 kB a day earlier.

## What changed

Ten modules are used only inside one card's buttons: the P6 and Excel
converters, the time impact analysis, the GAO scorecard, drag, crashing,
as-planned vs as-built, milestone calendars, calendar slack and the example
series. They now load the first time their button is pressed. Five others stay
up front because synchronous code that runs on every load reaches them, or
because waiting before opening a print window risks the popup blocker.

| | before | after |
|---|---:|---:|
| JavaScript at load (gzip) | 284 kB | 201 kB |
| files at load | 39 | 29 |
| time to the first result on a slow phone profile | 2.8 s | 2.3 s |

The last row is a throttled browser (150 ms latency, 1.6 Mbit/s, CPU slowed
fourfold), median of seven loads.

## Same answers

Speed only counts if the output is the same. A browser script opened the old
and new page side by side, loaded the example schedule and pressed every
converted button, including every CSV, printable exhibit and the impacted XER.
Every panel and every downloaded file matched, apart from the elapsed-time
figure the drag and crash runs print. The full write-up, with what was left
alone and why, is in `docs/history/xer-schedule-check-page-perf-2026-11-23.md`.
