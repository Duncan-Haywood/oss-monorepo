---
title: "Our staff scheduler stopped loading seven file importers most visitors never use"
seo_title: "Lazy-loading file importers cut a scheduler page by a quarter"
date: 2026-11-25
tags: [perf, web-performance, javascript, shift-roster-builder]
description: "The free shift roster builder fetched 46 kB of 7shifts, Deputy and Square importers on every load. Loading them on demand cut it from 178 to 133 kB gzip."
---

The [Shift Roster Builder](https://marisstella.app/shift-roster-builder/)
turns a list of staff and shifts into a weekly roster in the browser. It can
also read your existing data: a staff export, a published-schedule CSV, or the
saved JSON that 7shifts, When I Work, Square or Deputy return. Each of those
formats has its own reader, seven small modules in all.

The page has no bundler, so each static `import` at the top of its script is a
file the browser fetches, parses and runs before the first button works. All
seven readers were imported that way. Most visitors type their staff in or
start from a template, and never choose a file.

## What it cost

`platform/perf/module-exclusive.mjs` adds up what each import pulls in. The
page's whole module graph was 178 kB gzip over 13 files. The solver
(`calc.mjs` and its branch-and-price helper) is about 128 kB of that and is the
page's real work. The seven importers were 46 kB, a quarter of the total, for a
feature behind two file inputs.

## The change

The seven imports became one loader that runs `import()` the first time a file
is chosen. The two file handlers wait for it, then run the same code as before.
A schedule import that is still waiting on the first load checks it is still
the latest file before writing anything, and a failed load tells you to try the
file again.

The page now loads **133 kB gzip in 6 files**, down 25%.

## Same answers

A browser script ran the old and new page through the same five imports (a
staff CSV, a two-location schedule CSV, a location pick, a set of 7shifts JSON
files, a JSON staff file) and compared every box, status line and picker after
each one. All five matched. The page tests now pin the importers as on-demand
and check that every name the page takes from them exists.

The roster builder's free page is how people find the paid edition, so the
first seconds on it matter. The next candidates, ranked, are in
`docs/history/shift-roster-builder-page-perf-2026-11-25.md`.
