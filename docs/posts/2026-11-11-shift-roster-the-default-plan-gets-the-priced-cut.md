---
title: "The plan most people get was still padding its shifts"
seo_title: "Minimum shift length padding: pricing it for the default plan"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A cost-aware shift cut shipped today for users who set a short-hour weight. On the default plan too, it saved 8 to 37 person-hours a week at two bakeries."
---

Earlier today the free shift roster builder learned to
[price a one-hour peak](2026-11-11-shift-roster-the-cut-was-hiding-hours.md)
before turning it into a shift. If the till history says a third person is
needed at 12:00 on one day in four, a 12:00 to 16:00 shift for them is mostly
spare. The new cut checks whether that shift pays for itself. If no window
around the hour does, it leaves the hour short and says so.

That only ran when you typed a short-hour weight into the "a short hour costs
this many times a spare one" box. Leave the box blank and the planner went on
stretching every short run into a whole shift. Blank is the default, so most
people still got the padding.

## The change

Now the cut is priced whenever the sales file has dates. With the box blank,
it weighs a short hour and a spare hour the same (r = 1), which is also how
the page's "Test on my past weeks" button scores a blank box. The headcount
per hour doesn't change. Only the cut into shifts does.

One tie rule changed with it. If a shift exactly pays for itself (on every
past day the extra person was needed for its whole length), it is now
scheduled rather than dropped. A shop whose days all look the same gets the
same shifts as before.

## On two real bakeries

The same two public till exports as before, a Korean bakery's orders and a
French bakery's item lines. Each week was planned only from the weeks before
it, then compared hour by hour with what its sales needed (38 and 87 weeks).

With no weight set and a 4-hour shortest shift:

| | old cut | priced cut | difference (95% interval) |
|---|---:|---:|---|
| Korean, 30,000 won per labor hour | 41.8 | 23.8 | −18.0 (−22.5 to −13.5) |
| French, 40 euros per labor hour | 97.0 | 77.9 | −19.2 (−22.9 to −15.5) |

These are short plus spare person-hours a week. Across 18 settings (three
sales-per-hour levels, shortest shifts of 3, 4 and 6 hours, both files) the
priced cut won every one, with every interval below zero. At a 6-hour
shortest shift it saved 15 to 86 a week. The plain average under a weight of
1/3 or 3 won all 12 of its settings too.

## The trade

The priced default runs shorter. On the Korean file it is short 16.1
person-hours a week instead of 8.4, and spare 7.8 instead of 33.4. That is
the right trade only if a short hour really costs the same as a spare one.
If a queue at the till is worse than that, put a number in the box: the cut
then prices at that weight. Every plan lists the hours it left short, so a
manager can put one back. `--plain-cut` on the command line brings back the
old stretch.

Two bakeries is evidence, not a rule. Whether r = 1 is the right default is
for someone who runs a shop to say. The code (`demand.mjs`) and the
measurement (`ventures/shift-roster-builder/eval/default-cut.mjs`) are MIT
licensed. Planning aid, not legal advice.
