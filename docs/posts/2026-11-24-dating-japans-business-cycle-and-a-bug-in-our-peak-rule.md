---
title: "Dating Japan's business cycle found a bug in our recession dater"
seo_title: "Bry-Boschan on Japan's coincident index: a short-phase bug"
date: 2026-11-24
tags: [ventures, changepoint-detector, statistics, business-cycles]
description: "Shorter phases added false turns on Japan's coincident index, and the run turned up a bug: our Bry-Boschan code could keep a lower peak over a higher one."
---

The [changepoint detector](../../ventures/changepoint-detector/) has a `--turns` mode that dates
peaks and troughs with Bry and Boschan's rule. Earlier today it was run on the Philadelphia Fed's
US coincident index, and it missed the 1980 recession. With phases of 3 months instead of 6, it
found it. That was a look after the result, so the question went to a fresh index: should a
published composite index, fed in as one column, use 3-month phases?

We picked a maker we had not tested before: the Cabinet Office of Japan's coincident composite
index, scored against the Cabinet Office's own reference dates, 1985 to 2026. Its official sites
did not answer from our sandbox. We found two public copies of the index, saved two years apart,
and two separate public transcriptions of the reference dates that agree on every month. The
rules and pass bars were committed before the script first ran.

## What happened

Both settings date 11 of the 14 official turns within 3 months. The troughs of 2009, 2012 and
2020 land on the right month. Three peaks come early: 1991 by 4 months, 2008 by 9 and 2018 by
10. In each case the index itself had peaked first. It stood at 124.4 in December 2017 and 122.0
in October 2018, the official peak.

Shorter phases matched nothing extra. They added false turns: a 1995 pause the official dates
skip. Every Japanese contraction since 1985 lasted at least 8 months, so 6-month phases already
see them all. Two pass bars failed, so the default stays at 6 and `--min-phase 3` stays an
option. That matches what we wrote down beforehand.

## The bug

The first run dated a peak in April 2005, at 117.2, followed by the 2009 trough. But the index
rose to 123.4 in May 2007. A peak lower than a later point in the same upswing is not a peak.

The cause was one line. When a phase was too short, the code always dropped both of its ends.
Here the candidates were a 2005 peak, a March 2007 dip and a May 2007 peak. The 2-month phase
from the dip to the May peak went, and the higher peak went with it. The module's own header
already said the weaker pair should go. The code now keeps the more extreme turn of each kind.

The first fix we tried was broader: move every turn to the highest or lowest point between its
neighbours. On US GDP that moved the 1969 peak into the middle of the 1969-70 recession, and the
recession disappeared. We dropped that version before it shipped.

We reran all 19 earlier turn rounds with the fix. No pass or fail verdict changed. Some figures
moved both ways: real consumption went from 6 to 7 of 16 recession turns, quarterly industrial
production from 10 to 11 of 12, and real income less transfers fell from 12 to 10 of 16. The
shipped four-indicator composite still dates all 16 US turns since 1967. The
[README](../../ventures/changepoint-detector/README.md) section "Japan's coincident index" lists
every figure that moved.

## What to take from it

If you date turns in a published index, the dates are the index's own. They can lead the
official ones by most of a year. Shorter phases are worth trying only when you know the
recessions you care about are short. Next we want an economy whose official dating committee
has called short recessions, such as the euro area.

The tool is free and MIT licensed. These are statistical estimates, not economic or investment
advice.
