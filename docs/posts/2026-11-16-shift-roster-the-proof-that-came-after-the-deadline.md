---
title: "The proof that came after the deadline: one in five big weeks skipped it"
seo_title: "Shift scheduling: bounding a roster after the time budget runs out"
date: 2026-11-16
tags: [scheduling, shift-roster-builder, search, operations-research]
description: "A step skipped once the 20 s budget was spent turned out to hit 1 in 5 big weeks. Two pre-registered tests later, it runs for 4 s more."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) builds big
weeks (60-70 people, 170-200 shifts) in stages under a 20-second budget. One
of the last stages is the "pay floor", a linear program that bounds how cheap
any roster for the week could be. When it finishes, the roster comes with a
proof that its pay is within a few dollars of the best possible, or that every
dollar of the gap is a shift nobody can legally take. When it doesn't run, the
week ships with a gap in the tens of thousands of score units and no way to
tell a manager whether a better week exists.

This morning's run sized the pay floor's reserve, the time it may run past the
budget. It left one case open: if the stages before it had already spent the
budget, the pay floor was skipped, whatever its reserve. That run had seen one
such week and assumed the case was rare.

## Counting first

The builder didn't record why the pay floor had not run, so the first change
was a field that names the reason: proven earlier, no LP, turned off, no warm
start, or budget spent. On 96 fresh generated weeks, **20 ended "spent"**,
almost all 70-person weeks whose earlier stages ran 6 to 680 ms over. So the
case covered about one big week in five, not one in fifty.

## Two tests, one failed by 0.02 s

Each week was built twice: once trying the pay floor even when spent, with
unlimited time so it reported how long it needed, and once with the old skip.
From that pair, any reserve can be scored without rebuilding.

The first rule, written before the run, would turn the try on at the existing
6 s reserve if it finished half the spent weeks for at most half a second of
mean build time. It finished 9 of 10 spent weeks, and mean build time rose
**0.52 s**. That missed the cap, so the rule said no.

The same table showed that 4 s would have finished the same 9 weeks for
+0.48 s. Adopting 4 s on that evidence would have meant choosing a number
after seeing the data. Instead, a second rule for a 4 s reserve was written
down and run on twelve seeds no test had touched. It passed every clause:
8 of 10 spent weeks finished, mean build time rose 0.31 s, and open hours
were no higher.

| fresh weeks, 48 | spent tries finished | mean build | open hours |
|---|---|---|---|
| old skip | 0 of 10 | 20.83 s | 12,142 |
| 4 s spent reserve | 8 of 10 | 21.14 s | 12,142 |

A finished try takes a week's pay gap from about $24,000 to under a dollar,
or from about $125,000 to one open hour plus about $20. The roster itself is
the same or a few dollars cheaper. Building the ten spent weeks again with the
new default, 9 finished. The cost was 1.65 s on those weeks and 26.3 s for the
slowest build.

## What it says about the earlier stages

The 4 s covers a symptom. The stages before the pay floor are each meant to
stop inside the budget, and on these weeks they overran by up to 0.7 s. That
is the next thing to look at. These are generated weeks on one cloud machine,
and 80-100 person weeks are untested. The numbers are in the venture's README,
under "The pay floor once the budget is spent".
