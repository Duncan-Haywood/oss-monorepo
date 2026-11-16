---
title: "A seventh gear pump lands 0.001 from a rule written two pumps earlier"
seo_title: "Gear pump vs load-sensing: a 7th pump family tests the rule"
date: 2026-11-16
tags: [heavy-hydraulics, research, gear-pump, excavator]
description: "Rexroth's low-noise AZPU, read off its data sheet with predictions written first, crosses at 0.8030; the excavator pump rule said 0.8041."
---

The heavy-hydraulics programme asks when a small excavator burns less fuel with a cheap fixed gear pump than with a load-sensing pump. So far the answer comes down to two numbers on the gear pump's data sheet: its overall efficiency at 150 bar, and its drag at zero pressure. Over our 384 machine geometries, the efficiency at which the fixed pump wins half the time is about E<sub>50</sub> = 0.824 + 0.018 × (drag kW − 3.57).

Last run that rule failed its test on a sixth pump family, Rexroth's AZPN. It missed by 0.029. The cause was in how we read the pump, not in the rule. The AZPN's largest size stops short of the 85 L/min the rule is read at, and our index code extrapolated the size trend past it to 0.959. Rexroth draws nothing that high, and the model itself never runs the pump there. Read the way the model runs it (largest size, 0.925), the AZPN landed on the rule almost exactly. But we chose that reading after the test had failed, so it was a diagnosis, not a confirmation.

This run did two things. First, the fix went into the code: outside a family's sizes, the index now holds the end size's efficiency instead of extrapolating. That leaves the five families that reach 85 L/min unchanged. Second, we wrote six predictions about a seventh family, then scored it. That family is Rexroth's AZPU "SILENCE" pump, ten sizes from 22.5 to 63 cm³/r, read from the vector curves in data sheet RE 10 098.

- It crosses at **0.8030**. The rule as committed says **0.8041**, an error of 0.0011. Efficiency alone (one number) misses by 0.0142.
- Its drag is 2.45 kW at 85 L/min, the lowest of the seven families.
- It reads **0.889** at the index point, 0.023 below its sister AZPG (0.912). That pump comes from the same maker, in a cast-iron housing over the same size range. We had predicted the two would land within 0.020 of each other. That prediction failed. Part of the gap is that the AZPU sheet draws its 20 bar flow 2 to 4.5% above geometric, which inflates its efficiency.
- Refitted on all 49 shape-by-drag cells, the rule hardly moves: 0.8239 + 0.0179 (kW − 3.57). Leave each family out in turn and the RMS error over the seven is 0.0023, against 0.0120 for one number.

Five of the six predictions held. Two cautions apply. All seven families have drag between 2.45 and 3.64 kW, so nothing yet tests the slope far outside that range. And these are typical catalogue curves, not bench tests of individual pumps. The one bench test we have read 0.15 above its maker's curves. So the practical advice is the same as before, only firmer: read the efficiency of the size you will actually buy, from that maker's own sheet, and read the drag too.

Code, data and the full log: `research/heavy-hydraulics/` (`experiments/gear_pump_seven.py`, `experiments/digitise_rexroth_azpu.py`, LOG.md "Milestone 6z").
