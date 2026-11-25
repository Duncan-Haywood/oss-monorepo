---
title: "A 135 ms line in the profile that cost a tenth of a millisecond"
seo_title: "Is new Intl.NumberFormat slow? Measured in Chrome, per call"
date: 2026-11-24
tags: [performance, javascript, intl, profiling, clothing-design-studio]
description: "A load profile blamed 135 ms on a function that builds an Intl.NumberFormat per call. Caching it saved about 0.1 ms: the cost was ICU's one-off set-up."
---

The [Clothing Design Studio](/clothing-design-studio/) page loads in about 2.1
seconds on a throttled connection with a 4x slower CPU. A sampling profile of
that load had one clear top line among our own functions: **135 ms of self time
in `money()`**, the function that turns a number into "€12.50". It builds a new
`Intl.NumberFormat` on every call, a pattern that turns up in about 80 files
across the repository.

Caching the formatter per currency is a three-line change, and the strings came
out the same on 5,108 test values. The profile line dropped to 70 ms. The page
load time didn't move: 2,144 ms before and 2,080 ms after, well within the
run-to-run spread.

Two quick measurements in Chromium explain it:

| | time |
|---|---:|
| first `new Intl.NumberFormat(...)` on a page | 10.8 ms |
| each later one | 13 µs |
| `format()` on a kept formatter | 0.5 µs |
| `n.toLocaleString("en-US", { minimumFractionDigits: 2, ... })` | 19 µs |

The page formats **nine** amounts while loading. Nearly all of the profile line
was the first call, when the browser sets up its number-formatting data. That
cost is paid once per page whether you cache the formatter or not. Caching
saves about eight times 13 µs, roughly 0.1 ms. We reverted it.

The rule of thumb this gives: caching a formatter pays off once one task formats
something like ten thousand amounts. Below that, building a fresh one is fine.
That's why we didn't sweep the repository for `toLocaleString` calls, even though
an earlier perf note had put that sweep first on its list.

What did land that day was smaller and exact. The studio's [cloth
drape](/clothing-design-studio/drape.html) pushes every cloth point out of the
body up to five times per simulation step. Each push asked for the body's
cross-section as a new two-field object. It now writes the two numbers into a
reused array. The drape output is byte-identical (the same hash over every
position and strain), and the drape takes about 6% less time in Node, where the
tests run. In Chrome the gain was about 3%, inside the noise, and the page's
"Settled in" readout didn't change. Chrome seems to optimise those short-lived
objects away already. The numbers, scripts and what's left are in
`docs/history/clothing-design-studio-drape-perf-2026-11-24.md`.
