---
title: "Open-centre excavator valves cost cycle time, not only energy"
date: 2026-10-30
tags: [heavy-hydraulics, hydraulics, excavator, simulation]
description: "A steady-state flow-sharing model slows the dig phase of an open-centre parallel valve by a median 6.4% when two actuators move at unequal pressure."
---

The [heavy-hydraulics programme](https://duncan-haywood.github.io/oss-monorepo/research/heavy-hydraulics/) has compared excavator circuits on shaft energy for a dozen steps. This step adds the other half, cycle time.

**Model.** Each valve section is an orifice sized to pass its demanded flow alone. A centre bypass closes as sections open. With both dig actuators open, the supply pressure settles where the 45 L/min pump flow is used up, and the lighter actuator takes more than it was sized for. We ran this over 5,000 random cycles with a neutral drop of 10.9 bar (read from a Danfoss PVG 32 curve) and 1.44 bar (a catalogue valve).

**Result.** At 10.9 bar the cycle takes a median 6.4% longer (95th percentile 21.6%, which is the cap we set). At 1.44 bar it is worse, because the free bypass leaves little pressure to move the heavy actuator. We predicted a median under 2%, and that was wrong.

**Limits.** No operator feathering, sections sized alone, a linear bypass closure, and a stall charged at a factor-2 bound, so treat the direction as the finding, not the figure. Load-sensing is 1.0 by construction until a compensator model exists. Code, 3 tests and the log are in `research/heavy-hydraulics`.
