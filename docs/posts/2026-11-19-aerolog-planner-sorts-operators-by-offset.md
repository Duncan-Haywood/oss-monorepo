---
title: "The drone layer planner sorts operators by their barometer offset, which is why the 3-sigma rule over-widens"
seo_title: "Drone altitude layers: the planner sorts operators by offset"
date: 2026-11-19
tags: [research, uav, airspace, PX4, barometer]
description: "Recorded plans show neighbouring drone altitude levels get operators with similar barometer offsets: 0.70 of a random assignment's offset difference."
---

`aerolog-scaling` asks how delivery-drone operators sharing a city should be
stacked into altitude layers inside the 120 m (400 ft) column. Earlier today,
step 11ao gave each operator a **barometer speed offset**: a static-pressure
error set by the airframe. Drones of one operator share it, so it cancels
between them. Two operators flying different airframes do not share it, so it
does not cancel between them. The layer planner kept five bands 13.3 m apart
anyway. Step 11ap then found that the textbook spacing rule, "the gap minus
the protected distance must be at least 3 sigma of the altitude error", asks
for one or two bands fewer than the planner actually needs.

11ap's explanation was a guess. It went like this: the planner chooses which
operators sit next to each other, so it can keep the airframes whose offsets
differ most out of neighbouring levels. The searches had not saved their plans,
so the guess could not be checked.

## What this step did

It reran 11ao's planner with exactly the same seeds. Its band counts came out
identical (for 12 operators, 80 draws at 13.33 m and 16 at 17.14 m, as before). This time it saved every plan. The predictions went into the
script's docstring and were pushed before any layout ran. For each plan it
measured the conflict-weighted mean offset difference between operators one
level apart, and compared that with the same plan after the offsets had been
shuffled at random among the operators (200 shuffles).

## What it found

- **The planner sorts.** Between neighbouring levels, the offset difference
  is a median **0.70** of the shuffled value, with 12 operators and with 16.
  It is below the shuffled value in 74 and 84 of 96 layout-draws. The plan
  that never saw the offsets scores 0.91 to 0.94 on the same test (a ratio
  like this sits a little below 1 even with no sorting), so the planner's own
  sorting is worth about a quarter.
- **The worst pairs get split up.** Pairs whose offsets differ by more than
  3 m (in this data, the one airframe at -4.7 m against any other) carry 32%
  of the conflict weight between neighbouring levels under shuffling, but
  only 13% to 16% in the planner's plans.
- **The plan is tied to who has which offset.** Shuffle the offsets after
  planning and the plan's loss-of-separation score rises by a median 4.7% to
  4.8%, and by 1.8 times in the worst draw.
- **One prediction failed.** I expected stronger sorting when the offsets
  were doubled. Overall it was not stronger (0.72 and 0.80). Split by the
  spacing the planner chose, the reason is clear. Where it keeps 13.3 m, the
  sorting is *stronger* (0.37 to 0.49). Where it thins the stack to three
  bands 24 m apart, the planner does the opposite: it puts operators with
  *different* offsets in the same level, in all 107 such draws. With the next
  level out of reach, an offset difference inside one level is extra vertical
  separation. That split was made after the results were read, so it is post
  hoc.

## Why it matters

A spacing rule that takes the whole fleet's offset spread treats every pair of
operators as if they could end up neighbours. A planner that knows each
operator's offset does not let that happen. So the right input for a rule is
the offset difference between the operators it will actually put next to each
other, after sorting them. The next step is to write that rule down and check
it against the search.

All of this is preliminary: one city, offsets from 5 public PX4 flights chosen
by their uploaders, and a conflict model without avoidance. Code, plans and
results are in
[`research/aerolog-scaling`](../../research/aerolog-scaling/README.md)
(`experiments/hub_airspace/arrangement.py`), and the paper draft section is
6.7 of `paper/airspace_layers.md`.
