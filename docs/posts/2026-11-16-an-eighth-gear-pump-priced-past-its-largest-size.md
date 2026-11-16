---
title: "A gear pump too small for the job still lands on the excavator rule"
seo_title: "Gear pump vs load-sensing: an 8th family priced past its size"
date: 2026-11-16
tags: [heavy-hydraulics, research, gear-pump, excavator]
description: "Rexroth's AZPF stops at 59 L/min, so most pumps the rule prices are sizes it doesn't make. It still crosses 0.0008 from the seven-family rule."
---

The heavy-hydraulics programme asks when a small excavator burns less fuel with a cheap fixed gear pump than with a load-sensing pump. Over seven pump families the answer has come down to two numbers from the pump's data sheet: its overall efficiency at 150 bar and 85 L/min, and its idle drag. Over our 384 machine geometries, the efficiency at which the fixed pump wins half the time is about E<sub>50</sub> = 0.824 + 0.018 × (drag kW − 3.57).

That rule has one weak spot. When a family's largest pump gives less than 85 L/min, the model can't read the pump at the index point. It holds the largest size's efficiency map and scales its drag up to the flow needed. The last run moved the index code onto that same reading, but only one family (the AZPN, at 75.6 L/min) had ever been priced that way, and only for a short way past its end.

This run tests that reading where it carries the whole answer. Rexroth's AZPF "High Performance" pumps run from 4 to 28 cm³/r (data sheet RE 10089). At 2100 r/min the largest gives 58.9 L/min, so 77% of the pump sizes the fuel optimum can choose (10 to 219 L/min) are bigger than anything in the family. We digitised the curves from the PDF's vector paths, then wrote six predictions in the log before computing any efficiency from them.

- The AZPF crosses at **0.8075**. The seven-family rule says **0.8067**, an error of 0.0008. Efficiency alone (one number) misses by 0.0060.
- The answer doesn't hinge on which size is held. Read with size 25 as the largest, it crosses at 0.8052 and the rule's error is 0.0010.
- Its index is 0.910 (size 28 at 150 bar). Across the family, efficiency rises from 0.81 on the smallest pump to about 0.91 on the largest. Drag per L/min falls about threefold over the same range.
- Its idle drag at 85 L/min is 2.61 kW, inside the range the other seven families already span. We had given 45% to it falling outside that range, and it didn't.
- Refitted on all 64 shape-by-drag cells, the rule is 0.8238 + 0.0177 (kW − 3.57). Leave each of the eight families out in turn and the RMS error is 0.0022, against 0.0113 for one number.

Five of the six predictions held. The one that failed matters most for the paper. Drag at the index point still sits between 2.45 and 3.64 kW in all eight families, so the slope still rests mostly on the gap between two clusters. The next family worth reading is one well outside that band. A second open point: a builder who needs 85 L/min from this family would spin a size 28 faster, up to its rated 3000 r/min, and the model doesn't price that yet.

Code, data and the full log are in [`research/heavy-hydraulics`](https://github.com/duncan-haywood/oss-monorepo/tree/main/research/heavy-hydraulics) (`experiments/gear_pump_eight.py`, "Milestone 7a" in `LOG.md`). The pump curves are typical catalogue curves read from a manufacturer's data sheet, not tests of individual units.
