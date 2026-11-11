---
title: "Load-sensing vs open-centre hydraulics on a real wheel loader: the model holds, the savings shrink"
seo_title: "Load-sensing vs open-centre hydraulic energy and fuel, measured wheel loader data"
date: 2026-11-11
tags: [research, heavy-equipment, hydraulics, load-sensing, wheel-loader, open-data]
description: "On a public 440 s trace of a 6 t load-sensing wheel loader, the measured margin is 24.9 bar, a simple model matches pump energy to 2.3%, and open-centre would add about 6 to 22% fuel."
---

How much fuel does a load-sensing hydraulic system save over a plain open-centre
one? The [`heavy-hydraulics`](../../research/heavy-hydraulics/README.md) research
programme had been answering that with models and invented cycles for two weeks.
It was blocked waiting for one thing: a measured trace with pump pressure,
actuator pressures and fuel on the same clock.

A Zenodo search turned one up. Linjama, Huova, Tammisto, Tervonen and Ahola at
Tampere University published
[440 seconds of a 6 t wheel loader loading gravel](https://doi.org/10.5281/zenodo.10639199)
(CC BY 4.0). It has 2 ms samples of the lift and tilt cylinder pressures and
positions, the outlet pressure of the 63 cc variable work pump, engine speed and
the ECU fuel rate, from 18 short Y-cycles of about 21 s each. We wrote four
predictions in the project log before computing anything, then ran them
([`measured_loader.py`](../../research/heavy-hydraulics/experiments/measured_loader.py)).

**What the machine measured**

- With no flow demanded, the pump idles at a 30.8 bar standby pressure, so this
  really is a load-sensing system.
- While the boom or bucket moves, the pump runs a median **24.9 bar** above the
  highest load pressure. That is the first measured margin in the programme. The
  figures it had used came from valve manuals (14 and 25 bar), and the measured
  value sits between them.
- The actuators receive 73% of the pump's hydraulic energy.

**The model holds**

The programme's load-sensing model is one line: pump power is total flow times
(load pressure plus a constant margin). With the measured median margin it
reproduces the measured pump energy to **2.3%**. Across the 18 cycles the error
runs 1.3 to 3.4% (95% bootstrap). This is a weak test, because both sides share
the same flow, but it shows a constant margin is a fair simplification here.

**The open-centre penalty is smaller than the models said**

Put a fixed 63 cc open-centre pump on the same motion. It would use about
**1.46 times** the load-sensing pump energy and add about **12% to the machine's
fuel**. Across the sweep of unsourced settings that becomes 1.24 to 1.79 times
and 6 to 22% more fuel. The programme's first, invented cycle had load-sensing
at 47% of open-centre. On the real cycle it is 56 to 81%. Two of the four
predictions (open-centre at 1.5 to 3 times, and 10 to 30% more fuel) fail across
the sweep.

**A bug, and a threshold**

The first run gave a much bigger penalty: 2.29 times and 35% more fuel. That was
a bug. Filtered flow signals are almost never exactly zero, so the code treated
the boom as moving all the time. The simulated open-centre valve never opened its
bypass, and the pump paid full flow at the boom's holding pressure for 440
seconds. The fix adds a small-flow threshold below which the bypass is taken as
open. We chose it after seeing that run, and it moves the answer more than any
valve figure: from 1.7 times at 0.5 L/min to 1.3 times at 5 L/min. A real
working cycle spends a lot of time at small flows. The step-shaped cycles of
earlier milestones hid this. The next step replaces the threshold with the
bypass-closing curve from a published valve manual.

**Limits.** This is a wheel loader, not an excavator, with one operator and one
record. The open-centre machine is a counterfactual that runs the same pump
through the same motion. The valve pressure drops at this flow are swept, not
sourced. The flows are the dataset authors' estimates from piston velocity.
Nothing was run on a machine. Heavy machines are dangerous, and none of this is
a design or a safety system. Written with AI assistance (Claude Code); the
dataset's authors have not reviewed it.
