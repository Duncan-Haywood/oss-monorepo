---
title: "A lake that swings back: Lake Erie's 14-hour seiche, and why low water at dawn is not an all-clear"
seo_title: "Lake Erie seiche: why the water comes back about 14 hours later"
date: 2026-11-10
tags: [fiction, hearth-and-horizon, lake-erie, seiche, storm-surge, physics]
description: "A new story turns on Lake Erie's seiche: wind set-up of about 1.9 m, a return swing about 14 hours later, and a second front that lands on it."
---

[The Lake Comes Back at Noon](../../ventures/hearth-and-horizon/stories/the-lake-comes-back-at-noon.md)
is the newest story on the **Hearth & Horizon** shelf, hopeful science
fiction written by an AI (Claude). It is set in 2049 in an invented village
on the Lake Erie shore south of Buffalo. The people, the village, the storm
and every gauge reading are invented. The physics it turns on is real, and
you can work it out on the back of an envelope, so here it is on its own.

## Wind set-up: a gale tilts the lake

A southwest gale on Lake Erie blows along the lake's long axis, from Toledo
to Buffalo. Wind drags on the water surface, and over a long, shallow lake
that small drag tilts the whole surface. The steady-state estimate is

    set-up (end to end) ≈ wind stress × length / (water density × g × depth)

with wind stress = air density × drag coefficient × wind speed². For the
story's gale:

- stress = 1.25 kg/m³ × 0.002 × (27 m/s)² = 1.82 Pa
- set-up = 1.82 × 388,000 m / (1,000 × 9.81 × 19 m) = **3.8 m end to end**,
  so about 1.9 m above still water at the Buffalo end.

At 20 m/s, with a drag coefficient of 0.0016, the same sum gives about
1.7 m end to end, 0.8 m at one end. The drag coefficient for strong winds over
water is uncertain, and real set-up depends on the real depths and
shoreline, which is why real forecasts use a hydrodynamic lake model. The
envelope is a sanity check, not a forecast.

## The seiche: the water goes back, and comes back

When the wind stops, the piled-up water does not settle. It runs back
toward the other end, overshoots, and returns: the lake sloshes like tea in
a cup that has been carried too fast. This is a seiche.

The textbook period for a flat-bottomed basin is Merian's formula, twice the
length over the speed of a long wave, sqrt(g × depth):

- wave speed in 19 m of water = sqrt(9.81 × 19) = 13.7 m/s
- period = 2 × 388,000 / 13.7 = **15.8 hours**

Lake Erie's observed fundamental seiche period is about **14 hours**: shorter,
because the lake is not flat-bottomed (a shallow western basin, a deeper
eastern one). In the story the harbour's assistant gives the textbook number
first and then corrects itself, because a 1.8-hour error in the return time
would have moved the dangerous hour.

So at the Buffalo end, a peak at 22:00 is followed by low water about seven
hours later (in the story, the harbour drains to mud at dawn) and by a
second high about fourteen hours later, at noon. Each swing is smaller than
the last; the story uses an invented six tenths per cycle.

## The trap: a rule that reads the level, not the swing

The invented village's flood procedure says residents may go home when the
harbour reads below +0.5 m for an hour and the wind has been calm for three.
At 04:00 the board reads about a metre and a half *below* still water and
the rule says go. But the lake is low because it is halfway through a swing,
not because the danger is over. That is the story's
"number that is not the thing it measures".

On its own the return swing (about 1.1 m) stays below the lowest doorstep
(1.5 m). The problem is a second, weaker front due between 11:00 and
15:00. The story's crude sum adds a 1.1 m cosine swing peaking at noon to a
0.8 m wind push:

| Push peaks at | Swing | Sum |
|---|---|---|
| 12:00 | 1.10 m | 1.90 m |
| 13:00 | 0.99 m | 1.79 m |
| 14:00 | 0.69 m | 1.49 m |
| 15:00 | 0.24 m | 1.04 m |

The lane floods if the push peaks within about 1 hour 58 minutes of noon,
which covers about three quarters of the forecast window. Real set-up and
seiche interact rather than simply adding, and the story says so; the point
of the sum is to show why the second, weaker storm can be as bad as the
first.

## What the people do about it

The obvious answer, keep everyone out until the window passes, gets a "no"
from the fire chief, and he is right: twenty-two tired people, a boy on his
last insulin pen, and a village that stops believing warnings after a few
false alarms. The answer the harbourmaster finds is to use the swing
instead of fighting it: send people home *in the trough*, when the lane is
safer than on any ordinary day, to carry what they can upstairs, and bring
them back up the hill before the earliest the front can arrive.

The story is fiction, and nothing in it is a flood forecast or safety
advice. For a real lake flood, follow your local authorities' warnings.
Text only for now (the shelf's audio budget is full); it is CC BY-SA 4.0,
like every story on the shelf.
