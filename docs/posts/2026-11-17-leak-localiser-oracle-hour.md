---
title: "Take away the oracle hour: a leak localiser keeps about half its hits when a real detector sets the day"
seo_title: "Leak localisation on BattLeDIM without the oracle alarm hour"
date: 2026-11-17
tags: [research, water-leaks, BattLeDIM, leak-localisation, leak-detection, water-distribution]
description: "On BattLeDIM's L-Town, localising at a real detector's alarm day instead of the oracle hour drops 300 m hits from 15 to 8 of 30 detected injected leaks."
---

The [water-leaks](../../research/water-leaks/README.md) programme studies leak
detection and localisation on BattLeDIM's L-Town. L-Town is a simulated water
network with two years of sensor data and a published leak schedule, so
nothing here is a field result.

Over the last few steps a localiser has been improving. It tracks the sources
that explain the pressure residual and picks the steepest ramp-shaped one,
falling back to the newest. [Step 25](2026-11-17-let-the-leak-shape-choose.md)
tested it out of sample on 64 leaks injected through the benchmark's own
generator model, and it placed 25 within 300 m. That beat the newest-source
rule, which placed 16 (P = 0.022).

Every one of those figures had the same input. Each leak was localised on the
day its own flow first reached half of its peak. A utility does not know that
day. It knows when its detector alarmed.

## What we ran

Step 26 puts a real alarm in that slot. The project's own pressure detector,
a residual CUSUM whose thresholds were fixed on 2018 data in step 1, raises
the alarm. The same localiser, with every setting frozen, then runs on the
alarm day. We wrote the six predictions down before the run.

| leaks | detected | within 300 m, oracle day | within 300 m, alarm day | end to end |
|---|---|---|---|---|
| 64 injected | 30 | 15 | **8** (chance 1.0) | 8 of 64 |
| 19 real, 2019 | 10 | 6 | **2** (chance 0.4) | 2 of 19 |

At the alarm day the localiser keeps about half of its hits. On the injected
leaks it still beats chance by a wide margin (P = 4e-6). It also still edges
the newest-source rule, 8 against 7. Four of the six predictions failed,
including the one that mattered most: that it would keep 80% of its hits.
Two other detectors gave the same result. A variant with inlet flows placed
10 of 64, and on the real leaks a reimplementation of the published LILA
method placed 2 of 19.

## Why one day matters

After the run we did a sweep, declared as post hoc. It localised every leak
at the oracle day moved by a few days. The oracle day turns out to be a sharp
peak:

| days off the oracle day | −2 | −1 | 0 | +1 | +2 |
|---|---|---|---|---|---|
| injected leaks placed (of 64) | 11 | 19 | **25** | 22 | 21 |
| real leaks placed (of 32) | 6 | 13 | **15** | 10 | 11 |

Being one day off costs 2 to 6 leaks. A detector on raw pressures alarms days
away from the oracle day, early for some leaks and late for others: a median
2 days early on the injected leaks and 4 days late on the real 2019 ones. The
peak is sharper on the real leaks, which are the ones the rules were developed
on, than on the held-out ones. That is what tuning to an exact day looks like.

## What it changes

Steps 21 to 25 measured localisation with the alarm day handed to the rule.
Their numbers are upper bounds for a pipeline. The end-to-end figure on this
residual is 8 of 64 injected leaks and 2 of 19 real ones. The residual itself
is still an oracle, because it removes demand with the generator's own model.

The next step is a rule built for what an alarm means, which is "first
visible", not "half of peak". It will be set on 2018 leaks only. A second
option is running the detector on the clean residual, where leaks show up
within hours.

Numbers, the plan and the code are in the programme's
[log](../../research/water-leaks/LOG.md) and
[step 26 section](../../research/water-leaks/README.md).
