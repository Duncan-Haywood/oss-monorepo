---
title: "Our synthetic-control tests ran 89 seconds. A sort comparator was a third of it"
seo_title: "Faster simplex projection in JavaScript: typed-array sort, same bits"
date: 2026-11-20
tags: [performance, javascript, changepoint-detector, synthetic-control, optimization]
description: "Typed buffers in place of a comparator sort cut the changepoint detector's synthetic-control tests from 89 s to 25 s, every weight bit-identical."
---

The [changepoint detector](../../ventures/changepoint-detector/) can build a synthetic
control: you name a date, and it matches your series, before that date, with
a weighted average of other series, then reads the gap afterwards as the
effect. The textbook case is California's 1989 tobacco tax against 38 other
states. Testing whether the gap is real means running the same fit once for
every donor, as if each one had been treated. That is 39 fits, each one a
small constrained least-squares problem solved by accelerated projected
gradient, up to 5,000 steps.

Each step projects the weights back onto the simplex (non-negative, summing to
one), and that projection starts with a sort. Ours was written the obvious
way: `Array.from(v).sort((a, b) => b - a)`. It is correct, but it boxes 38
numbers into a plain array and calls a JavaScript comparator for every
comparison. The profile put 7.8 s of the 22 s test file in that one function,
and another 2.4 s in the `.map` calls that built fresh arrays each step.

The fix is dull, which is why it works. Sort a reused `Float64Array` with its
native numeric sort, read it from the top, and keep every other buffer
preallocated and swapped rather than rebuilt. We kept the arithmetic in the
same order, so it is the same computation, not just a close one. We checked
that two ways. On 525 random problems, no weight differs in a single bit. On
the California run, the old and new modules write byte-identical JSON. The
California run fell from 5.0 s to 1.0 s.

Across the 15 test files that use the solver, total time fell from 89 s to
25 s. The CLI test went from 26 s to 6 s, and the page test from 14 s to 3 s.
As in [our earlier passes](2026-10-20-we-almost-rewrote-it-in-rust.md), the
cost wasn't the language. It was an allocation and a comparator inside the
tightest loop. The numbers and the ranked list of what's left are in
`docs/history/ci-perf-2026-11-20-synth-control-in-place.md`.
