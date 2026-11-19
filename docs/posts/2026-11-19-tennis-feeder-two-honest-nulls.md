---
title: "Two tennis-feeder ideas that didn't help: a noise-scaled margin and a stricter wheel filter"
seo_title: "Tennis feeder: two ideas the data turned down"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "A standard-error margin bounded fewer instant builds than the fixed 2 ppm, and a stricter take-blind filter tied the shipped one on 66 new drills."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). For every ball it refits the
wheel's speed drop at nine assumed contact times, from 0 to 8 ms, and sums
the misfit over the balls. Today's run tested two ideas for that survey.
Neither changed the firmware. Both answers are still worth having.

## A margin scaled to the survey's own noise

When the survey says "keep TAKE_US = 0", the Pi also says how long a take
the balls can't tell from an instant one: the first candidate whose misfit
is more than 2% and at least 2 ppm above the instant fit. This morning's
sets showed the 2 ppm floor is needed. Without it, three real 2 ms takes
were reported as "at most 1.5 ms". It has a cost, though: on quiet surveys
it loosens the bound on genuinely instant builds.

The natural fix is to scale the margin to the survey's own noise, using a
standard error over the wheels the board kept. We tried three versions
on all nine stored simulation sets (393 builds, 66 of them instant). At the
smallest multiple that still covered every build, they bounded 24, 0 and 41
instant builds at 1.5 ms. The fixed 2 ppm already gets 41.

The reason is plain once the two groups sit side by side. The instant
builds the fixed floor loosens have a 1.5 ms gap of 0.2 to 1.9 ppm. The
real takes it protects have a gap of 0.3 to 1.8 ppm. Their standard errors
overlap just as much, so no margin built from noise separates them. The
idea closed on the design sets, and no held-out data was spent on it.

## The take-blind filter on the new grid

Most balls fit every contact time equally well: their contact falls inside
one wheel revolution, so they carry no information about its length. The
board leaves out a wheel whose worst candidate is within 1.5 times its best.
That 1.5 was chosen on an older seven-point grid and checked with an older
test. The grid now includes a 1.5 ms candidate close to the instant one, so
we checked it again using the Pi's actual advice line.

On the stored sets, a stricter filter (3) looked slightly better: 79 of 180
spread takes named on the jittery tach against 75. We wrote down the rule
first (3 ships only if it names more), then captured two fresh sets: 66
drills on the board's default jittery tach, with seeds no earlier run had
used. With every wheel kept, 22 of 60 takes were named; at 1.5, 30; at 3, 30.
No instant build was told to change its setting. A tie keeps 1.5, which is
now shown to pay on held-out data on the current grid.

The breakdown shows what is left. The filter's whole gain is on 2.4 to
5 ms takes, which went from 4 to 12 of 24. Takes of 1.3 to 2 ms read as
instant at every setting, the same gap the margin couldn't close.

## What's next

Both results point to one open problem: telling a 2 ms take from an
instant one. Summary statistics of the survey don't do it. A per-wheel
count of the balls whose contact must cross a revolution edge might,
and that is the next item.

Everything here is simulated. The numbers, scripts and pre-registered
rules are in the repository: `eval/take-bound-floor-se-2026-11-19.md` and
`eval/take-blind-nine-2026-11-19.md` under `ventures/open-tennis-robots/`.
