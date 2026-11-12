---
title: "A better cloth element passes the cantilever and still fails the drape test"
seo_title: "Triangle FEM cloth: exact on the cantilever, locked in drape"
date: 2026-11-12
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "ARCSim's triangle element with a Newton solver matches the exact cantilever to 0.9%, yet its simulated drape still moves with mesh and stretch stiffness."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme asks how
good a cloth simulator has to be before the hanger it designs for a laundry
robot is the right one. Two earlier steps found that our spring-grid sheet
can't be calibrated against a standard drape test. Its simulated Cusick drape
coefficient moves with the mesh and with a stretch stiffness that nobody
measured, because the grid locks. So the programme needs a better top tier.
This step tries the obvious candidate.

**What was built.** We wrote the element model of ARCSim, a well-known
open cloth solver, in numpy, without its remeshing. It uses constant-strain
triangles, with stretch and shear as separate parameters (shear comes from
the same published KES table as bending and weight), and hinge bending across
each edge. One detail matters. On a regular triangle mesh, a
cylinder also folds the edges that run *along* its curvature, so the
textbook hinge constant is twice too stiff there. With the factor fixed, the
bending energy is right to 0.4% about every axis. The solver is a damped
Newton method. The chunked first-order solver the earlier steps used
stopped 9% of the way short on a simple cantilever.

**The exact check passes.** Peirce's cantilever test (ASTM D1388) has an
exact answer: the heavy elastica, which puts the tip's chord at 41.5° when
the overhang is two bending lengths. Our solver reproduces that to three
figures. The triangle tier's error halves each time the mesh doubles, from
9% of the overhang at 8 elements to 2.6% at 32. Extrapolated, it lands within
0.9% in all 12 cases, and stretch stiffness moves it by under 0.31%, as it
should for a pure bend.

**The drape test fails.** The acceptance test the programme set for any top
tier is a drape coefficient that stays flat as the mesh is refined and as
stretch stiffness changes. On the cotton suiting, every solve converges,
yet the drape coefficient still climbs about 0.016 per refinement, and going
from 800 to 3200 N/m adds 0.034. That is 40% less than the spring sheet, but
not flat. On the soft cotton jersey the element settles only at 150 N/m
(0.220, 0.184, 0.166, 0.161 down the meshes). That happens to be close to
the stiffness the KES data imply for that jersey at garment load (250 to 370
N/m). Above it, the drape depends on the mesh and Newton stalls. Cloth that
is soft in bending and stiff in stretch still locks these triangles, which
is the problem nonconforming elements were invented for.

**A side result.** The same Newton solver re-solved the earlier spring-sheet
cases. On the jersey it lands in a different fold pattern (+0.055 at 5 mm),
but the sheet's dependence on the mesh survives. The earlier locking
finding was not an artefact of where the old solver stopped.

**Next:** a nonconforming membrane or ARCSim proper, a continuation in
stretch stiffness to bring the stiff cases to equilibrium, and the jersey
run at its own measured stiffness, where this element already converges.
Tables and limits are in the project
[README](../../research/hanger-codesign/README.md) under "Milestone 3a".

*Simulation only; produced with AI assistance.*
