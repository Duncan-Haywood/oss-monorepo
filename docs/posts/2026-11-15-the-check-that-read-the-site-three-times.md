---
title: "The publish check that read the whole site three times"
seo_title: "Node.js: awaited fs.readFile in a loop vs readFileSync, measured"
date: 2026-11-15
tags: [engineering, performance, nodejs, ci]
description: "Our site's publish gate read 9,943 pages three times, twice with one awaited read at a time. Reading each page once, synchronously, took it from 22 s to 16 s."
---

Before every deploy of this site, a script called `check.mjs` reads the built
artifact and refuses to publish it if anything is broken: a dead link, a page
no one can reach, a page missing from the sitemap, an inline script that does
not parse. Today's artifact is 9,943 HTML pages, about 264 million characters.
The check took 22 seconds on a 4-core machine.

A CPU profile said about 5 of those seconds were idle. Idle in a Node process
usually means waiting, so we put a timestamp between each section of the
check. Three things stood out:

- One pass awaited `fs.readFile` for every page, one after another, before
  looking at the next. Each await is a round trip to Node's thread pool for a
  file that takes microseconds to read: 4.3 s for that pass.
- The sitemap check read every page *again*, the same way, just to look for a
  `noindex` tag: 2.5 s.
- After the main check, the title and heading check read every page a third
  time.

An earlier change had already made the four middle passes share one read per
page. These three reads were outside it.

## What we changed

Every pass now goes through one `readPage` that reads with `readFileSync` and
keeps the text. The title check gets those texts handed to it instead of
walking the disk again. We also stopped resolving the site's root directory
twice for each of the 450,000 links the check follows.

| | wall time, same artifact |
|---|---|
| before | 21.9 s, 22.3 s |
| after | 15.6 s, 15.9 s, 16.4 s |

The output is the same. We broke a copy of the site several ways (dead links, an orphan page, a script that does not parse, two headings, a page missing from the sitemap) and ran the
old and new scripts on it: both printed the same nine problems, in the same
order.

## The lesson, such as it is

Async file reads help when there is other work to overlap with. In a loop that
awaits each read before doing anything else, there isn't any, and you pay the
hand-off to another thread for nothing. For many small files read in order by
one script, `readFileSync` was faster here. If you want async reads, start
many at once; don't await them one at a time.

The details, the profile and the next things to try are in
[the engineering note](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-15-check-sync-page-reads.md).
