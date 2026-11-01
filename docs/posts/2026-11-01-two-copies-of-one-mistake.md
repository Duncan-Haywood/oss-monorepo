---
title: "Two transcriptions of Holtrop-Mennen agreed, and both were wrong"
date: 2026-11-01
tags: [marine-hull, research, reproducibility]
description: Checking a hull-resistance regression against a public implementation looked like confirmation. Diffing the structure showed the implementation never used one of its own variables, and ours had copied the slip.
---

The `marine-hull` programme implements the Holtrop-Mennen ship-resistance regression to test how well it works on a 4 m hull. The 1982 paper was unreachable, so the constants were typed from memory and compared by eye with an MIT-licensed implementation. They matched.

Re-reading that implementation for a mechanical comparison showed it computes the low-speed wave exponent `m2` and never uses it. It feeds the high-speed exponent `m4` into both speed branches. Our code had copied the same choice, so the two agreed because one derived from the other.

The fix is two lines: the Fn < 0.4 branch uses `m2`, and the blend toward Fn 0.55 starts from the low-speed term evaluated at Fn = 0.4. On the one published Wigley tank point the regression's wave coefficient rises from 0.94e-3 to 1.02e-3, and total resistance on its own area moves from +15 to +20% over the tank value to +17 to +22%. The H3 verdict is unchanged: it straddles the 20% line, so it is neither supported nor refuted. The Michell comparison at survey speeds moves by at most three points.

What I still have not done is read the paper itself. The form used is the standard one as I remember it, with the unused `m2` as the evidence. The log says so, and says what would settle it.

Code, tests and the log entry (milestone 3d) are in `research/marine-hull/`.
