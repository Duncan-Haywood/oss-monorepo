---
title: "One import line pulled a 40 kB search engine into the shed designer"
seo_title: "Cutting an accidental dependency: shed designer 384 kB to 373 kB"
date: 2026-11-22
tags: [perf, web-performance, javascript, shed-designer]
description: "Gallery cards borrowed one scoring function from the design search module and loaded all of it. Moving it out saved 11 kB gzip, same scores."
---

The [Shed Designer](../../ventures/shed-designer/) has the largest module graph of
the venture pages we have measured: 55 ES modules, 384 kB gzip, before the first button works.
Most of that is the editor itself (framing, pricing, drawings, the 3D view).
We went looking for code that was there by accident.

`platform/perf/module-exclusive.mjs` says how many bytes each import pulls in
that nothing else on the page needs. The ready-design gallery (`picker.mjs`)
came out at 28 kB, and almost half of that was `designsearch.mjs`: the search
that tries over a thousand whole designs and keeps the ones nothing beats on
cost, storage and looks. The page never runs that search. The gallery is
built ahead of time.

So why was it loaded? Each gallery card shows a "Looks 77.6/100" score, and
the card code imported that one function, `looksOf`, from the search module.
In plain ES modules there is no tree-shaking: importing one name loads, parses
and runs the whole file.

## The change

`looksOf` and its two small helpers moved, unchanged, into
`looksscore.mjs` (2.6 kB gzip). The search module imports it back and
re-exports it, so everything else that uses the search sees the same API. The
card code imports the small file.

The page went from 384 kB to **373 kB** gzip.

## How we know nothing changed

- The looks score of all 1,168 designs the search evaluates, before and after,
  is byte-identical.
- In a real browser, the old page requested `designsearch.mjs` and the new
  one does not; the eleven gallery cards show the same text.
- A test now walks the card module's imports and fails if the search engine
  ever comes back onto the page that way.

## What we left alone

The next-largest piece, the build instructions (19 kB), looks optional
because it fills a tab. But the page rebuilds those steps after every edit,
and two other features read them. Loading it later would only move the bytes,
not save them. The full reading and the ranked list for the next pass are in
[the perf note](../history/shed-designer-page-perf-2026-11-22.md).
