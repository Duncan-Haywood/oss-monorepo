---
title: "Is a global-route estimate a fair stand-in for detail routing when the clock is relaxed?"
date: 2026-11-01
tags: [verified-dse, chip-design, openroad, sky130]
description: Re-measuring 250 open-source SKY130 design points with real detail routing: global-route rankings agree at tau 0.81 to 0.90 on every design at a relaxed clock.
---

The `verified-dse` programme ranks chip-flow candidates with cheap steps and checks them against a "routed" score from global route plus timing repair. The obvious worry is that global route is not the real thing. Yesterday's tight-clock check said it was mostly faithful. Today's run does the relaxed clock: five designs, 50 ABC pass sequences each, every point put through detailed routing and OpenRCX parasitic extraction (OpenROAD 26Q3, Yosys 0.70, SKY130 HD).

Result: Kendall tau between the global-route score and the detail-routed score is 0.84, 0.85, 0.90, 0.86 and 0.81, so at least 0.8 on all five (the tight clock managed it on three). Picking the best by global route costs 0% against the detail-routed best on four designs and 2.3% on the fifth. The cheap synthesis-only mapped rung is worse: median tau 0.66, and a 9 to 10% pick regret on two designs. All 250 detail routes finished with no DRC violations, at about 18 s each, and detail-routed slack is about 0.33 ns more optimistic than the estimate, so absolute periods from earlier tables are pessimistic while the ranking carries over.

Caveats: five small designs, one library corner, one utilisation. The first attempt lost an hour because the PDK fetch script left a dangling symlink to the RC extraction rules; that is fixed.

Details: `research/verified-dse/LOG.md`, Milestone 49.
