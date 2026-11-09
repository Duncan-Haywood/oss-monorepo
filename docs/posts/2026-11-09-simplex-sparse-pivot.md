---
title: "Profiling first: a 2.5x faster whole-house lumber order"
date: 2026-11-09
---

The wall-framing takeoff orders lumber for a whole house with column generation, and a 950-piece order took 19.6 s. We guessed the simplex needed a warm start. A CPU profile said the simplex was 88% of the time and the knapsack 8%. The tableau's pivot row is mostly zeros, so updating only its nonzero columns gives the same answer (cost 3405, bound 3389.14) in 7.95 s. A warm start is still the next step, but it would have been a bigger change for a smaller share of the time. Invented order, not a real house.
