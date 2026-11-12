---
title: "Every lumber length was even, so the optimizer did twice the work it needed"
seo_title: "Halving a cutting-stock knapsack with a common factor"
date: 2026-11-12
tags: [wall-framing-takeoff, performance, algorithms, cutting-stock]
description: "Every lumber length in the optimizer's knapsack was even. Dividing out the common factor cut our slowest engine test by 28%, same answers."
---

The [wall framing takeoff](https://marisstella.app/wall-framing-takeoff/)
buys lumber by column generation: a linear program picks how many of each
cutting pattern to use, and a knapsack finds the next pattern worth adding.
The knapsack works in sixteenths of an inch, so an 8 ft board is a table of
about 3,000 cells, filled once per chunk of pieces, every round.

We profiled our slowest engine test, a sweep that sets every field of a sample
plan to a hostile value and runs the whole takeoff, and the knapsack was more
than half its time. Then we logged what it was given: on the sample plan, all
76 calls had every piece and board length even. Pieces are cut to whole inches
or eighths, and the default saw kerf is 1/8 in, so in sixteenths everything is
a multiple of 2.

## The change

If every weight is a multiple of some number *g*, only multiples of *g* can be
filled, and the best value for a capacity *c* is the best value for the
largest multiple of *g* below it. So the knapsack now divides the weights by
their greatest common divisor, fills a table *g* times shorter, and looks each
board up at `floor(capacity / g)`.

It runs the same additions in the same order, so this is not an
approximation. On 20,000 random knapsacks and 814 full takeoffs, old and new
code gave byte-identical results. A new test keeps the old table as a
reference and checks 300 seeded cases against it exactly.

## What it bought

| | before | after |
|---|---|---|
| mutation sweep test | 12.0 s | 8.6 s |
| one sample-plan takeoff | 15.9 ms | 15.0 ms |

The sweep gains more than the single takeoff because its mutated plans have
longer walls and more piece lengths, where the knapsack is a bigger share.
The full write-up, with the profile and what we left alone, is in
[`docs/history/ci-perf-2026-11-12-knapsack-gcd.md`](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-12-knapsack-gcd.md).

Estimates only: the takeoff counts lumber from the plan you type in, and is
not an engineering or code review.
