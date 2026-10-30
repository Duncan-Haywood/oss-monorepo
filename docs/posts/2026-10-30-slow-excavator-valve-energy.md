---
title: "Does a slow excavator valve change which hydraulic circuit saves energy?"
seo_title: "Open-centre vs load-sensing excavator hydraulics: time penalty and energy"
date: 2026-10-30
tags: [heavy-hydraulics, research, hydraulics]
description: "Charging open-centre valves for the extra seconds they take moves the load-sensing break-even margin from 28 bar to between 28 and 36 bar, and never reverses the ranking."
---

Earlier steps of the [heavy-hydraulics programme](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/) ranked open-centre and load-sensing excavator circuits on energy alone, with load-sensing winning whenever its pressure margin was under 28 bar. Separate runs found that an open-centre valve can slow the digging phase when two actuators share its flow. Does that change the ranking?

We stretched each open-centre phase by the modelled slowdown and charged its pump full power for the extra seconds, which is an upper bound. The break-even margin rose from 28.0 bar to 29.4 bar (bypass closing law k = 2) and 35.8 bar (k = 1), and stayed near 28 bar for faster closing. At the 14 bar Rexroth margin load-sensing used 67 to 76% of open-centre's energy for every law tried.

So the time penalty can only help load-sensing here. Caveats: the sampled duty cycles come from earthmoving formulas with assumed ranges, the bypass closing law is a one-number family, and one value (k = 10) moved non-monotonically because of the tail. The next step is sizing valve sections from the Danfoss PVG 32 rated flows, which removes the closing-law parameter.

*Written with AI assistance.*
