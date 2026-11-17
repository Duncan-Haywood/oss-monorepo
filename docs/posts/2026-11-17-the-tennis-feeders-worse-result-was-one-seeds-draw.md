---
title: "The tennis feeder's worse result on a jittery tach was one seed's draw"
seo_title: "A jittery tach result that six simulator seeds undid"
date: 2026-11-17
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "One held-out seed made a firmware setting look worse on a jittery tach. Six seeds, 3,888 wheels and a check of each wheel's fit showed it was chance."
---

Earlier today the open tennis-ball feeder got an opt-in firmware setting,
`LOOP_THROUGH_CHANGE`
([the post](2026-11-17-the-tennis-feeders-wait-for-slow-wheels-made-shots-late.md)).
After a slow shot the board keeps fitting the slow wheel's recovery while the
next shot's speeds come in. Without it, the Raspberry Pi has to wait, and the
wait made the next shot up to 1.7 s late. On the simulator the setting removed
the delay, and on two of three plants it made the launcher fit better.

The third plant is a tachometer with 3 microseconds of timing jitter on every
pulse. That one looked worse: 8 of 324 wheels read their drop more than 2% off
with the setting, against 3 without, and one build's spin error went from
1.26% to 2.16%. The open question was why.

## Three ways to explain it

1. **The speed change itself.** The fit now runs on revolutions from the next
   shot's speed-up as well as the ball's. If jitter on those pulses biases the
   drop, the misses should sit on the wheels whose fit went through a change,
   and should stay there on other seeds.
2. **A buffer running out.** Reading the firmware turned up a plausible bug.
   Each tach keeps its last 128 revolution periods. A snapshot taken through a
   speed-up could outrun that buffer, losing the ball's own revolutions while
   the command log still counts from the stroke's first pulse.
3. **Chance.** With the setting on, the Pi sends the next speeds sooner. That
   moves the timing of the whole drill, so every later pulse draws a different
   jitter sample from the simulator's random stream.

## What the run showed

The buffer went first. On the worst build the longest snapshot held 103
periods, in both modes, so nothing was cut.

Next, a new script (`tests/through_jitter_cause.py`) labelled every launched
wheel by how its fit was made. It ran the same six held-out builds on six
seeds, with and without the setting: 72 drills, 3,888 wheels, none aborted.
Here is how many wheels were more than 2% off, without / with the setting:

| seed | 7 (the held-out one) | 8 | 9 | 10 | 11 | 12 | all |
| --- | --- | --- | --- | --- | --- | --- | --- |
| wheels > 2% off | 3 / 8 | 7 / 7 | 5 / 5 | 5 / 8 | 8 / 4 | 7 / 6 | 35 / 38 |

Seed 7, the held-out seed, gave the setting its worst draw of the six. Seed 11
went the other way. Comparing the same wheel on the same seed and build, the
setting's error was 0.02 points *smaller* on average over 1,944 pairs.

The misses do cluster, but on a class of wheel the setting doesn't touch. It
is the fast wheel of a slow shot. A heavy topspin shot runs one wheel near 600
rpm and the other near 5,000. On the jittery tach that fast wheel's drop
scatters with a standard deviation of 1.0%, with the setting on or off, and
about one in twenty lands past 2%. The wheels of a fast flat shot scatter by
0.6%. The slow wheels, the ones the setting exists for, had 0 of 360 past 2%
in either mode.

## What changes

The firmware stays as it is. The setting stays off by default, but for its
original reason: nobody has yet checked that a real wheel follows its
commands across a five-fold speed change. Jitter is no longer a reason. The
noise worth working on is the slow shot's fast wheel, whatever the setting.
The next run will check whether the board's "unsure" flag already marks those
wheels, and whether the Pi's launcher fit should give them less weight.

The lesson is the usual one, and easy to forget: a held-out set with a single
random seed can hold out only one draw of the noise. When the effect being
judged is the size of that noise, run more seeds before looking for a cause.

All of this is simulated, and the jitter is the simulator's Gaussian 3 us per
pulse. The numbers and the per-wheel rows are in the venture's
`eval/through-jitter-cause-2026-11-17.txt` and the `.jsonl` beside it, and
the write-up is in `firmware/esp32/README.md`, "The jittery tach through a
speed change".
