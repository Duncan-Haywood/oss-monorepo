---
title: "A cleaner count that bought nothing: the order-free call-out check, played"
seo_title: "Order-independent call-out check for shift rosters: played results"
date: 2026-11-15
tags: [scheduling, shift-roster-builder, simulation, operations-research]
description: "A risk count that doesn't depend on search order made rosters that opened no fewer hours when simulated call-outs hit them, and moved more people."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) can charge a
roster for *pairs* of call-outs that could each be covered alone but not both
together (`--second-callout-price`). Earlier today a run found that the
check behind that price gave different counts depending on the order its
search handed out shifts: 313 to 355 clashing pair hours on one 40-person
week, 179 or 187 on a 20-person week. It rebuilt the check as a question
about the final covered roster (`--second-callout-order-free`), and the count
stopped moving: 99 hours and 148 hours in every order.

A count that is a fact about the roster is nicer. The question that matters to
a manager is narrower, though. **Does a roster priced on the cleaner count
leave fewer shifts uncovered when people actually call out?**

**How I tested it.** I used the same generated weeks of 20, 30 and 40 people
as the last played study. From each week's plain roster I ran three passes:
the $25-an-hour slack price alone, that plus $1 per clashing pair hour with the
default check, and the same with the order-free check. Then I played every
roster through the same simulated weeks of call-outs: 200 weeks for the
20-person team and about 100 for the others. Each call-out is announced at 5pm
the day before, and the product reissues the week, keeping everyone else's
shifts where it can. The call-out rates, 1.0% (sick only) and 8.4% (all leave),
come from a real roster export.

On 11 of the 15 weeks no pass moved anyone, and on a 12th both pair checks made
the same move. On the three where the order-free pass built its own roster:

| team, call-out rate | open hours added: default check → order-free | weeks better / worse |
|---|---|---|
| 20 people, 1.0% | 216 → 218 | 2 / 2 |
| 20 people, 8.4% | 2,610 → 2,614 | 37 / 43 |
| 30 people, 1.0% | 176 → 201 | 3 / 6 |
| 40 people, 1.0% | 396 → 392 | 1 / 0 |
| 40 people, 8.4% | 2,765 → 2,731 | 11 / 6 |

None of these differences gets anywhere near significance: the smallest
sign-test p-value is 0.33. The order-free rosters also moved more people when
reissued in all five comparisons, and owed more late-change premium in four.
They cost more to build too: $35.70 of score against $25.85 on the 20-person
week, and $17.91 against $10.15 on the 40-person week. On the 30-person week the
order-free pass took 1,295 seconds against 298. It also made two moves that
*raised* single-call-out risk to buy pair hours, and the result opened exactly
what the plain roster did.

**So the default stays the default.** `--second-callout-order-free` stays as
an opt-in for anyone who wants a count that doesn't depend on search order. I
also crossed off a planned follow-up, a faster screen for the order-free check:
speeding up a pass that doesn't pay for itself when played isn't worth a run.

The lesson I keep relearning on this product: a yardstick that looks better
on paper still has to be played against the thing it's meant to predict. The
details, including every run's output, are in the README section
"The order-free pass played" and in `eval/pair-order-free-played.out.txt`.
These are invented teams and seeded weeks, three rosters and not a population,
each a single run on one cloud machine.
