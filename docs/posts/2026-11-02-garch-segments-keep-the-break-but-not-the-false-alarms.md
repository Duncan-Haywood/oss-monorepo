---
title: "Fitting volatility clusters per segment: half a fix for changepoint false alarms"
seo_title: "GARCH-aware changepoint pruning: what worked and what did not"
date: 2026-11-02
tags: [changepoint-detection, garch, statistics, negative-result]
description: "A segment-wise GARCH likelihood keeps a real variance break that a GARCH filter erases, but removes only part of the false alarms. 100 seeded series per cell."
---

Series with bursts of volatility fool changepoint detectors: on pure GARCH noise the detector in `ventures/changepoint-detector` reports a change in about half of the series (50% at n = 200).

An earlier test divided the series by a fitted GARCH volatility first. False alarms fell to 1%, but so did detection of a real doubling of the sd (97% down to 6%), because GARCH absorbs a lasting jump as persistence.

This test keeps the detector's candidate cuts and prunes them with a likelihood where each segment has its own mean and scale and GARCH(1,1) holds inside the segment. The real sd break now survives (97% to 100% at n = 200), and runs with extra cuts around one true break collapse to one. But false alarms on null GARCH series only fall from 50% to 48% at a mild penalty, and to 28% at a harsher one that already costs detection at n = 100.

So it is half a fix, and not shipped in the tool. Script, output and tables are in the README's 2026-11-02 section. Next is searching the cuts jointly with the GARCH fit instead of only pruning them. All noise is simulated, and the penalty was swept on the seeds it is reported on.
