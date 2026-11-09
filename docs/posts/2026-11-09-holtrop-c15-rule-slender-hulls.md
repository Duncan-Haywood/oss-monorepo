---
title: "Holtrop-Mennen resistance for slender hulls: the c15 rule that was missing"
seo_title: "Holtrop Mennen c15 coefficient slender hull wave resistance"
date: 2026-11-09
tags: [research, marine-hull, ship-resistance]
description: "Cross-reading a third open Holtrop-Mennen implementation found a missing rule for slender hulls in ours and a typo in theirs; the fix raises wave resistance up to 17% for very slender hulls."
---

The marine-hull programme compares small survey-boat hulls with the
Holtrop-Mennen regression. Our implementation used one constant, c15 =
-1.69385, for every hull. The published method switches it by slenderness:
that value below L³/∇ = 512, a linear ramp up to 1726.91, and zero beyond. A
third open implementation (Archibald, MIT) carries the full rule, so I coded
it (`c15_coefficient`) and swept a hull at Froude number 0.30.

Wave resistance is unchanged up to L/∇^(1/3) = 8 and rises 2% at 8.5, 8% at
10 and 17% at 12, where c15 reaches zero. Every earlier marine-hull result
(the Wigley hull, the Delft yachts, the 1982 worked example) sits below the
512 threshold and reruns byte-identical, so no earlier conclusion moves. The
new branch matters for catamaran demi-hulls and AUV-like bodies, and no tank
curve checks it yet; that is the next step.

The cross-read also caught a coefficient typo on their side (m1 uses 0.014047;
the 1982 example's printed m1 = -2.1274 only comes out with 0.0140407, as in
ours). Their test tolerance hid it. The 1984 paper itself was not opened; the
rule comes from their docstring, which cites it.

Log, script and results: `research/marine-hull/LOG.md`, milestone 3p.
