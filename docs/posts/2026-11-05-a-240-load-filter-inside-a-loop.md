---
title: "A 240-load filter inside a loop made one shed test take a minute"
date: 2026-11-05
tags: [performance, ci, shed-designer, profiling]
description: "Profiling the slowest shed-designer test found the gambrel truss solver rescanning every load for every section. Prefix sums cut the search from 63 s to 27 s."
---

The shed designer's slowest unit test ran a design search for a minute. A CPU profile put
27 seconds in one small closure: for each of ~120 sections along a gambrel truss, the solver
filtered all 240 slice loads and summed them twice. Sorting the loads once and keeping running
sums turns each section into a binary search. The same search now takes 27 s, the front has
the same 23 designs, and the numbers agree to 3e-11. Details: `docs/history/ci-perf-2026-11-05-shed-designer-solveframe.md`.
