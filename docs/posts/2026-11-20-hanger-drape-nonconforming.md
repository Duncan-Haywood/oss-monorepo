---
title: "An edge-midpoint cloth element unlocks the membrane, and our simulated drape still over-drapes"
seo_title: "Nonconforming cloth FEM vs membrane locking on measured drape"
date: 2026-11-20
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "Edge-midpoint cloth FEM vs nine measured wovens: locking goes at real stiffness and drape error falls 0.030, but a numerical penalty moves it by 0.05."
---

The [`hanger-codesign`](../../research/hanger-codesign/) programme asks how
good a cloth simulator has to be before the hanger it designs for a laundry
robot is the right one. Its best tier, a triangle finite-element cloth, ranks
the measured Cusick drape of nine real woven fabrics (Petrak et al. 2021,
[doi:10.3390/ma14216259](https://doi.org/10.3390/ma14216259)) almost
perfectly, but it over-drapes every one of them by about 0.14.
[Yesterday](2026-11-19-hanger-drape-locking.md) we showed that part of that
error is membrane locking. Today we swapped in an element built not to lock and
reran the comparison.

## The element

A linear triangle on a triangulated sheet has about two triangles per node.
Holding the warp and weft strain at zero then puts four constraints on each
node, which has only three degrees of freedom, so the sheet cannot fold without
stretching. English and Bridson (2008,
[doi:10.1145/1360612.1360665](https://doi.org/10.1145/1360612.1360665)) moved
the unknowns to the edge midpoints, the Crouzeix-Raviart element. A lattice has
about three edges per node, which gives nine degrees of freedom per node against
the same four constraints.

We built that element for our Cusick specimen. Each triangle keeps its
Saint Venant-Kirchhoff membrane, and bending is a hinge between the two midpoint
triangles at each edge, calibrated on a cylinder. The first build did not
converge. On the free rim the midpoint field has in-plane modes that cost no
energy (39 of them on a 12 mm mesh), and Newton's method wandered along them.
We added a small penalty on the in-plane jump of the field across each edge, the
tangential half of Hansbo and Larson's (2003) stabilisation. Scaled with the
stretch stiffness, the penalty locked the element again in a pilot. Scaled with
the shear stiffness, which does not change along our ladder, it did not.

## What it changed

The test is the same ladder as yesterday. Seed 0 and the measured FAST inputs
stay fixed, and the stretch stiffness EA steps from 150 N/m up to each fabric's
measured secant, on a 3.75 mm lattice.

- **At the top of the ladder the locking is gone.** Over the last doubling of
  EA, the conforming element's stretch energy stops falling or even rises (local
  exponent −0.10 to +0.30, where locking-free is −1). The edge-midpoint
  element's keeps falling, with exponents of −0.63 to −0.91, and its drape
  coefficient rises 0.0005 to 0.0067 per doubling, against 0.005 to 0.011.
- **Over the whole ladder it is not flat.** Fitted from 150 N/m, the exponent is
  −0.48 to −0.80. We had registered −0.8 or steeper on seven of the nine fabrics,
  and only one fabric made it. The drape still rises 0.007 to 0.069 from the bottom
  of the ladder to the top, and the stiffest fabrics climb about as much as
  before. The rise shrinks with every doubling, which a locked element does not
  do, but it was not the flat line we predicted.
- **The over-drape falls by 0.030**, from +0.133 to +0.102. That is less than
  the 0.044 that yesterday's locking estimate promised. RMSE falls from 0.137 to
  0.107, and the ranking is unchanged (Spearman 0.967, Pearson 0.974).

## The catch: a numerical knob as big as the fix

The stabilising penalty has a weight γ, and no physical value tells us what it
should be. We registered a sweep. Between γ = 0.01 and γ = 1 the drape
coefficient moves by 0.048 on average on the 3.75 mm lattice and by 0.059 on
5 mm. That is as large as the whole locking effect. The spread shrinks with the
mesh roughly in step with the mesh spacing, which is what a discretisation error
does, but it is still there. The weakest penalty also fails to converge on two
of the nine fabrics. The remaining bias is +0.07, +0.10 or +0.12, depending on
which γ you pick.

| 3.75 mm lattice, measured stiffness | bias | RMSE |
|---|---|---|
| conforming triangle (yesterday) | +0.133 | 0.137 |
| edge-midpoint, γ = 0.01 | +0.070 | 0.078 |
| edge-midpoint, γ = 0.1 | +0.102 | 0.107 |
| edge-midpoint, γ = 1 | +0.118 | 0.123 |

Three of our eight registered predictions held: the ranking, the mesh check,
and the penalty error shrinking with refinement. The other five failed. Two of
the failures are the acceptance tests for a locking-free element, and one is our
own forecast of how much the fix would buy. One change to the method was made
after the first solves, and it is disclosed: the first starts drew their noise on
the midpoints, which are only 1.9 mm apart, and folded midpoint triangles over.

## What it means for the programme

Locking was real, and an element without it is worth about 0.03 of drape
coefficient here, a fifth of the error. The rest, +0.07 to +0.12 depending on
γ, belongs to something else: the gap between FAST's cantilever bending and bending in a
drape, the mesh, or the fold pattern a single seed lands in. A calibration of
the bending input is still needed. With this element, though, the stretch
stiffness has almost stopped mattering at a woven's real stiffness, which is
what lets a single bending factor be read as a bending correction.

Everything is in
[`experiments/m4d_nonconforming/`](../../research/hanger-codesign/experiments/m4d_nonconforming/):
the element (`cr.py`), the predictions registered before any solve on these
lattices, the results and the run logs. It is simulation only. Nothing here is
a new measurement of real fabric.
