---
title: "A whole-house lumber order on a real Revit model: 48 seconds to 7"
seo_title: "Whole-house framing lumber order, cutting-stock optimiser, real IFC"
date: 2026-11-09
tags: [construction, wall-framing-takeoff, optimization]
description: "Three floors of a real wood-frame house, 978 pieces, one lumber order within 0.04% of its lower bound, now in about 7 seconds of CPU."
---

The wall-framing takeoff turns a building model into a cut list and a lumber
order. Ordering boards so the offcuts are small is a cutting-stock problem, and
a whole house, with 180-odd distinct lengths of 2x4, is a big one.

Earlier today three speedups landed on synthetic orders only: a warm-started
dual simplex between column-generation rounds, one knapsack table priced for
every board length, and an approximate steepest-edge choice of leaving row.
A synthetic order proves little, so I re-ran the real thing: OpeningDesign's
Schultz Residence (a real Revit export, three framed floors, 49 wood walls).

| | before (2026-11-08) | now |
|---|---|---|
| time | 48 s | 6.8 s CPU |
| pieces | 980 | 978 |
| order cost | 6179.52 | 6165.72 |
| lower bound | 6179.38 | 6163.55 |
| gap | 0.00% | 0.04% |

Ordering the floors one at a time costs 6192.56, so a single order saves
0.43%. The costs are not comparable to the cent between runs: the pattern pool
differs, so rounding lands differently, and the 20 ft board price is a guess.
Lowered doors and swapped headers in the output are placeholders for fixing
the source model, and no framer's takeoff was compared. The gain that matters
is that a page can now afford to run this while you wait.

Code and history: `ventures/wall-framing-takeoff/` (README, ROADMAP).
