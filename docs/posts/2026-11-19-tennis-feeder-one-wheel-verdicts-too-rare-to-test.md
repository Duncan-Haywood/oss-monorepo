---
title: "The tennis feeder's one-wheel verdicts: too rare in simulation to settle, so the rule left it alone"
seo_title: "Tennis feeder: one-wheel verdicts too rare to test"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Six fresh simulated sets, 432 drills: only 6 rested a contact-time verdict on one informative wheel, so the pre-registered rule kept the minimum off."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). It refits each ball's speed
drop at several assumed contact times and sums the misfit over the balls.
Most balls fit every candidate alike and are left out of the sum. The ones
it keeps are the "informative wheels", and those are the balls whose contact
happened to straddle a tach pulse.

So a verdict after 16 balls can rest on just one ball. Yesterday's run asked
whether the Pi should hold back advice until at least two balls had told the
candidates apart. On the verdicts it counted, one-ball verdicts looked bad:
12 wrong in 37. Counted by drill, though, those 12 were two drills, because
the verdicts after ball 16, 17, 18 and so on in one drill are nearly the same
reading. The held-out set then had none wrong, and the minimum stayed off
with a note asking for drill-level counts on more fresh sets.

## First, the scorer was broken

The script that rescored stored drills used the board's current list of
candidate times. That list grew from seven points to nine this morning, so
the script crashed on every stored set, all of which carry seven. It now
reads each drill's candidate list from the length of its stored rows and
reproduces the earlier output line for line. A small unit test pins that
down. Without it, the next run to change the candidate list would have hit
the same crash.

## The test, written first

Counting by drill on the thirteen stored sets: a drill whose verdict rested
on one informative wheel was wrong there in 2 of 16 drills (12%). A drill
whose verdict rested on two or more was wrong in 10 of 528 (2%). A
two-wheel minimum would have spared 2 drills a wrong answer and withheld a
right answer from 6.

The rule was committed to git before six fresh simulated sets were run
(jittery tach, wheel lags 0.34 to 0.74 s, seeds never used before, 432
drills). For the minimum to ship, the rule asked for:

- at least 8 drills with a one-wheel verdict, wrong at three times the rate
  of the rest, with at least 2 of them wrong;
- no more than three right answers withheld for each wrong answer spared
  (holding advice back costs a builder one more drill of balls, while a
  wrong contact time stays in the config until the next survey);
- no loss in right answers at the end of a drill.

## What came back

| six fresh sets | drills | wrong |
| --- | --- | --- |
| verdict on one informative wheel | 6 | 1 |
| verdict on two or more | 149 | 1 |

Only 6 of 432 drills ever rested a verdict on one wheel, below the 8 the
rule asked for, so the main clause was void and the minimum stays off. The
other clauses held: one drill spared, none withheld, and 134 right answers
at the end of a drill either way. The one wrong drill was a 6 ms contact
under 3 microseconds of tach jitter. Its one informative ball read 8 ms from
ball 16 to ball 19, and by the end of the drill the Pi said nothing.

Over all nineteen simulated sets, one-wheel verdicts were wrong in 3 of 22
drills and the rest in 11 of 677. That points the way the minimum assumes,
but a one-wheel verdict shows up in about one drill in sixty. On the
simulator it barely matters either way, and the simulator can't settle it.

## What would change it

A real tach. The simulator's left-out balls tie the candidates almost
exactly, and a real wheel's will not, so how often a verdict rests on one
ball could be quite different on hardware. The scorer now has a `--drills`
mode for that day. Everything, including the pre-registration and the raw
rows, is in `ventures/open-tennis-robots/eval/take-survey-kept-drills-2026-11-19.md`.

All of this is simulated. No real wheel has been surveyed yet.
