---
title: "Yesterday's 'locked' cloth element was a solver that never arrived"
seo_title: "Cloth FEM drape test: continuation fixes the solve; fold branches stay"
date: 2026-11-13
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "Raised in stretch stiffness from a soft solution, a triangle cloth element converges on all 40 drape cases and passes the mesh test on a jersey."
---

Yesterday's step in the [`hanger-codesign`](../../research/hanger-codesign/)
programme [built a triangle finite-element cloth model and watched it fail a
simulated drape test](2026-11-12-hanger-triangle-element-locks.md). On a soft
cotton jersey, the drape coefficient kept moving as the mesh got finer and as
the stretch stiffness went up. The obvious reading was membrane locking, a
known flaw of constant-strain triangles. But 9 of the 32 solves had hit the
Newton solver's step cap. Their residuals were 8 to 10,000 times a node's
weight, so those numbers weren't equilibria. We couldn't tell locking from a
solver that never got there.

Today's step changed one thing: the path. Each case starts from the soft
(150 N/m) equilibrium, and the stretch stiffness is raised in stages, each
stage starting from the one before. The stages run through each fabric's own
stiffness, taken from its KES-FB tensile data (254 and 369 N/m for the
jersey, 1,341 and 1,896 N/m for the suiting). We committed seven predictions
before the run.

- **Every case converged.** All 40 stages reached equilibrium, most in 14 to
  50 Newton steps. The cold starts had needed hundreds, and nine had failed.
- **At its own stiffness, the jersey passes.** Going from a 3.75 mm to a
  2.5 mm mesh moves its drape coefficient by 0.008 to 0.011. Raising the
  stiffness from 150 to 369 N/m moves it by 0.003. The bar was 0.03 on both.
  Coarse meshes do still lock at 3200 N/m (0.35 at 7.5 mm, 0.18 at 2.5 mm),
  but the jersey isn't that stiff.
- **The suiting misses by a fold.** At its own stiffness, the same mesh step
  moves it by 0.034 and 0.036, just over the bar. That isn't a drift: the
  drape goes from 6 folds to 7.
- **One case, several answers.** In 4 of the 19 cases where both the cold and
  the continued solve converged, the two disagree by 0.03 or more, and by as
  much as 0.32. Same cloth, same mesh: one solve settled into a few big folds,
  the other into many small ones. We had predicted they would agree.

So the element's real limitation isn't locking at the stiffness these
fabrics actually have. It's that the static problem has more than one
answer, and statics alone can't say which one a real drape test lands on.
Calibrating the simulator against a
measured drape will therefore need the measured fold count as well as the
drape coefficient. The next step compares the branches' energies and runs
several seeds per case, to get the fold-count distribution a lab would
report.

This is simulation only. It uses one start and one seed, and the
stiffnesses are tangents at a garment's shoulder load, not at the drape
specimen's own load. Numbers, code and the pre-registered predictions are in
[`experiments/m3b_continuation/`](../../research/hanger-codesign/experiments/m3b_continuation/)
and the programme's [research log](../../research/hanger-codesign/LOG.md).
