---
title: "One import line cost our multi-division schedule page 142 kB of code it never ran"
seo_title: "One import line pulled 142 kB of unused code into a page"
date: 2026-11-23
tags: [perf, web-performance, javascript, league-schedule-generator]
description: "Seven small text parsers lived next to a 117 kB solver, so the multi-division league page fetched both. Moving them cut it from 217 kB to 75 kB gzip."
---

> **Update, 2026-11-27:** the self-hosted league page and its deploy configs were withdrawn; it is not offered to run yourself and no hosted version is live yet. The schedule generator itself still runs free in your browser.

The [League Schedule Generator](../../ventures/league-schedule-generator/)
is plain ES modules in the browser, with no bundler. That keeps it easy to
self-host. The catch is that a static `import` pulls in the whole file it names,
plus everything that file imports, whether or not the page calls any of it.

Earlier today the 4,195-line `calc.mjs` was split into fifteen feature
modules, and eight pages dropped 67 to 93% of their code. The
[multi-division page](../../ventures/league-schedule-generator/multi-division-league-schedule.html)
barely moved: 251 kB down to 217 kB gzip. It looked like it had to be that
heavy. It didn't.

## What it was loading

Following its imports one by one (`eval/page-weight.mjs`) shows where the
bytes came from:

| module | gzip | runs on this page? |
|---|---|---|
| `carryover.mjs` (carry-over search) | 41 kB | no |
| `nights.mjs` + two night-design tables | 54 kB | no |
| `orient.mjs` + its WebAssembly | 22 kB | no |
| `schedule.mjs` (single-league season builder) | 27 kB | 7 small functions |

The multi-division engine, `divisions.mjs`, builds its own season on shared
courts. All it took from `schedule.mjs` was seven helpers: a CSV row reader,
name and time list parsers, court closures, relabelling a round robin, and a
forfeit count. That one import line brought in the single-league solver
stack behind them.

## The change

The seven helpers moved to a new 88-line `fields.mjs`, which imports only the
date parser. `schedule.mjs` imports them back and re-exports them, so every
other importer is unchanged, and the moved code is the same byte for byte.

| multi-division page | modules | gzip |
|---|---|---|
| before | 17 | 217 kB |
| after | 11 | 75 kB |

In Chromium the page loads its 11 modules and builds the example league: 73
matches over 11 nights, the validator reports every pair meets the right
number of times and no court is double-booked, and the console shows no errors. A test
now fails if the page ever reaches the season builder again.

## The lesson for bundler-free sites

Without a bundler there is no tree-shaking. A small helper sitting in a big
file costs the whole file. A cheap check is to list, for each page, which modules
it reaches and how much of each it actually calls. Where a page uses a few
small functions from a heavy module, move them into their own module.
