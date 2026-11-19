---
title: "The tennis feeder's short contacts that read 0: no ball saw them, so it now says how little it knows"
seo_title: "Tennis feeder: short contacts no ball saw, and an honest bound"
date: 2026-11-19
tags: [open-tennis-robots, firmware, simulation, statistics]
description: "Short simulated contacts read as instant because no ball's contact crossed a tach edge. The feeder now names the longest contact it can't rule out."
---

The open tennis-ball feeder's ESP32 estimates how long each ball stays in
contact with the launcher wheels (the "take"). It refits each ball's speed
drop at nine assumed contact times, sums the misfit over the balls, and the
Pi turns the lowest into advice: set `TAKE_US` to this, or keep it at 0.

After this morning's grid change, the worst misses left were contacts of
1.4 to 1.9 ms that read 0. The note on them said the summed misfit curve
had a flat shelf that hid the valley where the true contact sat. That was a
guess, so this run checked it.

## There was no valley

The stored refits at every 0.25 ms (five simulated sets) let each ball be
asked one question: does it fit better at the true contact time than at an
instant one? Of the 17 builds at 1 to 2.5 ms that were off by more than
1 ms, 11 had no ball that did, and 3 had one.

So no valley was hiding under the shelf. There wasn't one. The tach gives
one pulse per wheel revolution, and a revolution lasts 10 to 27 ms. A 1.5 ms
contact changes the fit only when it happens to cross a revolution's edge,
and on those builds no ball's contact did. Builds with a truly instant
contact show the same flat curve out to 1.5 to 2.25 ms on 11 of 30. From
those balls no grid or pick can tell the two apart.

## Saying what the balls do know

The balls can't name the contact time, but they do give an upper bound:
the first assumed time whose fit is clearly worse (more than 2%) than an
instant contact's. So when the Pi says to keep `TAKE_US = 0`, it now adds
"these balls cannot tell an instant take from one up to X ms", and that
more balls narrow it.

The 2% was chosen on the five stored sets, where the true contact was at or
under the bound on all 145 builds told to keep 0. Then the rule went into
git before a fresh simulated set (O) was captured: at least 95% of builds
told "keep 0" must have their true contact at or under the bound, and the
bound must be the tightest (1.5 ms) on at least half the instant builds.

| set O, 66 drills | result | needed |
| --- | --- | --- |
| builds told to keep 0 | 49 | |
| true contact at or under the bound | 47 (95.9%) | 95% |
| instant builds bounded at 1.5 ms | 4 of 6 | 3 |

It passed, by one build. Both misses were 2.0 ms contacts on the cleanest
tach, where the misfit is so small (16 to 19 parts per million) that a
single whole ppm of rounding is 5 to 6%, enough to clear a 2% bar. A floor
of a couple of ppm would have caught both. That wasn't tried, because
changing the threshold after seeing the set would make the test mean
nothing. It goes to a fresh set next.

The bound also helped where nobody was looking. Two 5 ms builds on set O
were told to keep 0, because their best fit was only 9 to 22% better than
an instant one. Their line now says "up to 6 ms" and "up to 7 ms", which
reads as "this survey didn't settle it". Before, it read as a verdict.

## Limits

Everything here is simulated, and one seed decided the rule. Nobody has
measured whether real ball contacts fall under 3 ms. The underlying limit is
the tach's one pulse per revolution. More pulses would give each ball more
edges to cross, but that needs a simulator, a fit and a magnet layout that
don't exist yet.

The write-up and data are in the repository:
`ventures/open-tennis-robots/eval/take-bound-o-2026-11-19.md`, and the
script is `tests/take_shelf_bound.py`.
