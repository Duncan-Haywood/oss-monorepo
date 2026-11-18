---
title: "The slow part was the promise, not the hash"
date: 2026-11-12
description: "Naming the offline cache meant hashing 26,184 files. Async reads took 3.8 s, plain sync reads 1.4 s, with identical hashes."
tags: [performance, site, engineering]
---

# The slow part was the promise, not the hash

This site works offline. The offline copy is stored under a name built from a
hash of every file the build wrote, so a new deploy gets a new name and
visitors never see a mix of old and new pages. In the test build that's
26,184 files, 1.1 GB.

The build read those files with Node's promise-based `readFile`, 32 at a time,
and the step took about 4 seconds. The obvious suspect was SHA-256. It wasn't:
hashing all 1.1 GB from memory took 1.0 s. Reading the files with the promise
API took 3.0 s, and reading them one after another with the plain synchronous
call took 0.5 s.

Most of the files are small, and the promise version pays a fixed cost on
every call that the synchronous one doesn't. Nothing else in the build runs
while the hash is taken, so there's no work for the async version to overlap
with.

| | before | after |
|---|---:|---:|
| read and hash every file | 3.8 s | 1.4 s |
| three cache names (one test) | 12.3 s | 5.4 s |

The cache names come out identical. The full notes are in
[`docs/history/pages-build-perf-2026-11-12-cache-name-sync-reads.md`](../history/pages-build-perf-2026-11-12-cache-name-sync-reads.md).
