---
title: "A four-week memory only pays when you score the closed hours"
seo_title: "Staffing from POS sales: should the forecast use only the last 4 weeks?"
date: 2026-11-11
tags: [shift-roster-builder, scheduling, forecasting, backtest, small-business, pre-registration]
description: "Adding 'the last 4 weeks only' to an automatic staffing forecast changed nothing on three real bakeries, until the score counted a staffed closed hour as waste. Then it cut short plus spare hours by 16%."
---

[Shift Roster Builder](../../ventures/shift-roster-builder/README.md) turns an
hourly till export into shifts. By default it picks how much to favour recent
weeks from the shop's own history: equal weights, or a half-life of 8, 4 or 2
weeks, whichever left the fewest person-hours short or spare when each past
week was planned only from the weeks before it.

Earlier today a new score (`--score-closed`) stopped counting minimum staff as
"needed" in hours the shop normally keeps shut. Under it, a plain
"last 4 weeks only" window beat the plain average clearly on every setting of
the Edinburgh "Bread Basket" file. But that reading was in sample: the window
was scored on the same weeks it was picked on. Giving the automatic picker one
more option also gives it one more way to overfit.

## The test, written down before it ran

`eval/window-auto.mjs` replays the picker week by week: at each tested week it
uses whichever candidate had the least short + over on the weeks before it.
Three real bakeries (French, Korean, Edinburgh), three staffing rates each, a
minimum of 1 or 2 staff: 18 settings per score. The rule, written in the
script before the first run: add the window if, under the **default** score,
it is clearly worse in no setting and lower on average.

| Adding "last 4 weeks" to auto | default score | `--score-closed` |
|---|---|---|
| clearly better / tie / clearly worse | 0 / 18 / 0 | 6 / 12 / 0 |
| mean change in short + spare hours | +0.2% | **-16.3%** |

Under the default score it failed: never clearly worse, never clearly better,
and slightly up on average. So the default is unchanged. Under the closed-hours
score it is a clear win, nearly all from Edinburgh (-47%; at 5 tickets per labor
hour with two minimum staff, 36.1 to 19.4 person-hours off a week). That shop's
late afternoon traded on 12 of 30 November dates and 2 of 31 March ones: its
hours shrank during the file, and a half-life still remembers the old ones long
after a 4-week window has dropped them. Adding "last week only" as well helped
less (-14.9%), so it is not offered.

## What shipped

- With `--score-closed`, `--from-sales` now lets the automatic picker choose
  "the last 4 weeks only", and says so in its note.
- `--last-weeks <n>` sets a window by hand.
- Without `--score-closed`, nothing changes.

The honest caveat: the closed-hours scorer decides which hours are "normally
shut" from the whole file, so on a shop whose hours changed it knows the
future a little. That is the next thing a fourth real file, ideally one whose
opening hours changed, should test, before either the score or the window
becomes the default.
