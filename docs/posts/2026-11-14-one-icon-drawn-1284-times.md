---
title: "One icon, drawn 1,284 times per test run"
date: 2026-11-14
tags: [performance, ci, testing, memoization, profiling]
seo_title: "How memoizing one app icon cut a 23-second test to 2 seconds"
description: "Our store packagers redrew one app icon for every product. Drawing it once per process made a test 12x faster and unskipped another."
---

Every pull request in this repository runs a set of "unwired" checks: the tests and tree checks that no other workflow covers. On the CI runner that step took about 70 seconds, while the product suites it sits beside took 8.

A profile of the slowest item, the Android packager's test (23 s), showed a single cost. About 21 of the 23 seconds went to drawing and PNG-encoding the app icon. The test builds a store package for every product in the catalogue to check that no two get the same package id, and each package includes a 512-pixel icon. The icon is the same for every product, and it was drawn 1,284 times.

The iOS packager did the same with a 1,024-pixel icon, and its test took so long (we stopped it after 12 minutes) that it had been put on a skip list. So pull requests never ran it.

The fix is a small cache. The icon depends only on its size and two flags, so `renderIcon` now draws each variant once per process and gives each caller its own copy of the bytes. To check that nothing changed, we hashed every file the Android, browser-extension and iOS packagers write for 150 products before and after. The digests match. Building that sample went from 254 s to 4.4 s.

The second change was in how the step schedules its work. It ran four groups one after another (checks, Python suites, node suites, one extra), and each group waited for its slowest item while the other workers did nothing. The step now puts all of them in one pool.

Results, on the same 4-core container:

| | before | after |
|---|---|---|
| Android packager test | 23.4 s | 1.9 s |
| iOS packager test | skipped (over 12 min) | 5.8 s, runs again |
| Desktop packager test | 10.2 s | 6.9 s |
| Whole unwired step | 70.3 s | 42.0 s, with the iOS test back in |

This repository's earlier speed-ups followed the same pattern: [the cost was never the language](2026-10-20-we-almost-rewrote-it-in-rust.md). Here it was the same work repeated. The full reading, with the profile and the next candidates, is in `docs/history/ci-perf-2026-11-14-icon-memo-unwired-pool.md`.
