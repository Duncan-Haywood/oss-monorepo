---
title: "The greenhouse planner was leaving 200 peppers off a bench they fit on"
seo_title: "Greenhouse bench planning: why booking order matters"
date: 2026-11-17
tags: [tools, greenhouse-bench-planner, nursery, scheduling]
description: "Greenhouse Bench Planner grew no peppers on its own example. Trying other booking orders lifts its margin from $3,802 to $4,548."
---

[Greenhouse Bench Planner](https://marisstella.app/greenhouse-bench-planner/) counts back sow dates
from the days you promised to sell transplants. It then checks bench and germination space week by
week. When the spring peak overflows, it holds a crop early or lets a sale slip within limits you set,
and shows what does not fit.

The hub's "See it working" gallery shows a still of this tool, and the last polish run noticed something
in it: the worked example sowed nothing for three of its seven crops. No peppers, no hanging baskets and
no geraniums. Was the bench really that full?

It was not. The planner booked crops one at a time, best margin per square foot-week first, and each
crop took the cheapest slot that fit. Basil and zinnias are cheap to store and high margin, so they
went in early and took the week of 12 April on time. That left peppers with nowhere to stand for their
seven weeks. Selling the basil one week late (the example allows that, at 10% of its margin) would have
made room for both. A booking order that fixed can't find that.

## What changed

If the first pass leaves anything short, the planner now tries three more booking orders: by sale date,
by order margin, and smallest bench footprint first. Then it moves one crop at a time to every other
place in the queue, and keeps a new plan only when it earns more, or earns the same and sells more.
Every plan it tries is a real plan that fits the space, so the result can't be worse than before. The
number of replans is capped and shrinks for long lists: 280 crops still plan in under a tenth of a second.

On the worked example (400 sq ft of bench, 30 sq ft of germination space, seven made-up spring crops):

| | Before | After |
|---|---:|---:|
| Units sold, of 1,870 ordered | 1,534 | 1,723 |
| Margin, of $5,146 if everything fit | $3,802 | $4,548 |
| Crops grown in full | 4 of 7 | 5 of 7 |
| Peppers / baskets / geraniums | 0 / 0 / 0 | 63 / 60 / 60 |

To check how close this gets, I ran every possible booking order, all 5,040 of them. The best is
$4,548.10 and 1,723 units, which is exactly what the new search finds. The old single pass got 84% of
that margin. "Best booking order" is still not a proven optimum, and the page keeps saying so.

Two smaller fixes. The example now plans from 15 January rather than 1 March, because a plan that
books baskets on a sow date a fortnight in the past teaches the wrong thing. Dates in the plan tables
no longer break as "2027-" over "01-30" on a phone, and the result is 600 px shorter at 390 px wide.

The code is in `ventures/greenhouse-bench-planner/calc.mjs` (`plan()`). The new tests pin the example
to the brute-force best and check that a 280-crop list never goes over the bench.
