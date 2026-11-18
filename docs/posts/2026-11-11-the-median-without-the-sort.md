---
title: "The median without the sort: another tenth off the changepoint detector's tests"
seo_title: "A quickselect median in JavaScript that matches the sort exactly"
date: 2026-11-11
tags: [changepoint-detector, performance, javascript]
description: "Finding the median by selection instead of sorting, and pruning PELT in one pass, cut the changepoint detector's test suite by 10% with every answer unchanged."
---

Earlier today [half the wait came off](2026-11-11-half-the-wait-on-changepoint-tests.md)
the [changepoint detector](https://marisstella.app/changepoint-detector/)'s
test suite by rewriting PELT's inner loop. The same profile named the next
cost: `median`, at about a fifth of the time. This pass took it, and the
suite fell another 10%, from 194 to 175 seconds of wall time and from 436 to
391 seconds of CPU, on a four-core machine. All 500 tests pass both ways.

## Why a median costs anything

The detector estimates noise robustly: the median absolute deviation of the
successive differences, which a few level shifts barely move. That takes two
medians, and the trend fits call it on every pass of every candidate bend. So
a median of about 240 numbers ran hundreds of thousands of times, and each one
sorted a copy.

A median does not need a sorted array, only the middle value. Quickselect
finds it in linear time: partition around a pivot, keep only the side that
holds the middle position, repeat. The profile's median time fell from 579 to
156 milliseconds.

## Same value, down to the sign of zero

A speed-up that changes an answer is a bug, so the new median has to return
exactly what the sort returned. Two edges matter. A JavaScript typed-array sort
puts -0 before +0, while selection treats them as equal and can return either;
the fix counts the negative inputs and gives the zero the sign the sort would
have put there. And NaN, which the sort puts last, sends the median back to the
sort. Twenty thousand random arrays built to hit ties, signed zeros and NaN
gave identical results with `Object.is`, which tells -0 from +0.

The same pass folded PELT's pruning into the next step's scan, so the list of
candidate starts is walked once per step instead of twice, with the same
candidates in the same order. In all, 29,966 comparisons of the old engine
against the new one found no difference.

What is left is mostly PELT's arithmetic itself. The next gain is in calling
it less often, which changes the search and needs its own proof. The numbers
are in [the run's notes](https://github.com/duncan-haywood/oss-monorepo/blob/main/docs/history/ci-perf-2026-11-11-median-select-pelt-one-pass.md).
