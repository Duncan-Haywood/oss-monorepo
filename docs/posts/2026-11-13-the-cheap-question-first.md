---
title: "Ask the cheap question first: a page check from 5.4 s to 1.2 s"
seo_title: "Speeding up a Python HTML lint with a short-circuit and a process pool"
date: 2026-11-13
tags: [performance, ci, python]
description: "Our missing-element-id check spent most of its time collecting ids on pages that never look one up. Asking that first cut it by three quarters."
---

One of the checks that guards our 3,700 calculator pages reads each page's
scripts for `document.getElementById("result")` and fails if no element on the
page has `id="result"`. A lookup like that returns `null`, the next line
throws, and the calculator is dead without any unit test noticing.

It took 5.4 seconds. A profile put 4 of them in one regular expression that
gathers every id the page defines: `id="x"`, `.id = 'x'`, `setAttribute('id', …)`
and so on, across the page and its scripts.

That set only matters for judging a lookup. Most pages don't contain a single
literal `getElementById`; their scripts find elements another way. So the
check now asks the cheap question first ("does this page look up any id by
name?") and only builds the expensive set when the answer is yes. The answer
for every page is the same set as before.

Then both this check and its neighbour, which flags unbacked "trusted by
5,000 teams" copy, went onto a small process pool we added yesterday for
five other page checks. Each page's answer depends only on that page, so the
pool can hand the results back in order and the output is byte-for-byte the
same.

Together: 10.3 s down to 2.6 s. We checked "the same" the strict way. We
copied the pages, planted 160 faults in 80 of them, ran the old and new
scripts, and compared the outputs with `cmp`: identical, 90 findings each.

We also measured a third candidate, the conflict-marker scan, which an
earlier note listed at 11 seconds. With a warm disk cache it takes 2.3
seconds, and simply reading the 1 GB of tracked files takes 0.9 of those.
The 11 seconds was a cold cache. Our faster-looking version turned out
slower, so we didn't ship it. The details are in
[the run's notes](https://github.com/Duncan-Haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-12-social-proof-dom-refs-pool.md).
