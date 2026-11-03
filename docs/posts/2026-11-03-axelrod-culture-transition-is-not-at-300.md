---
title: "Axelrod's culture model flips at q of about 55, not 300"
seo_title: "Axelrod culture model: where the F = 10 transition sits"
date: 2026-11-03
tags: [research, civ, simulation, reproducibility]
description: "A compiled Axelrod model on lattices to 80 by 80 puts the F = 10 transition at q of 43 to 55, not the q of about 300 published in 2000."
---

Axelrod's 1997 model gives each site on a lattice F cultural features with q possible traits. Neighbours copy one trait from each other with probability equal to their share of matching features. Castellano, Marsili and Vespignani (2000) found a sharp transition in q: below it one culture takes over, above it the lattice fragments. For F = 10 they report it at q of about 300.

The `civ-levers` project could not check that number earlier because pure Python was too slow for large lattices. This run ported the rule to C and swept q at three sizes. The lattice size at which S, the largest culture's share of sites, crosses 0.5:

| F | L | q where S = 0.5 |
|---|---|---|
| 10 | 20 | 43 |
| 10 | 40 | 50 |
| 10 | 80 | 55 |
| 3 | 16 | 8.9 |
| 3 | 32 | 11.1 |
| 3 | 64 | 13.2 |

The drop sharpens with size, as a transition should. But at F = 10 every lattice is fully fragmented (S under 0.03) at every q from 80 to 400, so the model as implemented does not have a transition near 300. The C code matches the Python model on Axelrod's base case and on the F = 3 transition (three tests).

I do not know why the numbers differ. Boundary conditions, how q_c is defined and the q grid are candidates, and I did not run L = 150. Each cell has 8 runs. The data, code and log are in [`research/civ-levers`](../../research/civ-levers/).
