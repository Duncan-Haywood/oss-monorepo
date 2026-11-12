---
title: "A cheap cloth model's error matters only where it varies, and ours varies too much to trust its hanger"
seo_title: "When can a cheap simulator pick the design? A margin bound for cloth"
date: 2026-11-12
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, multi-fidelity]
description: "A cheap simulator's regret is bounded by how much its error varies across designs, not its size. On 50 hanger tier pairs it certifies no 2D choice."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme asks how
good a cloth simulator must be before the hanger it designs for a laundry
robot is the right one. Earlier steps scored the same arm widths on several
"tiers": a fast 2D chain, a 3D spring sheet, the sheet stopped early, the
sheet on another mesh, and the sheet with guessed or measured fabric
stiffness. This step asks when a cheap tier's choice can be *certified*
without running the expensive one everywhere.

**The bound.** Write e(d) for the expensive tier's score minus the cheap
tier's at design d. The cheap choice's regret on the expensive tier is at most
e at the cheap choice minus e at the true best, so at most the *spread* of e
across designs. A cheap model that is wrong by the same amount everywhere
costs nothing. If the cheap tier's own winning margin beats that spread, its
choice is certified. A sharper "cone" version uses how fast e changes per
centimetre of arm width.

**The test.** The 50 tier pairs already on disk from milestones 1b to 1d
needed no new simulation, and the predictions were committed first:

- The 2D chain is off by up to 1.6 to 2.0 cm of shape error in every
  instance. The bound charges only its spread across widths, which is a
  third of that. That is still 0.6 to 1.3 cm, against the chain's own margins
  of 0.05 to 0.25 cm. So **no 2D choice is certified** in any of the 28
  pairs, by either version of the bound.
- Yet the 2D choice is rarely bad. Its regret on the 3D sheet averages
  0.03 cm and peaks at 0.20 cm (7.6%) on very stretchy cloth. The bound is
  loose because it ignores how sharply the 2D curve penalises the 3D sheet's
  favourite width.
- Certification works only between near-identical models. A stretch
  stiffness guess of 3200 N/m against the value sourced from KES data is
  certified on 2 or 3 of 4 fabrics. Nothing else is certified.
- Three expensive runs around the cheap choice estimate the slope of e to
  within a factor of two in 45 of 50 pairs. So a design loop can tell
  cheaply which regime it is in.

**What it means.** For a multi-fidelity design loop (the programme's next
milestone), the cheap tier is a screen, not a judge. Under the cone, it rules
out a median of 3 of the 7 widths, and the expensive tier has to score the
rest. The reference tier here is still our own converged sheet rather than a
validated solver, so this measures how the bound behaves, not how accurate
the cloth is. Full tables: the project
[README](../../research/hanger-codesign/README.md), "Milestone 5".

*Simulation only; produced with AI assistance.*
