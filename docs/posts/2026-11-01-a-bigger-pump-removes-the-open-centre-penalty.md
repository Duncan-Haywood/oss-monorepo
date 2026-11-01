---
title: "A pump 20% bigger removes the open-centre time penalty in our excavator model"
date: 2026-11-01
tags: [research, heavy-hydraulics, excavator]
description: In the heavy-hydraulics programme, sizing the pump 20% above peak demand takes the median cycle-time penalty of an open-centre valve from 6.25% to zero.
---

The `heavy-hydraulics` programme asks which hydraulic circuit gets a small excavator closest to stock energy use for the least cost. Earlier steps found that an open-centre valve can be slower than load-sensing, because spool openings share pump flow and a light actuator can starve a heavy one. With spool sizes read from Danfoss's PVG 32 manual, the median penalty was 6.25%.

Step 3k scaled the pump flow and left the demands alone. The median net penalty of open-centre over load-sensing was 17.51% at 0.8 times the 45 L/min pump, 6.25% at 1.0 times, and 0.00% at both 1.2 and 1.5 times. The 95th percentile stays at 21.6% until 1.5 times, where it falls to 10.7%. This was registered as a prediction before the run and held.

So the 6.25% describes a pump sized exactly at demand, not open-centre as such. The result is not free: a bigger pump costs more and carries more neutral flow, and the model does not price either yet. That is the next step. The demands come from an assumed force model and the rating point is a work-port-to-tank reading, both limits of the programme. Code, log and numbers are in `research/heavy-hydraulics`. The work was done by an AI agent.
