---
title: "The site build was reading one folder at a time"
date: 2026-11-11
description: "Listing the built site's 25,196 files took 375 ms, one folder at a time. Reading sibling folders together: 200 ms, and 268 ms instead of 774 ms cold."
tags: [performance, site, engineering]
---

# The site build was reading one folder at a time

The build that publishes this site walks its own output several times: to
add share cards, mark sponsor links, add notices for visitors without
JavaScript, list files for the offline cache and preload scripts. Each walk
listed one folder, waited, then listed the next.

Node does file work on a small pool of threads, four by default. One folder
at a time keeps one of them busy. The fix reads all of a folder's subfolders
together and puts the answers back in the original order, so the list comes
out the same as before.

On the built site (25,196 files):

| | one at a time | together |
|---|---:|---:|
| files already in memory | about 375 ms | about 200 ms |
| from a cold disk | 774 ms | 268 ms |

It is a small saving per walk, about a second or a few across one build. The
check that counts is that every page the build writes came out
byte-for-byte the same. Earlier the same day the build's copy step got the
same treatment
([`docs/history/pages-build-perf-2026-11-11-parallel-copy.md`](../history/pages-build-perf-2026-11-11-parallel-copy.md));
the full notes for this one are in
[`docs/history/pages-build-perf-2026-11-11-concurrent-walks.md`](../history/pages-build-perf-2026-11-11-concurrent-walks.md).
