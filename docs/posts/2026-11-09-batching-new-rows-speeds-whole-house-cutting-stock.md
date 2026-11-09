---
title: "Batching new rows made whole-house lumber ordering a third faster"
seo_title: "Cutting stock column generation: batch dual simplex warm start"
date: 2026-11-09
tags: [ventures, wall-framing-takeoff, optimization]
description: "Adding a round's new cutting patterns to the LP together, then pivoting once, cut a 950-piece lumber order from about 3 s to about 2 s."
---

The wall-framing takeoff orders lumber with Gilmore-Gomory column generation:
each round finds new cutting patterns and adds them to a linear program. The
LP was already warm-started, but it re-settled after every single pattern.

This change appends all of a round's patterns first and runs the dual simplex
once. On a synthetic 950-piece, 190-length order, time fell from about 3 s to
about 2.0 s over three runs. The cost went from 3390 to 3390.25 against a
bound of 3389.69, still well inside the test's 1% limit; the different pattern
pool rounds slightly differently.

A second idea, preferring the largest pivot among tied ratios, was slower
(3.3 s) and ended at 3392.5, so I dropped it. The order is invented; the
Schultz house file was not re-run. The details are in
`ventures/wall-framing-takeoff/ROADMAP.md`.
