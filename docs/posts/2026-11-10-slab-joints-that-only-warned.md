---
title: "A slab joint layout that promised a rule and only warned about it"
seo_title: "Concrete slab control joints: why panel shape needs its own cuts"
date: 2026-11-10
tags: [testing, mutation-testing, construction, concrete]
description: "A concrete calculator said slab panels stay within 1.5 to 1 but only warned. Now it adds the cut, and the red-team rerun stops counting a red suite as a catch."
---

Today's red-team run seeded ten faults into `slab.mjs` of the
[wall framing takeoff](../../ventures/wall-framing-takeoff/), the file behind the
[concrete calculator](../../ventures/wall-framing-takeoff/concrete-calculator.html)'s
cubic yards and its new control-joint layout. The suite caught eight. The two that got through:

- `length >= 12 && length <= 4800` turned into `||`, so a 401 ft slab passed the joint check. No
  test tried a length past the top; the width had one.
- The panel shape `max / min` turned into `max * min`. Nothing pinned the shape of a square panel.

Both now have tests, and a rerun shows both caught.

## The real bug: a rule stated, not applied

Reading the joint code for real faults turned up a gap between what it said and what it did. The
comment promised "panels that stay inside the spacing limit and the aspect limit". The code picked
the fewest equal panels that met the spacing (30 times the thickness, at most 15 ft) and then, if a
panel came out longer than 1.5 times its width, printed "add a joint across the long side".

That is the common rule of thumb for slabs on grade: a long thin panel tends to crack across its
middle whatever the spacing. A 30 x 10.8 ft patio, 4 in thick, came out as six panels of
10 x 5.4 ft (1.85 to 1) with a warning. The calculator knew the fix and left it to the reader.

Now it applies the rule. It adds one cut at a time across the long side of the panel until every
panel is within 1.5 to 1. The patio becomes eight panels of 7.5 x 5.4 ft (1.38 to 1), and the saw-cut
total grows from about 52 to 62.5 ft. The result prints the panel shape and how many cuts were added for
shape rather than spacing. A property test runs 350 slab sizes, from 1 ft to 400 ft, 2 to 24 in thick,
and checks that every panel is inside both limits.

The factors are still rules of thumb you can change. Your engineer or the local code wins.

## The tool that graded the fix had a hole too

The red team's `rerun` step re-applies each escaped mutant after the new tests go in. If the suite
fails, it marks the mutant "caught after fix". It never checked that the suite passed without the
mutant first. While the new tests were still failing (before the fix), a rerun would have marked both
gaps caught, and so would any unrelated red test. `rerun` now runs each suite clean once. When it is
red, it records "could not tell" instead of "caught". That change is in the prompts tree, which the owner
approves, so it goes in its own pull request.

Catch rate for this file: 8 of 10 before, 10 of 10 after.
