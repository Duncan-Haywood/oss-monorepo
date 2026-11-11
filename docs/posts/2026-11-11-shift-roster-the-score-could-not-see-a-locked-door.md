---
title: "The backtest could not see a locked door"
seo_title: "Backtesting a staff schedule against closed hours: scoring a lunch closure"
date: 2026-11-11
tags: [scheduling, forecasting, labor, small-business, open-source]
description: "A staffing backtest that counts minimum staff as needed wherever the plan puts someone can never call a staffed closure wasteful. Fixing that reversed one verdict and turned up a planning bug."
---

The free shift roster builder can plan shifts from a till export and then
test that plan on the shop's own past weeks. Each week is planned only
from the weeks before it and compared, hour by hour, with the staff that
week's real sales needed. Hours the plan lacked count as short; staffed
hours beyond the need count as spare.

The scorer had one rule that looked harmless. In any hour the plan staffed,
it counted minimum staff (one person, say) as needed, sales or no sales.
That is right for a quiet hour when the shop is open: someone has to be
behind the counter. It is wrong for an hour the shop is shut. A plan that
kept someone in a locked bakery from 14:00 to 16:00 every day was never
charged for it.

## What that hid

A French bakery's real export (87 tested weeks) has a lunch closure. Earlier
today the planner learned to leave it unstaffed. That saved 9 to 10 scheduled
person-hours a week, but the backtest could not see the saving. It saw only
the cost: the few days that did sell something at 14:00 were now short. By
that score, switching the closure rule off looked 1.0 to 1.9 person-hours a
week *better*.

The new `--score-closed` option counts minimum staff as needed only in an
hour the shop normally trades (on at least 1 in 5 of that weekday's dates,
across the whole file) or one that sold something that day. The plans still
learn only from earlier weeks. The scorer looks at the whole file, which is
fine for a score, and it uses the same hours whatever rules the plan
followed. Scored this way, switching the rules off is 6.4 to 15.1
person-hours a week *worse*, at all six settings tried, with 95% intervals
well clear of zero. On a Korean bakery's file the gap goes from 0.1-1.9 to
6.9-14.1.

## The bug it found

The third real file, from an Edinburgh bakery, turned up something else.
Under the new score the plain plan was 25 to 60 person-hours a week off,
and a plan built from last week alone beat it at every setting, by 14 to 41
hours a week. The plain plan was scheduling up to 54 more hours a week.

The cause was one stray late order. The planner already ignores an edge hour
that sold on fewer than 1 in 20 of a weekday's dates, so a single 23:00
order does not keep the shop open to midnight. But with 20 or fewer dates,
one sale is always at least 1 in 20, so the rule could never trim anything.
This file has 21 to 23 dates per weekday, so in every tested week the rule
was off. One Saturday order at 22:00 kept every Saturday staffed until
midnight.

Now an edge hour that sold on only one date does not stretch the day either,
once a weekday has 4 or more dates. Under the new score, the plain plan's
hours off fell from 55.8 to 44.0 a week, from 60.0 to 35.9 and from 50.2 to
26.1, depending on the setting. It also schedules 14 to 27 fewer hours a
week. On the Korean file the gain is 1.3 to 2.8 hours a week; the French
one barely moves. Under the old score the same fix reads slightly worse, as
it has to: that score counted every staffed hour as needed.

## What is still open

On the Edinburgh file, "last 4 weeks only" now clearly beats every longer
average. The shop stopped opening at 18:00 during the months the file
covers: that hour sold on 12 of 30 November dates and 2 of 31 in March.
A long average keeps paying for the old hours. The automatic weighting does
not try a 4-week window yet, so that is the next thing to test. The new
score stays opt-in until a fourth shop's file agrees.

The tool is MIT licensed and runs in your browser or from a clone:
[Shift Roster Builder](https://marisstella.app/shift-roster-builder/). It is a
planning aid, not legal or labour advice. The measurements are in the
venture's README ("Scoring a staffed closure"), and `eval/closure-score.mjs`
reruns them.
