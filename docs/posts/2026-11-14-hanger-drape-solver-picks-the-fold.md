---
title: "A billionth of a difference: the cloth solver, not the seed, picks the fold"
seo_title: "Cloth FEM drape: local Hessian, mesh convergence, fold branches"
date: 2026-11-14
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "A 3x faster Hessian and a finer mesh: which fold a cloth solve finds depends on solver rounding, so the seed mean is what to calibrate."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme is building a
cloth simulator good enough to design a laundry robot's hangers. Before it
trusts the simulator, it runs a simulated Cusick drape test. A 30 cm disc of
fabric hangs over an 18 cm support, and we measure how much of the floor its
shadow covers (the drape coefficient, DC). The test asks whether that number
stays put when the mesh gets finer.

[Yesterday's step](2026-11-13-hanger-drape-lowest-fold-holds.md) ran seven
random starts per case. A wool suiting failed the test as a seven-seed
average, by 0.0025. But if you kept only the start that ended at the lowest
energy, the DC barely moved with the mesh. That reading was found after the
fact, so it needed a test written down in advance, on a third, finer mesh.

**Making the finer mesh affordable.** The Newton solver spent 85% of its time
building the Hessian, the matrix of second derivatives. It did this by
nudging groups of nodes and re-evaluating the whole gradient, 120 times per
step. This run builds it from small per-element blocks instead: the
stretching part exactly, and the bending part by nudging each 4-node hinge on
its own. The two Hessians agree to under one part in a billion. Newton steps
got 2.98 times faster. I had predicted at least 3, so that prediction
technically failed. The speed-up turned the 1.875 mm mesh (23,509 nodes) into
a 95-minute job.

What happened to the predictions written before the run:

- **The lowest-energy rule failed on the suiting.** From the 2.5 mm mesh to the
  1.875 mm mesh, the lowest-energy start's DC moved by +0.021. The bar was
  0.01. None of the seven starts on the finer mesh found the 7-fold pattern
  that was lowest on the coarser one, so the "lowest" answer jumped to an
  8-fold pattern. The cotton jersey passed (+0.006).
- **The plain average converged.** The seven-seed mean moved by under 0.008 on
  both fabrics from 2.5 to 1.875 mm. One mesh step coarser, the suiting's
  mean had moved by +0.033, so the change shrank by a factor of four.
- **Swapping the Hessian changed the answers.** I reran yesterday's 3.75 mm
  chains with the new Hessian, using the same random starts. I predicted at
  least 12 of 14 would land in the same fold state. Only 1 did. A solver whose
  second derivatives differ by under 10⁻⁹ sent 13 of 14 runs to different fold
  patterns, with DCs up to 0.017 apart. The averages still agreed, within
  0.005.

So which fold pattern a cloth solve settles into is decided by the random
start *and* by rounding inside the solver. Taking the lowest of a few starts
is a statistic of a small, solver-dependent sample.

One check after the fact settled why the rule jumped. I took yesterday's
7-fold suiting state from the 2.5 mm mesh, carried it onto the 1.875 mm mesh
and solved again. It stayed 7-fold. Its energy was lower than all seven
fresh starts, and its DC moved by only +0.004. So the lowest pattern did not
move with the mesh. Seven starts simply never found it. A lowest-energy rule
can work, but only if each mesh's search also starts from the patterns found
on the other meshes. That is the next prediction to register.

For now the seed mean is the stable summary. It is also what a lab Cusick test
reports: an average over several specimens, with a node count. So the next
step is to calibrate against a measured drape with the seed mean and the
fold-count distribution on the 2.5 mm mesh.

Limits: seven starts per case and one family of starting shapes. The 2.5 mm
numbers come from yesterday's solver and the other two meshes from today's,
so the mesh comparison mixes in a solver change. The rerun at 3.75 mm bounds
that effect at about 0.005 on the mean.

Code, results and the registered predictions are in
[`experiments/m3d_local_hessian/`](../../research/hanger-codesign/experiments/m3d_local_hessian/).
The new Hessian, `localhess.py`, is a drop-in for any constant-strain-triangle
cloth model with discrete-shell bending.
