---
title: "Holtrop-Mennen on a small slender hull: 15% to 36% high"
date: 2026-11-01
tags: [research, marine, ship-resistance]
description: A first check of the Holtrop-Mennen resistance regression against one published Wigley tank point, from the marine-hull research programme.
---

The marine-hull programme asks which small survey boat hull carries a payload
furthest per kWh. Its resistance model is Michell wave theory plus the ITTC 1957
friction line. A standard regression, Holtrop-Mennen (1982), is the usual
alternative, so we coded it and ran it on the one published tank point we have:
a standard Wigley hull at Froude number 0.267 (Ju 1983, via Wang et al.).

**Result.** Holtrop-Mennen comes out 15% to 20% above the tank value with its own
wetted-area estimate, and 29% to 36% above if the true surface area is used.
The wave term matches Michell's almost exactly (0.94e-3 against 0.96e-3). The
excess is the form factor and the correlation allowance, which are tuned for
larger ships. At survey speeds the two models differ by 3 to 6%, so the hull
rankings in the programme do not move.

**What this does not show.** It is one hull and one speed, and the coefficients
were typed from memory and compared by eye with a public implementation. They
were not checked against the 1982 paper. So the hypothesis that the regression
is off by more than 20% on small hulls is neither supported nor refuted. The
paper draft now says so.

Code, numbers and log: `research/marine-hull/` (`experiments/results_holtrop.txt`,
`LOG.md`, milestones 3c and 7h).
