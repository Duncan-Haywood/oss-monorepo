---
title: "No real drone has the helpful sign: a canted rotor's side force hurts one axis and helps the other"
date: 2026-11-12
tags: [codesign-cant, quadrotor, co-design, position-hold, research]
description: "In simulation, a rigid canted-rotor quadrotor holds position 2–3× worse on one axis after a wind step, whichever side its centre of pressure is on."
seo_title: "Canted rotors and centre of pressure: why one axis loses position hold"
---

This morning's run of the [`codesign-cant`](https://marisstella.app/research/codesign-cant/) programme ended on a loose end (see the [earlier post](2026-11-12-which-way-the-wind-leans-decides-the-side-force.md)). A canted rotor's side force either cost nothing or cost 21% of position-hold accuracy, depending on the sign of the gust's twisting torque. The open question was which sign a real frame has.

It has neither. Wind drag acting at a centre of pressure a height h above the centre of mass makes a torque r × F = (−h F_y, h F_x, 0). The roll and pitch torques have *opposite* signs. The simulator we inherited gave them the same sign. The morning's flipped version did too. Both are physically impossible for a rigid body: each puts the centre of pressure below the centre of mass on one axis and above it on the other. A two-line test against `np.cross` now pins this down.

The canted rotors add a second twist. Their side force maps roll torque to a sideways push along y, and pitch torque to a push along x, with the same sign. That map is a mirror image, not a rotation, because the cant pattern is chiral. Put the two together, and the attitude loop's steady counter-torque makes a side force that fights the wind on one horizontal axis and adds to it on the other. That holds whichever side the centre of pressure is on. Moving the battery up or down only changes *which* axis is hurt.

We then retrained the co-design (arm, propeller, cant and nine controller gains, CMA-ES, 6 seeds) under both rigid geometries. The predictions were committed before the run. Each design was scored on 64 held-out gusty episodes (simulated; numbers in `experiments/m6b_cop/results.txt`):

- **The hurt axis holds position 1.9× to 3.4× worse** than the other axis in the 3 seconds after a 3 m/s wind step. Without cant the two axes match.
- **Averaged over both axes, the typical design barely notices it:** median 1.03× position error with the side force on against off. The mean is 1.14× and 1.26×. One seed in six diverged on 1 or 2 of 64 episodes, so the risk is a rare failure, not a steady loss.
- **Without the gust torque there is no cost at all** (1.00×, 12 of 12 designs). Every bit of the side force's penalty runs through the counter-torque.
- **Cant still pays.** Yaw error falls 5.1° and 7.7° (6 of 6 seeds), and the overall score improves in 5 and 6 of 6 seeds. The co-designed cant settles at 31–33°.

Six of the seven predictions held. The one that failed (mean cost under 20% in both geometries) failed on one seed's diverging episodes.

For a frame designer, the practical point is about where the centre of pressure goes. Raising or lowering it relative to the centre of mass does not make a canted quad's position hold symmetric. One axis will be worse, and only a smaller lever (or less cant) shrinks that. The cleaner fix probably sits in software. The mixer knows exactly how much side force each torque command makes, so a feed-forward could cancel it. That is the next step, along with a measured centre-of-pressure height for a real frame. The lever used here is an inherited assumption, swept from zero to twice its value. The translation model is inherited too, and nothing has flown.
