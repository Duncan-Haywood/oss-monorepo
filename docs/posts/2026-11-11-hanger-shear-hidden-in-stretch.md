---
title: "The stretch stiffness we kept sweeping was mostly shear, and shear was in the table all along"
seo_title: "Cloth drape simulation: shear, not stretch, and mesh convergence"
date: 2026-11-11
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin]
description: "A simulated Cusick drape test on a 2.5 mm grid: the stiff fabric converges, the soft jersey does not, and most of the stretch effect is really shear."
---

Two earlier steps of the [`hanger-codesign`](../../research/hanger-codesign/)
programme ran into the same unmeasured number. A
[simulated drape test](2026-11-11-cusick-drape-test-locking.md) on our 3D
cloth sheet moved more with stretch stiffness (EA) than with the fabric's
bending rigidity. The
[shallow-arm hanger width](2026-11-11-hanger-width-follows-stretch.md) moved
by 1.5 cm across the same range. We blamed "membrane locking": a square
spring grid can't make near-isometric folds without stretching its springs,
so the stiffer the springs, the stiffer the sheet looks.

Locking is a mesh effect, so a finer mesh should shrink it. This step tested
that. We ran the Cusick test (a 30 cm circle of cloth draped over an 18 cm
disc) on grids of 7.5, 5, 3.75 and 2.5 mm. The runs used the softest and
stiffest of four fabrics with measured bending rigidity and weight, at EA
150, 800 and 3200 N/m: 26 cases, each solved to the same stopping rule. Five
predictions were committed before the run. Three were refuted.

What came out:

- **The stiff suiting converges; the soft jersey doesn't.** On the cotton
  suiting the drape coefficient settles to about 0.01 by 2.5 mm at every EA.
  On the single jersey at EA 3200 it goes 0.70, 0.57, 0.49, 0.37 as the grid
  refines, with no sign of levelling off. A 2.5 mm grid (11,500 nodes) is not
  fine enough for a light knit unless the springs are soft.
- **The cloth folds; it doesn't squash.** One idea was that a soft sheet
  cheats by compressing its hem instead of folding. Measured strains say no:
  the mean compressive strain in the overhang is under 0.15% at every EA.
- **Refinement shrinks the EA effect by only about a third.** Even on the
  converged suiting, EA 800 and 3200 still differ by 0.06 in drape
  coefficient.

That last point led to a post hoc check, labelled as such because we didn't
predict it. The sheet's diagonal "shear" springs are set to 10% of EA, so
every EA sweep we ran also swept the shear stiffness. Swapping the two springs
separates them. On the suiting at 2.5 mm, shear alone (80 to 320 N/m) raises
the drape coefficient by 0.046 and stretch alone (800 to 3200 N/m) by 0.027.
On the jersey (3.75 mm) it is 0.139 against 0.013. Most of what we had been
calling stretch dependence is shear dependence. That fits the textile
literature, where drape has long been tied to bending and shear stiffness
(Cusick, 1965).

The useful part: shear stiffness is measured. The paper that gave us bending
rigidity and weight also lists KES-FB1 shear rigidity G for the same four
fabrics: 0.47 to 1.58 gf/cm/deg, or 26 to 89 N/m per radian. Our earlier
write-up said that table had no usable stiffness for the sheet. For stretch
that is still true. For shear it was wrong, because the sheet's in-plane shear
stiffness is exactly its diagonal spring constant. A unit test checks this on
a sheared specimen to 3%. So the base runs (shear 15 N/m) were softer in shear
than any of the four fabrics, and the parameter can now come from data
instead of a sweep.

What it doesn't show yet: whether the shallow-arm hanger width that "followed
stretch" was really following shear. That sheet ties shear to EA the same
way, and it's the next run.

Caveats: one seed on most grids; two fabrics; KES G is a slope at small
angles with large hysteresis, and our shear is linear and elastic; still no
measured drape coefficient to compare against. Everything here is simulation.
The code, results and pre-registered predictions are in
[`research/hanger-codesign`](../../research/hanger-codesign/)
(`experiments/m2b_locking/`).
