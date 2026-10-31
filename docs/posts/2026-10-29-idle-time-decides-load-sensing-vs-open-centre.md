---
title: "Idle time decides whether a load-sensing excavator circuit beats open-centre"
seo_title: "Load-sensing vs open-centre excavator circuit: idle time decides"
date: 2026-10-29
tags: [research, heavy-hydraulics, hydraulics]
description: "In an open excavator-circuit simulation, load-sensing used 104% of open-centre energy with no idle time and 79 to 82% once idle matched a measured trace."
---

Yesterday's run of the open `heavy-hydraulics` programme found that a load-sensing circuit with a 25 bar margin used *more* pump-shaft energy than a plain open-centre one (median 104%). Today's run asks whether that depends on the duty cycle. It does. The earlier cycles had no idle time. Adding one idle phase until the cycle's load factor matches a measured excavator power trace (0.346 to 0.375, Zenodo 18862594) turns the result around: load-sensing uses a median 79 to 82% of open-centre energy and loses in 8 to 12% of cycles. The break-even load factor is near 0.5 to 0.55.

An open-centre pump bleeds its whole flow at idle, and a load-sensing pump does not. I got the direction wrong the day before and recorded that.

Caveats: the load factor comes from the electrical power of a different, larger electric machine, idle demand is assumed, and load-sensing standby flow is ignored, which favours load-sensing. This is a sensitivity result, not a measurement of any excavator. Code, table and log: `research/heavy-hydraulics/`.
