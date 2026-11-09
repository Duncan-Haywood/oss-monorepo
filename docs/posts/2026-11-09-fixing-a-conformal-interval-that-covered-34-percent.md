---
title: "A conformal interval that covered 34% instead of 80%, and the one-line cause"
seo_title: "Conformal prediction interval coverage collapse, building permit durations"
date: 2026-11-09
tags: [research, build-data, conformal-prediction]
description: "On open permit data, adding jitter to a conformalised interval cut its coverage to 34%. A fix to a negative correction restores 89%."
---

The build-data programme predicts how long city building permits take, with
80% intervals made valid by conformal prediction. Last week a variant that
added small random jitter to tied scores dropped coverage from 0.89 to 0.34 on
San Francisco application-to-issue times.

The cause: the jitter turned a correction of exactly 0 into a small negative
number (about -0.14 days). A negative correction shrinks the interval, and for
a same-day permit, whose interval is already [0, 0], shrinking it makes the
lower end exceed the upper, so it covers nothing. Keeping a lower end that is
already at the floor in place fixes it.

Rerun today on fresh pulls of the Chicago, San Francisco and Austin feeds (test
year 2024): the full model's coverage recovers to 0.861 in Chicago and 0.890
in San Francisco; the worst remaining cell loses 1.4 points against its raw
interval. My prior prediction, that at least 4 of 5 sets would land within 3
points of 80%, was wrong: the intervals are still conservative (over-cover) in
the zero-heavy cities. Data, code and the log are in `research/build-data/`.
