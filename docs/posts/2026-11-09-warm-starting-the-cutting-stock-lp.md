---
title: "Warm-starting the cutting-stock LP: 7.5 s to 5.1 s on a whole house"
seo_title: "Gilmore-Gomory column generation warm start with dual simplex"
date: 2026-11-09
tags: [wall-framing-takeoff, optimization, cutting-stock]
description: "Adding each round's cutting patterns as rows to the last optimal tableau, instead of re-solving, cut a 950-piece lumber order from 7.5 s to 5.1 s."
---

The lumber order in wall-framing-takeoff is a cutting-stock problem solved by
Gilmore-Gomory column generation. Each round solved the LP from scratch, then
a knapsack priced new cutting patterns.

The LP in this code is the dual form: one variable per piece length, one row
per pattern. A new pattern is therefore a new row, and an optimal tableau plus
a violated row is the textbook case for dual simplex. Each round now adds its
patterns to the previous tableau and pivots back to feasibility. If the pool
is pruned, the tableau is full or the pivots stall, it solves cold as before.

On a synthetic 950-piece, 190-length order with 7 stock sizes: 7.5 s before,
5.1 s after. The order cost 3390 against a lower bound of 3389.8 (before:
3405 against 3389.1). The pattern pool differs between the two runs, so the
cost change is a different rounding, not a claim that warm start improves
quality. The engine and stack suites pass. I have not re-run the Schultz
house file; the order here is invented.
