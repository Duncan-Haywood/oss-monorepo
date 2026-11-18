---
title: "Keeping warp and weft apart made our cloth simulator's drape error worse, not better"
seo_title: "Orthotropic cloth FEM vs measured Cusick drape on nine wovens"
date: 2026-11-18
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin, finite-elements]
description: "An orthotropic cloth element that keeps warp/weft bending and stretch apart over-drapes nine measured wovens slightly more than the isotropic one: RMSE 0.161."
---

[Yesterday](2026-11-17-hanger-drape-measured.md) the
[`hanger-codesign`](../../research/hanger-codesign/) programme compared its
cloth simulator with real fabric for the first time. Nine woven fabrics from
Petrak et al. (2021, [doi:10.3390/ma14216259](https://doi.org/10.3390/ma14216259))
have measured FAST bending, shear and stretch, and a measured Cusick drape
coefficient (DC). Our triangle finite-element tier ranked them almost exactly as
measured (r = 0.965) but over-draped every one, by about 0.14. One factor of
0.485 on bending rigidity removed the bias, but that was a fit, not an
explanation.

The obvious suspect was the averaging. A woven is stiffer along one yarn
direction than the other: F9's warp bending is 4 times its weft, and F2's warp
stretch is 11 times its weft. The isotropic element gets one geometric mean of
each and throws the difference away.

## What we built

An orthotropic version of the same element. Stretch is easy: the warp and weft
strains each get their own stiffness. Bending is harder, because the element
bends at hinges along triangle edges, and an equilateral lattice has only three
edge directions. With an orthotropic fabric's mirror symmetry, two of those
directions must share a weight, which leaves two weights. We calibrated them on
the lattice itself, so a cylinder bent along the warp stores exactly the warp
rigidity and one bent along the weft stores exactly the weft rigidity. When warp
equals weft the new code gives the old element exactly: same energy and same
Hessian, with gradients equal to 4 parts in 10^16.

Two weights pin the two axes but leave the angles in between to the lattice. At
a 4:1 ratio, the effective rigidity at 30° is 1.09 times the *warp* value, and
at 45° it equals the warp value again. Averaged over angles, the lattice's
rigidity is 1.0 to 1.6 times the geometric mean the isotropic element used.

## What happened

We wrote down nine predictions and committed them before the main runs. Seven
were refuted.

| against measured DC, nine fabrics | Pearson r | bias | RMSE |
|---|---|---|---|
| isotropic element (yesterday) | 0.965 | +0.143 | 0.148 |
| orthotropic element, lowest-energy of 3 starts | 0.919 | +0.152 | 0.161 |

The orthotropic element over-drapes slightly *more*. Orthotropic bending alone
raised the DC on four of the five strongly anisotropic fabrics (by 0.02 to 0.06),
which is what a stiffer off-axis rigidity predicts. The fifth, F9, dropped by
0.09, but only because it settled into a different fold pattern: 4 folds
instead of 8.

So the 0.485 factor is not the anisotropy. On this element, putting the
anisotropy back pushes the error in the wrong direction. That leaves three
suspects for the bias. The first is the mesh trend: yesterday's DC rose when
the mesh was refined. The second is membrane locking at these fabrics' high
stretch stiffness. The third is the gap between bending measured on a FAST
cantilever and the bending a drape actually uses.

## The other lesson: how small a difference can we see?

We also ran the old isotropic case through the new code, expecting it to
reproduce yesterday's numbers to four decimals. It did not: one fabric moved
0.003 and the other 0.009, with a different fold count. The two codes compute
the same energy to every printed digit. The only difference is the order of
floating-point additions, and that is enough to send the Newton solver into a
neighbouring fold pattern. An earlier milestone had seen the same thing.

So on this simulator, a single-run difference between two models means nothing
below about 0.01 in DC, and a jump in fold count can move the DC by 0.1. The
effects in today's comparison that looked large, such as F9's −0.09 and a
non-additive residual of +0.11, are fold-pattern jumps, not physics. Model
comparisons on this tier need many starts pooled, as milestones 3e to 3g built.

## What's next

The membrane is now the leading suspect. The next step is a locking-free membrane
on the same nine fabrics at three mesh sizes. We also searched Europe PMC again
for a second open table that pairs per-fabric FAST or KES data with a measured
Cusick DC, which would test the 0.485 factor out of sample. Nothing usable came
back: one candidate paper prints only regression coefficients.

Code, results and the registered predictions are in
[`research/hanger-codesign/experiments/m4b_orthotropic/`](../../research/hanger-codesign/experiments/m4b_orthotropic/).
This is simulation research with AI assistance (Claude), checked against
published measurements. It makes no claim about any product.
