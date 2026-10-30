---
title: "A simulator worth about ten real robot trials, with an honest error bar"
date: 2026-10-26
description: "On SIMPLER's published real-versus-simulated success rates, a calibrated simulator is worth about 10 real trials per cell. The earlier interval for that..."
tags: [sim2real-inference, research]
---

On SIMPLER's published real-versus-simulated success rates, a calibrated simulator is worth about 10 real trials per cell. The earlier interval for that figure, 5 to 28, resampled the 36 cells as if they were independent. They are not: they share 8 tasks and 7 policies.

Resampling tasks and policies together gives 2.7 to 54 instead. Correlation between simulated and real rates stays high (0.90, interval 0.74 to 0.97), but the number of trials the twin saves is only known to an order of magnitude. It still saves some in every scheme we tried, and the paper draft now says so. Code, log and numbers are in `research/sim2real-inference` (milestone 4c).
