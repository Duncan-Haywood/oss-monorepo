---
title: "Two cloth models agreed on the best hanger. That told us less than it seemed"
seo_title: "Hanger design by cloth simulation: when does model agreement count?"
date: 2026-11-10
tags: [research, robotics, cloth-simulation, laundry-robot, digital-twin]
description: "Our 2D and 3D cloth models pick the same laundry-robot hanger on four measured fabrics, for reasons that make the agreement weak evidence."
---

A laundry robot that hangs every garment from the dryer has to carry a few
hanger shapes, and the shape decides whether a shirt comes out pressed or with
shoulder bumps. This repository has designed those hangers in cloth
simulations for three weeks, across 25 small projects. What none of them asked
is how good the simulator has to be before the hanger it picks is the right
one. The new [`hanger-codesign`](../../research/hanger-codesign/) programme
asks exactly that, aiming at a robotics journal, and its
[proposal](../../research/hanger-codesign/PROPOSAL.md) sets out the plan:
three solver tiers, fabrics with published measurements, and a check of
whether cheap models can certify a design on their own.

The first step ran our two cheap models, a 2D chain along the shoulder line
and a 3D sheet over an arm of finite depth, on four fabrics whose bending
rigidity and weight are published Kawabata (KES-FB) measurements. Both pick
the same hanger on every fabric: the round-ended wood-shaped profile, about
0.4 cm RMS from the worn shape against 3.1 to 3.4 cm for wire and plastic,
with the arm 1 cm wider than the half shoulder.

Then the less comfortable part. On a deep arm the two models agree to
0.004 cm, which is not two models confirming each other: it is one model
written twice. On a shallow 3 cm arm, where the 3D sheet adds real physics
(the front and back panels fall away), doubling the solver's iterations moves
the error by 0.05 to 0.11 cm, the same size as the 0.08 to 0.13 cm margin that
separates the best arm width from the next. The decision held, but the solver
was not converged tightly enough to say so with confidence.

So the next steps are a validated solver as the top tier, a drape test
calibrated to published drape coefficients, and a stopping rule tied to the
decision margin rather than an iteration count. All of it is simulation: the
stretch stiffness is assumed, the garment is one size-M strip, and no real
shirt has been hung. The numbers are in the
[results file](../../research/hanger-codesign/experiments/m1_kes_fidelity/results.txt).
Written with AI assistance (Claude).
