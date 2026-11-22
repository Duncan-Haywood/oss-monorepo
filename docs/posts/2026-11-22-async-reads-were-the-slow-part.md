---
title: "The async reads were the slow part: three store packagers 37% faster"
seo_title: "When fs.promises is slower than readFileSync in Node.js"
date: 2026-11-22
description: "A Node.js packager read about 6,000 small files one at a time with fs.promises and sat idle for 1.1 of 2.4 s. readFileSync, and reading each file once, cut three test suites from 12.0 s to 7.6 s."
topic: infrastructure
tags: [performance, profiling, nodejs, ci]
---

# The async reads were the slow part

This repository packs each of its free tools for several stores: a browser
extension, a desktop app (Tauri), an iOS project and an Android package. Each
packager has a `plan()` that walks all 1,428 tool folders and reports which
ones qualify. The packagers' tests run `plan()` against the real catalogue,
and those tests run on every pull request that touches a tool.

The desktop test suite took 4.3 s warm and the iOS suite 3.7 s. A CPU profile
of one `plan()` explained why. Of its 2.6 s, **1.1 s was `(idle)`**. The next
four entries were `fstat`, `openFileHandle`, `read` and `close`, each about
140 ms. The code was not slow. It was waiting.

## Why idle

`await fs.promises.readFile(path)` on a small file opens a file handle, stats
it, reads it and closes it. Each of those steps goes to libuv's thread pool and
back. For a 4 KB file the round trips cost more than the read. A loop that
awaits one venture at a time gets no overlap from the async API, only its
overhead. One `plan()` opened 6,056 files that way.

There was a second cost. The packager read every imported module twice:
once to follow its imports and check it makes no network calls, and again to
copy it into the package.

## What we tried

Running 16 ventures at a time with a small pool brought `plan()` from 2.44 s
to 1.76 s. Plain `readFileSync`, with each file read once, brought it to
0.84 s. The second change was also less code, so we kept it. The site builder
here had already reached the same conclusion for its own small-file passes.

| | before | after |
|---|---|---|
| extension `plan()` | 2.36 s | 0.84 s |
| desktop `plan()` | 2.33 s | 0.71 s |
| desktop test suite | 4.3 s | 3.0 s |
| iOS test suite | 3.7 s | 2.1 s |
| Android test suite | 1.4 s | 0.8 s |

To check the output, we hashed every packaged file of every venture, plus two
whole desktop suites, before and after the change. The two dumps are
byte-identical.

## When this applies

Sync reads block the event loop, so they are wrong in a server handling
requests. In a build step or a test that does one thing at a time, nothing else is
waiting on the loop. There, many small files read one after another with
`await` is a pattern worth profiling. Look for `(idle)` at the top of the
profile.

Details, numbers and what is still slow:
[docs/history/ci-perf-2026-11-22-store-packager-sync-reads.md](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-22-store-packager-sync-reads.md).
