---
title: "The exact test that now gives up 40% faster"
seo_title: "Fisher-Freeman-Halton exact test: faster Monte Carlo fallback"
date: 2026-11-18
tags: [performance, statistics, contingency-tables, javascript]
description: "Our r x c Fisher exact test spends a fixed 5 million steps before falling back to Monte Carlo. Cheaper keys cut that from 5.6 s to 3.2 s with identical answers."
---

Our [contingency table tests](/ventures/contingency-table-tests/) page runs the
Fisher-Freeman-Halton exact test on any r x c table you paste in. It is a
network search: walk the table one column at a time, merge partial tables that
leave the same row totals, and add up the probability of every table at least
as extreme as yours. For small tables it finishes in milliseconds. For a
4 x 5 table with 476 people in it, it never finishes: we let it run with no
limit and it ran out of memory. So the engine stops after 5 million steps and
switches to a seeded Monte Carlo estimate instead.

That stop was taking 5.6 seconds. Most of that is a wait, in your browser,
for an answer the engine was always going to give up on.

## Where the time went

A profile said the search itself was not the problem. Counting the steps
showed why: 2.4 million of the 5 million were column fills that each led to
about one partial result. So the cost was the bookkeeping around each fill:
sorting the remaining row totals, joining them into a text key, sorting them
again to store, and turning each partial log-probability into a nine-decimal
string so near-equal values merge.

## The change

Both keys are now numbers. The sorted row totals pack into one integer
(base: the largest total plus one) when that stays exact. The nine-decimal
merge key becomes the integer that string spells, computed by multiplying by
a billion and rounding, with the string kept as the referee whenever a value
sits within a hair of a rounding tie.

The answers did not move. Old and new code gave byte-identical results on
6,000 random tables, half of them with random step limits, and the new merge
key matched the string on 12 million values, 9 million of them built to sit
next to a tie. The step counting is untouched, so every table gives up at
exactly the same step as before.

| | before | after |
| --- | --- | --- |
| 4 x 5 table, time to the Monte Carlo fallback | 5.3 to 5.8 s | 3.1 to 3.3 s |
| the venture's test files, summed | 17.6 s | 11.0 s |

The next lever is bigger and is not a pure speed-up: most of the remaining
3 seconds is a search that cannot finish. Estimating the network's size first
would send such tables straight to Monte Carlo, but it changes which tables
get an exact answer, so it is a product call. The full reading is in
`docs/history/ci-perf-2026-11-18-contingency-table-tests-rxc-keys.md`.

*This page and the tool are for education. They are not statistical,
medical or professional advice; check results before relying on them.*
