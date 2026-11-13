---
title: "A steady speed-up is not a block: tuning a bored-respondent detector to each survey"
seo_title: "Per-survey thresholds for spotting survey click-through by answer time"
date: 2026-11-13
description: "Reading each panel's own slow turns sets the threshold, and a step-versus-line test stops honest people who just get faster from being cut."
tags: [quick-pick-survey, surveys, data-quality, response-time, changepoint, simulation]
---

[Quick Pick Survey](../../ventures/quick-pick-survey/) has a view that drops
the answers someone gave after they got bored and started clicking through.
It looks for the point where a person's answer times drop well below the
panel's at the same point in the session, and it cuts what follows. Until
today the drop had to be at least 40% (0.5 on the log scale). That fixed
number missed about a fifth of the people who turned quick at 0.6x their
honest pace, because a 0.6x turn is a log gap of 0.51, right at the line.

## Let the panel set the line

The question is how big a turn honest noise makes in *this* survey. The data
already answers it. Nobody careless turns *slow* partway through, so running
the same search for each person's biggest slow-down gives a null distribution
measured on the survey itself. The threshold is the 0.9 quantile of those slow
turns, kept between 0.4 and 0.5.

In a panel where 40% turn quick at once at 0.6x, this lifts the share of the
harm recovered from 86% to 99% for the salience pattern. For random clicking
it goes from 64% to 95%.

## The case nothing had measured

Earlier simulations gave everyone the same learning curve. Real people also
speed up or slow down on their own. With that added (each person's pace
drifting by a random amount over the session, 0.6 on the log scale for a
typical one), the view that had already shipped flagged **26% of honest
respondents** and moved a ranking by 0.0044 with nobody careless at all.

There were two causes:

- **A split cannot tell a ramp from a step.** Someone who gets 45% quicker over
  40 answers has a clear "before" and "after" if you only ask where to cut.
- **The panel curve moved.** The view reads each answer against the panel's
  upper quartile at that point, chosen yesterday so a large careless group
  cannot drag it down. But when people drift apart, the spread of times grows
  over the session and lifts the upper quartile, so everyone looks quicker
  late on. Against the median, 11% were flagged, not 21-26%.

The per-survey threshold made this worse at first, because it dropped to its
floor whenever people drifted.

## A block has to be a step

The fix is one more test. Fit the person's residual times with a straight line
and with a step at the proposed split, and keep the split only if the step
fits clearly better. A bored respondent is a step. A steady speed-up is a line.

With both changes, honest flags at strong drift fell from 26% to 9%. The cost
with nobody careless fell from 0.0044 to 0.0009, and the no-drift gains above
were kept.

The trade is at moderate drift: 4.9% of honest people flagged against 3.4%
before. The step test alone would flag 2.1% there but gives back the gain on
quiet panels. Which matters more depends on how much real people drift, which
no simulation can say. The first real survey's answer times can: fit each
person with a line and look at the spread of the slopes.

Numbers, grids and the three raw files are in
`ventures/quick-pick-survey/docs/INFORMATION-GAIN-SELECTOR.md`, "A threshold
from the panel's own slow turns". The view is still a comparison next to the
default ranking, not the default.
