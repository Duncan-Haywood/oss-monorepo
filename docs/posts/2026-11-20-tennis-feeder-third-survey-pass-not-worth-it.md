---
title: "Tennis feeder: a third pass of the survey drill buys one build in 36"
seo_title: "Tennis feeder: why the survey drill stops at 24 shots"
date: 2026-11-20
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Feeding the calibration shots three times named 27 of 36 simulated short contacts against 26 for two passes, and no more 1.3 ms ones. The survey stops at 24."
---

Earlier today the open tennis-ball feeder gained a recommended longer
survey: the twelve-shot calibration drill fed twice. It named 26 of 36
simulated short ball contacts (1.3-2.1 ms) where the standard drill named
17, with no false alarms
([the earlier post](2026-11-20-tennis-feeder-longer-survey-short-contacts.md)).
That run also started a 36-shot version but stopped before capturing the
builds with an instant contact, the ones that show whether a drill raises
false alarms. Without them it could not be judged.

## The test

This run captured what was missing: 30 more short- and long-contact builds
and the 36 instant-contact builds, on the same seeds and settings as the
24-shot drill. Before capturing, we committed a pass mark. The triple would
be recommended only if it gave no instant build a false alarm and named at
least 30 of 36 short contacts, four more than the 24-shot drill, so that one
lucky build could not carry it.

| | 24 shots | 36 shots |
| --- | --- | --- |
| balls the survey scored | 46 | 70 |
| straddling balls, 1.3-2.1 ms builds | 2.72 | 3.39 |
| 1.3-2.1 ms contacts named | 26 of 36 | 27 of 36 |
| 1.3 ms contacts named | 4 of 12 | 4 of 12 |
| 2.4-2.8 ms contacts named | 24 of 24 | 24 of 24 |
| instant builds told to set a take | 0 of 36 | 0 of 36 |

It raised no false alarms, but it named 27 short contacts, not 30. On the
same builds it found one that the 24-shot drill missed, at 1.6 ms, and lost
none. At 1.3 ms it found nothing new.

## What changed

The pass mark failed, so the README now says to stop at the 24-shot drill.
A third pass costs 12 more balls and raises the survey's own feeding
wait from 294 s to 448 s, for one build in 36. The firmware and the Pi's rules are unchanged.

One more check came free. Two builds reached seven "straddling" balls, the
count at which a vote margin scaled to the count first acts differently
from the fixed margin of two. Both were already read correctly, so it would
have changed nothing.

## What we think is next

Our guess, not yet tested: repeating the same twelve wheel speeds repeats
the same misses. A 1.3 ms contact only shows on a ball whose contact crosses
the edge of a tach revolution, and the same shot speed puts it in the same
place each time. A survey drill with different wheel speeds would test that.

All of this is simulated, with one wheel lag and one tach model. Numbers and
captures: `ventures/open-tennis-robots/eval/take-straddle-triple-2026-11-20.md`.
