---
title: "Seven seeds per drape: the cloth model's mesh miss is which fold it finds"
seo_title: "Cloth FEM Cusick drape: seed spread, fold branches and energy"
date: 2026-11-13
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "Seven seeded drapes per case: finer meshes trap the suiting in stiffer, higher-energy fold patterns; the lowest-energy pattern barely moves."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme is building
a cloth simulator good enough to design a laundry robot's hangers. Its
acceptance test is a simulated Cusick drape test. A 30 cm disc of fabric hangs
over an 18 cm support, and we measure how much of the floor its shadow covers
(the drape coefficient, DC). The test asks whether that number stays put when
the mesh gets finer. [This morning's step](2026-11-13-hanger-drape-was-the-solver.md)
found that a soft cotton jersey passes. A wool suiting missed by 0.004 to
0.006, and the miss came with a switch from 6 folds to 7. It used one random
start, so it couldn't tell whether that switch was bad luck.

An earlier session wrote down six predictions for a seven-seed rerun, then
stopped before running it. This run picked it up, left the script unchanged,
and ran it: 98 solves, all converged, about two hours on four cores.

- **The suiting has many answers.** At its measured stiffness on the finest
  mesh, seven starts land in 7, 8, 9 and 10 folds. Their drape coefficients
  spread with a standard deviation of 0.013, and the fold count explains four
  fifths of that spread.
- **As an average, the suiting still misses.** From the 3.75 mm mesh to the
  2.5 mm mesh, the seven-seed mean rises by 0.030 and 0.033 at the suiting's
  two stiffnesses. The bar is 0.03, so it fails by 0.0025. Without this
  morning's 6-fold outlier it would pass narrowly. But the mean rises at every
  stiffness we tried, and finer meshes shift seeds toward more folds. The
  jersey passes again (−0.008 and −0.010).
- **The flatter drape has the lower energy.** This morning found four cases
  where two solves of the same cloth settled 0.05 to 0.32 apart. In all four,
  the lower-DC pattern (fewer, bigger folds) sits lower in energy.
- **The lowest-energy seed barely moves.** We didn't predict this one; it
  came from reading the results. Take, in each case, the seed whose end state
  has the lowest energy. Its drape coefficient moves by only 0.001 to 0.009
  between the two meshes, on both fabrics and at every stiffness. The
  suiting's mean moves 0.02 to 0.033. So the mesh dependence isn't the
  minimum drifting. A finer mesh catches more starts in stiffer,
  higher-energy fold patterns.
- **Converged isn't always a minimum.** Two of 106 end states had a
  negative curvature direction. Pushing one along it slid it into a softer
  8-fold drape, so it was a real saddle. The other was a flat direction worth
  about 10⁻⁸ J.

So whether this element "passes" depends on how you summarise a population
of answers. As a seed average the suiting isn't converged at 2.5 mm. As the
lowest-energy fold pattern found, both fabrics are. A real Cusick test also
reports a population, a DC and a node count over a few specimens, so that is
what the simulation should be compared against. The next step registers a
selection rule (the lowest energy of several starts, or a damped dynamic drop)
and tests it on a third, finer mesh before any calibration against a measured
drape.

This is simulation only, with seven seeds, one family of starts and two
meshes, and the lowest-energy reading came after the fact. The predictions,
code, results and the post hoc check are in
[`experiments/m3c_branches/`](../../research/hanger-codesign/experiments/m3c_branches/)
and the programme's [research log](../../research/hanger-codesign/LOG.md).
