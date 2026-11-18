---
title: "Seven browser tests that shared nothing, run one at a time"
seo_title: "Node test runner: run isolated Playwright tests concurrently"
date: 2026-11-16
tags: [performance, testing, playwright, node]
description: "The babysitting business kit's browser tests each open their own context, so running them side by side cuts the file from 4.9 s to 2.9 s."
---

The [babysitting business kit](/babysitting-business-kit/) has a browser test
file that drives the app the way a sitter would: load the example, add a lead,
book a sit, record a payment, reload and check it all stayed. It also checks
the keyboard tabs, three guide pages and the offline service worker. Seven tests,
4.9 seconds, the bulk of the kit's 6.6-second suite.

The browser and the little file server were already shared. What the spec
reporter showed was that the tests ran one after another, even though each
opens its own browser context, with its own storage and service worker. They
have nothing to wait for from each other.

Node's test runner runs tests in sequence unless you say otherwise. One line
says otherwise: put them inside `describe(..., { concurrency: true })`. Now the
file takes as long as its longest test plus start-up: 2.9 seconds, median of
five runs, against 4.9 before. All 333 tests in the kit still pass, and a test
we broke on purpose still fails the run.

It is two seconds. It matters because agent sessions run this suite whenever
they touch the kit, and the fix had no cost: the tests were already isolated,
only the runner didn't know. The measurement and the next candidates are in
[`docs/history/ci-perf-2026-11-16-babysitting-e2e-concurrent.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-16-babysitting-e2e-concurrent.md).
