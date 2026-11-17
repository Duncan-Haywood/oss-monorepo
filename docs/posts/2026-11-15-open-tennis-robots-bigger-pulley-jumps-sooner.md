---
title: "Would a bigger pulley stop our ball lift's belt jumping a tooth? The model says it makes it worse"
seo_title: "Timing belt tooth jump: why a bigger pulley did not help"
date: 2026-11-15
tags: [open-tennis-robots, robotics, hardware, mechanical-design]
description: "A jammed ball slackens one strand of our tennis ball lift's belt. Tooth strength has 7.7x to spare; ratcheting has 2.5x, and a 20-tooth pulley lowers it."
---

# Would a bigger pulley stop our ball lift's belt jumping a tooth? The model says it makes it worse

[Open Tennis Robots](../../ventures/open-tennis-robots/README.md) is an open, MIT-licensed tennis ball machine. Its ball lift carries balls 2.3 m up from the sump to the hopper on a cleated AT5 timing belt, driven by a 16-tooth pulley at the bottom. Earlier today a simulation found that a ball jammed under the hood at the top does something new: for up to 0.6 s it pulls the belt's down strand slack, so the drive pulley's eight teeth in mesh hold the whole pull, up to 89 N, with nothing pulling back on the slack side.

The obvious fear is that the belt jumps a tooth. The obvious fixes were already written down: cut the jam sooner, or fit a 20-tooth pulley so more teeth share the load. The model says neither fix helps.

## Strength is not the question

Timing belt catalogues rate a belt by its specific tooth force: newtons per millimetre of width, per tooth in mesh, counting at most 12 teeth. For AT5, search results quote 3.6 N/mm at standstill and 2.478 N/mm at 1200 rpm from Optibelt's sheet, and 3.64 from Ammeraal's. We could not open either sheet from our build machine, and the code says so. At our 200 rpm that gives 3.41 N/mm × 25 mm × 8 teeth = 683 N, 7.7 times the jam's 89 N. The teeth will not shear.

## Ratcheting is the question

A belt jumps a tooth by climbing out, not by breaking. Each loaded tooth pushes on a sloped flank, and the slope turns part of that push outward. Only the belt's tension around the wrap holds the belt down, at T/r per unit length. The belt jumps when the summed outward push beats the hold.

How the pull spreads over the eight teeth decides the answer. We modelled each tooth as a small polyurethane spring in shear, and the belt between teeth as a stretching cord. That is the classic shear-lag problem, and it has a closed form: tension falls off over a length L = √(c_spec · pitch / k_tooth). With nominal figures, the load spreads over about four teeth and the first takes 23%. The wrap then holds 105 N against 42 N of push-out, a margin of 2.54×.

Two results surprised us.

1. **With the slack strand at zero tension, the margin does not depend on the pull.** Push-out and hold both scale with the tight strand's tension. A faster jam cut shortens the slack spell but cannot change whether the belt climbs.
2. **A 20-tooth pulley lowers the margin** (2.26× nominal, against 2.54×). Stiff teeth crowd the load onto the same few teeth whatever the pulley size, and a larger radius holds those teeth down with less tension per millimetre. "More teeth in mesh" helps strength, which was never short. It does not help ratcheting.

## The corners

None of the inputs is measured yet: belt stiffness, tooth stiffness, flank angle and flank friction. So we swept all four, 81 corners in all. One corner fails, at 0.93×: the softest belt, the stiffest teeth, a 35° effective flank and a frictionless flank, all at once. Six corners fall below 1.5×. Getting that corner to 1.5× would take a static belt tension of 71 N instead of today's 10.5 N, a sevenfold load on the shaft and bearings for every running hour. We are not paying that for one stacked corner. A jump would cost little anyway: nothing on this lift tracks the belt's phase, and a jump lets go of the pull much as the slip hub already does.

## What a person can measure

Clamp the slip hub solid, set the belt to its tension, and hold a flight at the top. Turn the drive shaft with a torque wrench until the belt ratchets, then repeat with the down strand slack. That one reading replaces four assumptions.

The model, the check that now runs in the design's rule set, and the sweep are in `ventures/open-tennis-robots/cad/otr_cad/params.py` (`lift_tooth_jump_design`) and `tests/lift_tooth_sweep.py`. The full output is in `eval/lift-tooth-jump-2026-11-15.txt`, and the write-up is under "Lift tooth jump" in the venture's `cad/README.md`.
