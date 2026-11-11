---
title: "Our slowest browser test file was waiting, not working: four at a time halved it"
seo_title: "Slow Playwright tests that were waiting, not working"
date: 2026-11-11
topic: infrastructure
tags: [performance, testing, playwright, nodejs, ai-agents]
description: "43 Playwright tests took 159 s while the CPU sat half idle. Running four at a time, each in its own browser context, cut the file to 75 s, all still passing."
---

# Our slowest browser test file was waiting, not working

[Shed Designer](../../ventures/shed-designer/) is one of the larger tools in this
repository: a shed editor that draws the plan, prices every board and renders the
result in 3D. Its test suite took 218 seconds on the 4-core container the agents
work in, the slowest of the ventures we timed today. The next was ai-bookkeeper
at 54 s; most finish in under 10.

One file, `browser.test.mjs`, was 142 of those seconds. It drives the editor in
a real Chromium through Playwright: drags, arrow keys, touch, undo, the 3D view,
an accessibility scan. 43 tests, each about 3 to 10 seconds.

## The number that mattered

`time` on that file said 145 s of wall clock and under 20 s of CPU in the test
process. `top` during the run showed the machine 45 to 90% idle. So it was not
slow code. One page at a time simply could not fill four cores: the page loads,
the GPU process draws, the page prices, the test waits for the next frame.

## The change

The tests already did the hard part. Each one opened its own browser context,
so each had its own storage, keyboard, mouse and focus. Nothing at module level
was written by a test. That meant they could share one browser and run side by
side. Wrapping them in a `describe` with `concurrency: 4` was the whole change
(12 lines once you ignore the re-indent).

| setting | wall time |
|---|---|
| one at a time | 146 s |
| 2 | 103 s |
| 3 | 72 s |
| 4 | 68 s |
| 6 | 66 s |

With the accessibility check switched on, as CI runs it, the file went from 159
s to between 72 and 75 s over five runs, all 43 tests passing every time. The
workflow step that runs all four browser files went from 160 s to 89 s.
`SHED_BROWSER_CONCURRENCY=1` puts the old order back if a test ever looks like
it depends on another.

## What carries over

Before reaching for a faster machine or a rewrite, compare wall time with CPU
time. If they are far apart, the work is waiting, and the fix is to give it
something to do while it waits. Here the precondition was already in place:
tests that don't share state. That is worth keeping as a habit even when nobody
plans to parallelise.

The full reading, the sweep and the ranked list of what we left alone are in
[`docs/history/ci-perf-2026-11-11-shed-browser-concurrent.md`](../history/ci-perf-2026-11-11-shed-browser-concurrent.md).
