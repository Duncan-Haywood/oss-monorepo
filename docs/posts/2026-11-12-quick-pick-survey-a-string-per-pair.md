---
title: "A string for every pair: Quick Pick Survey's pair picker, four times faster with the same answers"
seo_title: "Speeding up a quadratic pair selector without changing its output"
date: 2026-11-12
description: "Building a lookup key for each of 125,000 pairs took most of the selector's time. Skipping it: tests 630 s to 151 s, results byte-identical."
tags: [quick-pick-survey, performance, javascript, testing]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) ranks a list by showing
you two options at a time. Once enough answers are in, it picks the next pair by
scoring every possible pair: how much would one answer to this pair shrink the
uncertainty in both items' ratings? On a 500-item list that is about 125,000 pairs
for every question.

The project's simulation tests replay thousands of answers per seeded respondent.
They back the numbers in its documentation, and they took ten minutes to run here,
most of the time on one file.

## Where the time went

A CPU profile left no doubt. The single largest cost was not the arithmetic. It was
this line, run once per pair:

```ts
recentPairKeys.has(pairKey(a.id, b.id))   // pairKey = [a, b].sort().join("::")
```

That is a new array, a string sort and a string join, 125,000 times per question,
to check a set that holds at most the last ten pairs shown. Next came small closures
created for each pair, and a `g(φ)` term recomputed for each pair although it
depends on only one item.

## The fix, and what "same answers" means

A recent pair's key contains both of its ids. So if either id appears in none of
the recent keys, the pair can't be recent, and we skip building the key. The terms
that depend on one item are now computed once per item. The per-pair arithmetic
uses the same operations in the same order, so every score is the same
floating-point number, and the random tie-breaker is drawn the same number of times.

We did not take that on faith:

- A new test keeps the old loop word for word and compares it with the new one. It runs
  hundreds of random pools with deliberately coarse ratings, so ties (and the random
  tie-breaker) decide often, and checks the next random draw too. We broke the new code
  on purpose ten ways that change its behaviour, and the test caught all ten. An
  eleventh change, which only affects speed, passed, as it should.
- The simulation suite writes its measurements to a file. Before and after, the
  file is byte-identical.

## Numbers

| | before | after |
|---|---:|---:|
| simulation suite, wall time | 630 s | 151 s |
| slowest file (500 items, 4,000 answers) | 555 s | 150 s |
| choosing a pair, 500 items, 300 answers | 49 ms | 10 ms |

The last row is the one a respondent sees: the live survey uses the same function
to choose the next question. On long lists it now answers in roughly a fifth of
the time.

The lesson is the same as in our [earlier performance passes](2026-10-20-we-almost-rewrote-it-in-rust.md).
The slow part was one convenient line in a hot loop, not the language. The full
reading, with the profile and the next things to try, is in
[the history note](../history/ci-perf-2026-11-12-qps-information-selector-loop.md).
