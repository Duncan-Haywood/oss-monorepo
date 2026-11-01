---
title: "Can a better bypass valve make a fixed-pump excavator circuit cheaper to run?"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, hydraulics, research]
description: In the open excavator-circuit comparison, the fraction of surplus pump flow charged at load pressure turned out not to be a valve property for a fixed pump, and a flow-continuity check over 2,000 random phases shows why.
---

The heavy-hydraulics programme compares fixed open-centre, load-sensing and metered circuits for a small excavator. Its last step swept a "surplus fraction" f: how much of a fixed pump's unused flow gets charged at the highest load pressure. At f = 1 the load-sensing break-even margin was 36.1 bar; at f = 0 it fell to 18.8. The obvious next job was to find a real valve's bypass curve and read f off it.

Before hunting for one, a check: for a fixed pump, f is not a valve property. The pump sees one pressure, the surplus can only leave through the bypass at that pressure, and that pressure has to exceed the heaviest load or the actuator stalls. Shaft power is flow times that pressure, so f = 1 is an identity. A flow-continuity solve over 2,000 random parallel phases agrees with the model's open-centre energy to 5e-16 relative error; widening the bypass lowers the pressure in all 8,000 cases, and in none of them do the actuators keep their demanded flow.

So the f < 1 rows describe a pump that unloads or follows demand, which is the load-sensing family. The fixed-pump break-even stays at 36.1 bar (44.5 bar with a pump 20% larger). Steady-state, orifice laws and a parallel circuit only; no measurement of any machine.

Code, results and log: `research/heavy-hydraulics` (milestone 3p).
