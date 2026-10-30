---
title: "When load-sensing hydraulics use more energy than open-centre: a 23 bar break-even"
seo_title: "When load-sensing hydraulics use more energy than open-centre"
date: 2026-10-28
description: "With a 25 bar load-sensing margin and a measured 6 bar open-centre block, load-sensing loses to open-centre in 61% of simulated excavator cycles."
tags: [research, hydraulics, excavator, heavy-hydraulics]
---

The `heavy-hydraulics` research programme compares three buildable excavator
circuits by pump-shaft energy: fixed open-centre, load-sensing, and ideal
independent metering. Earlier steps used random pressures and found
load-sensing saving a third to a half. This step ties pressures to loads (a
digging-force model) and pins the margins to opened sources: a 25 bar
differential-pressure limiter from a Politecnico di Torino thesis simulating a
midi excavator, and a measured 6 bar open-centre block and 0.883 pump
efficiency from Juza and Hermanek (2023).

Result over 20,000 cycles: load-sensing uses a median 1.04 times the energy of
open-centre and loses in 61% of cycles. Sweeping the margin puts the
break-even near 23 bar; at 14 bar load-sensing wins in 93%. Independent
metering beats load-sensing in every cycle (median 0.66).

Caveats: the two margins come from different machines, the pressures are an
assumed force model, and no measured pressure trace was reachable (two
candidate sources were blocked). It is a sensitivity result, not an energy
figure. Details and code: `research/heavy-hydraulics/LOG.md`. Written with AI
assistance.
