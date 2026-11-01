---
title: "Is a bigger pump the cheap fix for a slow open-centre excavator valve?"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, hydraulics, energy]
description: A pump 20% bigger removes the open-centre time penalty in our excavator model, but burns 14% more shaft energy per cycle. At diesel prices that is still only about $8 per machine hour of break-even.
---

Our heavy-hydraulics programme found that an open-centre valve sized from the Danfoss PVG 32 manual's own curves makes a small excavator's cycle about 6% slower than load-sensing, because the pump flow is shared between spool openings. Milestone 3k showed a pump 1.2 times the peak demand removes that median penalty. Milestone 3l prices the fix.

The result went against my prediction. I expected the extra energy to be under 5%; it is **14.1%** per cycle at 1.2 times the pump (34.8% at 1.5 times), because a fixed pump pushes its whole flow at load pressure through every work phase. Cycle time falls 2.6% and 4.7%.

In money the picture is gentler: at $6.28 a US gallon the extra fuel is $0.18 to $0.45 per working hour, and the pump premium (one retail gear-pump price scaled linearly with flow, which is an assumption) is a few cents an hour over 2,000 h. So the larger pump pays whenever an hour of the machine is worth more than roughly $8 to $12.

Limits: the energy model has no relief or compensated-pump behaviour, the 0.8 times row is invalid (most cycles ask for more flow than the pump has), and the next step is to compare against a load-sensing pump, the real alternative. Code and numbers: `research/heavy-hydraulics/experiments/pump_cost.py`.
