---
title: "Start the second LP where the first one ended: a warm start that cuts the pay floor's pivots up to sixteenfold"
seo_title: "Warm-starting a priced scheduling LP from the coverage LP's basis"
date: 2026-11-14
tags: [scheduling, shift-roster-builder, linear-programming, operations-research]
description: "The roster builder's pay floor solved its LP from scratch after a sibling LP on the same rows. Starting from that basis: same bound, 107 pivots, not 1,860."
---

The [Shift Roster Builder](../../ventures/shift-roster-builder/) proves how
close a roster is to the best one possible. On big weeks it does that with two
linear programmes solved back to back. The first counts the least number of
open hours any roster can leave. The second, the "pay floor", puts a price on
every person-shift and bounds the whole score, so the page can say "at most
$30 left on a $19,000 bill" and not "somewhere under $20,000".

The two LPs share almost everything: the same person-shift columns in the same
order, the same rows for shift cover, weekly hours, daily caps and rest gaps.
The pay floor adds two rows per person (to price fairness as a convex function
of their weekly hours) and the columns that go with them. Yet the second solve
started from nothing: every shift open, the simplex working its way back to a
covering roster that the first LP had just found.

**The fix is to start where the first one ended.** Take the open-hours LP's
optimal basis, renumber it into the priced LP, and for each person add the two
hour levels around the hours they hold in that optimum. Order the rows old then
new and the basis matrix is block lower triangular, so it is invertible; every
value in it is between 0 and 1, so it is feasible. The simplex then only has to
reprice a roster the LP already likes.

| priced LP | cold pivots | warm pivots |
|---|---|---|
| 60 people, week 0 | 3,655 | 2,281 |
| 60 people, week 1 | 1,860 | **107** |
| 80 people, week 0 | 6,711 | 4,017 |
| 80 people, week 1 | 3,896 | **232** |
| 80 people, week 2 | 5,337 | **353** |

Same bound to the cent on every week, and on 60 smaller seeded weeks in the
test suite. On three of the five big weeks the solve drops from seconds to
under one. On the other two it saves a quarter to a third, because there the
cheapest roster in pay is a long way from the one the coverage LP happened to
pick.

**What did not work.** Charging the coverage LP a millionth of the pay, so its
optimum would land nearer the priced one, did cut the slow weeks' pivots. It
also weakened the coverage bound from 300 hours to as low as 294, and that
bound is what proves the open hours least. Dropped.

**What it changes for a manager.** Under the default 20-second budget the pay
floor used to be skipped whenever a cold solve looked too slow. It now tries a
warm solve anyway, and stops at the budget's end if it has not finished. On ten
generated 60-person weeks that let it run on three more weeks, done in about
two seconds each. That is honest but small: on those weeks some open hours
are still unproven, and the open hours, not the pay, are most of what's left
of the gap. The real gain is that the pay floor now often costs a tenth of
what it did, which leaves more of the budget for the search.

The numbers, the code and the test are in the
[README section](../../ventures/shift-roster-builder/README.md) ("The pay floor
from the open-hours LP's basis") and `eval/warm-score-floor.out.txt`.
