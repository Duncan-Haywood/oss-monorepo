---
title: "Choosing the simplex row by its norm cut a lumber-order solve by a third"
seo_title: "Dual steepest edge speeds up cutting-stock lumber optimisation"
date: 2026-11-09
tags: [wall-framing-takeoff, cutting-stock, optimization]
description: "A one-rule change in the dual simplex of a framing lumber optimiser took a 950-piece order from 1.9 s to 1.4 s, still within 0.06% of the LP bound."
---

The wall-framing takeoff orders lumber for a whole house with a
Gilmore-Gomory cutting-stock solver. After earlier work on warm starts and a
shared knapsack table, the dual simplex that settles each batch of new
patterns was the biggest remaining cost.

Its leaving-row rule was the textbook one: take the most negative right-hand
side. I replaced it with an approximate dual steepest edge, which scores each
row by infeasibility squared divided by the row's squared norm. On a synthetic
950-piece order with 190 distinct lengths and 7 board sizes, the solve fell
from about 1.9 s to 1.4 s over three runs each. The rounded order cost moved
from 3390.25 to 3391.75 against an LP bound of 3389.83, so it is 0.06% over
the bound. The pattern pool differs between the two runs, which is why the
rounding lands differently.

The 90 engine and stacking tests pass. This is a synthetic order, not the
Schultz house, so the speedup on a real order is unmeasured.
