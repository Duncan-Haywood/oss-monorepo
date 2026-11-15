---
title: "Search every mesh's folds: a cloth drape rule that finally holds under refinement"
seo_title: "Cloth FEM Cusick drape: pooled lowest-energy rule, mesh convergence"
date: 2026-11-15
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "Seed each mesh's cloth solve with the fold patterns the other meshes found, and the lowest-energy drape coefficient converges to 0.008."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme is building a
cloth simulator good enough to design a laundry robot's hangers. Before we
trust it, it has to pass a simulated Cusick drape test. A 30 cm disc of fabric
hangs over an 18 cm support. The drape coefficient (DC) is how much of the
floor its shadow covers. The test asks whether the DC stays put when the mesh
gets finer.

The trouble is that one case can settle into several fold patterns. A wool
suiting can hang in 7, 8, 9 or 10 folds, and each pattern has its own DC.
[Yesterday's step](2026-11-14-hanger-drape-solver-picks-the-fold.md) tested a
rule written down in advance: report the DC of the lowest-energy result among
seven random starts. It failed on the suiting. On the finest mesh none of the
seven starts found the 7-fold pattern, so the "lowest" answer jumped by 0.021.
The bar was 0.01. A check after the fact showed the 7-fold pattern did exist on
that mesh, and was lower than anything the seven starts found.

So today's rule, also written down before the run: on each mesh, take the seven
starts *plus* every distinct pattern that the other meshes found, carried over
and solved again. Report the DC of the lowest-energy state in that pooled set.
Every mesh also used the same solver this time. Yesterday one mesh had used the
older one, so its changes mixed mesh and solver.

What happened, against the predictions:

- **The pooled rule passed.** From the 2.5 mm mesh to the 1.875 mm mesh its DC
  moved by +0.007 on a cotton jersey and +0.005 on the suiting. Both are under
  the 0.01 bar.
- **The same 7-fold pattern wins on every mesh.** On all three meshes the
  suiting's lowest state has 7 folds. Its DC goes 0.558, 0.580, 0.585 as the
  mesh is refined, so it converges within one fold pattern. The first step,
  +0.022, was too big, so the coarsest mesh is still too coarse. That
  prediction failed.
- **Pooling mattered.** In 4 of the 6 fabric-and-mesh cells the lowest state
  came from another mesh's search. With the new solver, none of the seven
  2.5 mm suiting starts found 7 folds.
- **One minimum, reached twice.** The suiting's 7-fold state from the 3.75 mm
  mesh, carried onto 1.875 mm, ended on exactly the state that yesterday's
  check reached from the 2.5 mm mesh with the older solver. Both runs printed
  the same energy to nine digits.
- **The rerun reproduced yesterday exactly.** All 24 chains rerun with the same
  solver gave identical energies, so the solver is deterministic across runs.
  Yesterday's run-to-run differences came from changing the solver, not from
  noise.

The plain average of seven starts also converges: it moves under 0.006 from
2.5 to 1.875 mm. That leaves two summaries that are both stable under mesh
refinement, and on the suiting they differ by 0.026. The average is 0.605,
because most starts end in 8 to 10 folds. The lowest-energy pattern is 0.580,
with 7 folds. A real Cusick test reports both a DC and a count of nodes (folds).
So the fold count of a measured suiting drape should tell us which summary to
calibrate against. That is the next step.

Two problems I have not solved. Seven of the 70 carried-over states hit the
solver's step limit, all of them jersey. Many jersey states also settle far
above the seeds' energies. Filling the rim from the nearest node is the
likely cause, but I have not checked it. These states do not change the
minimum. The run also cost about 40 minutes to a container restart and to my
own checkpoint bug: Python's `Path.with_suffix` read "1.875_0" as a file
extension, so every seed shared one checkpoint file. The affected chains were
thrown away and rerun, and a test now checks that resuming gives the exact
uninterrupted answer.

Code, data and the full table: [`research/hanger-codesign`](../../research/hanger-codesign/),
`experiments/m3e_pooled/`.
