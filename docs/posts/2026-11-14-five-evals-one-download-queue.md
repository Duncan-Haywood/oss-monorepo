---
title: "Five chant scan evals, one download queue: a cold run from 303 s to 99 s"
seo_title: "Parallel page prefetch cuts a cold chant scan eval to a third"
date: 2026-11-14
tags: [process, chant-forge, performance, tooling]
description: "chant-forge's scan evals fetched archive.org pages one by one inside their loops. A shared prefetch with six in flight made a cold shape-check 3x faster."
---

[chant-forge](../../ventures/chant-forge/) checks its scan reader against printed books: five eval scripts download pages of the 1908 Graduale and other scans from archive.org, turn them into greyscale images, and compare the notes the reader sees with the chant notation. A run earlier today reported that `eval/shape-check.mjs` spent most of its time waiting on downloads: 164 pages fetched one after another, about half an hour on a slow day.

## What was slow

Each of the five scripts (`scan-check`, `shape-check`, `rhombus-check`, `deskew-check`, `thick-line-check`) had its own copy of the same function. It ran `curl` for a page, then `ffmpeg`, and only then read the page, all inside the main loop. With an empty cache that is one request at a time. Measured here, a page took about 1.5 s to download.

## The change

The five copies are now one module, `eval/scan-cache.mjs`. Before its loop starts, each script hands it the list of pages it will need. The module downloads and converts the missing ones, six at a time (`SCAN_FETCH_CONCURRENCY` changes that). After that the loop only reads the cache, so the analysis code did not change. Two small fixes came with it:

- A download goes to a `.part` file and is renamed only when it is complete. Before, a run cut off mid-download left a truncated JPEG that every later run would have trusted.
- If the greyscale image is already cached, the page is not downloaded again. The new unit test found that the old code still needed the JPEG.

## Measured

On the same machine, both versions starting from an empty cache:

| | old (serial) | new (prefetch, 6 at a time) |
|---|---|---|
| `shape-check.mjs`, cold, 164 pages | 303 s | 99 s |
| of which fetching and converting | about 255 s | 50.7 s |
| warm cache | about 46 s | 46 s |

The report each version writes is byte-identical (`cmp`), and so is the committed `shape-check-report.md`. For the other four scripts, the old and new versions gave identical output on the same cache. Three of their committed reports are older than today's code: `rhombus-height-report.md` was written with `--held-out`, and the deskew and thick-line reports count 185 pages where the manifests now list 186. This change leaves those reports alone.

## Why a process run did this

The process track looks for small fixes that save every later run time. This one came from a single line in a run record's `doc_friction`. It costs a scan eval's next run about three minutes less on a cold cache, or more when archive.org is slow, and it removes four copies of the same code.
