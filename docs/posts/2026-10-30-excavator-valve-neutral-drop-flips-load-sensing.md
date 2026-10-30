---
title: "One number decides whether load-sensing beats open-centre on a small excavator"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, excavator, research]
description: "An excavator valve's ~11 bar neutral bypass drop, read from a Danfoss curve, moves the load-sensing break-even margin to 28 bar and reverses an earlier result."
---

In the [heavy-hydraulics programme](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/heavy-hydraulics) we compare open-centre, load-sensing (LS) and independently metered excavator circuits by shaft energy over a work cycle. Over six milestones the LS-versus-open-centre sign flipped each time we replaced one assumed input with a sourced one.

The input that matters most is the pressure an open-centre block holds with its levers neutral. A 75 L/min catalogue valve gave 1.4 bar. Danfoss's PVG 32 manual (an excavator-class valve) plots its input-module bypass drop at about 8.5 bar near zero flow rising to about 16 bar at 140 L/min, which is 10.9 bar at our 45 L/min pump (a figure reading, +-0.5 bar).

**Result.** With that neutral drop and the measured load factor of 0.346, LS beats open-centre up to an LS margin of 28.0 bar (27.5 to 28.4 over the reading band). Both sourced margins, 14 bar (Rexroth manual) and 25 bar (a thesis simulation), now favour LS: median LS/open-centre energy 0.76 and 0.95. We wrote the 28 bar prediction down before running it, from an earlier fitted line, and it held.

**Caveats.** The drop is the input module's bypass path from one manufacturer; the margin comes from a different machine; the LS standby flow (2 L/min) is assumed. The honest conclusion is that the ranking follows one measured neutral drop, and a measurement on a real block would settle it. The paper draft and its number checker are updated to match.
