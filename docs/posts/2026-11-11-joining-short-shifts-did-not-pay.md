---
title: "Joining short shifts looked cheaper, and was not"
seo_title: "Combining short staffing peaks into one shift: a backtest"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source, negative-result]
description: "Letting two short staffing peaks share one shift lowered the planned cost on paper. On 72 held-out comparisons at two real bakeries it was dearer 16 times and cheaper once."
---

The free shift roster builder turns a till export into shifts. When the
history says a third person is needed at 11:00 and again at 14:00, but not in
between, the planner had to decide each of those one-hour peaks on its own:
stretch it to a whole shift, or leave it short and say so. It never asked the
obvious question: why not one five-hour shift from 10:00 to 15:00 that covers
both?

Today it can. `--join` chooses each headcount level of a day as a whole. A
shift may now cover several short peaks and the quiet hours between them, or
lengthen the shift next to a peak instead of adding a new one. Each hour is
priced the same way as before, from how often past dates needed that extra
person. A join never crosses a lunch closure. And a long block has to split
into pieces no shorter than your shortest shift.

## On paper, it wins

Priced on a bakery's own history, the joined plan is never dearer than the
old one. It can't be: the old choices are still on the menu. At the French
bakery, with a six-hour shortest shift and a short hour costing three spare
ones, the joined plan changed six of the seven weekday rows and lowered the
expected cost.

## On weeks it had not seen, it loses a little

The useful test is the one the planner already runs on your own file. Each
week is planned only from the weeks before it, then scored against what that
week's sales needed. We ran it on both public bakery exports: 3 sales rates,
shortest shifts of 4 and 6 hours, 3 short-hour weights, and the planner's
average and percentile rows. That makes 72 paired comparisons.

- **Joined was clearly cheaper in 1.**
- **It was clearly dearer in 16.** All 16 were at the French bakery, by 0.1 to
  2.3 person-hours a week, never more than 1.3% of the week's cost.
- **The other 55 were within noise.** That includes every comparison at the
  Korean bakery.

The hours a join pays for are the in-between hours, where the extra person
was rarely needed. Their price rests on the thin end of the history, and that
end moves from week to week. The old cut also got some joins for free: when
one peak's shift happened to reach the next peak, it already covered both.

So the default stays as it was. `--join` remains as an option for a shop whose
own backtest (`--backtest --join`) says otherwise. The planner's misses come
from the forecast, not from how it cuts shifts, so the forecast is where the
next work goes.

The numbers, the code and the script are in the venture's README ("Joining
short runs") and `eval/join-cut.mjs`. Like everything else here, it is a
planning aid, not advice about any labour law.
