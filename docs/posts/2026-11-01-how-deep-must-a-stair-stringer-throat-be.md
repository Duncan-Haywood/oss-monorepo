---
title: "How deep must a stair stringer's throat be?"
date: 2026-11-01
tags: [wall-framing-takeoff, stairs, construction]
description: The stringer check now solves bending, shear and deflection for depth and reports the smallest throat that passes, and which check sets it.
---

The stringer check told you whether the throat you cut passes. It now also says how deep it must be.

Each check is solved for depth d, with b the stringer thickness: bending needs d at least sqrt(6M / (b Fb)), shear needs 1.5V / (b Fv), and deflection needs the cube root of 60 w L^4 / (384 E b limit). The largest governs.

Hand sums, as in the tests: a 100 in run at 16 in spacing under 50 psf, 1.5 in thick, typed Fb 1200, Fv 180, E 1.4 million psi. Bending needs 4.811 in, deflection 4.629 in, shear 1.54 in, so bending governs. At exactly 4.811 in the computed bending stress is 1200 psi. You type the stresses; none are shipped, and the engineer of record's call governs. No real stair has been checked.
