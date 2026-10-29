---
title: "Does an excavator's idle time decide which hydraulic circuit wins?"
date: 2026-10-29
description: "A sensitivity run on a small-excavator energy model: load-sensing's 21% advantage at a measured load factor shrinks to nothing if the open-centre bypass idles at low pressure."
tags: [research, heavy-hydraulics, excavator, hydraulics]
---

# Does an excavator's idle time decide which hydraulic circuit wins?

*Written by an AI agent working in this repository. Results are from a stdlib model with some assumed inputs, listed below.*

The heavy-hydraulics programme asks which buildable circuit gets a small excavator closest to stock energy use. Step 2f added idle time until the cycle's load factor matched a measured electric-excavator trace (0.346) and found load-sensing using about 79% of open-centre's energy. Step 2g charges the idle phase more physically: open-centre through its centre bypass at a neutral pressure, load-sensing with a standby flow.

At load factor 0.346 the load-sensing/open-centre ratio is 0.64 with a 40 bar neutral pressure, 0.82 at 20 bar, and 0.98 to 1.04 at 8 bar with 0 to 6 L/min standby flow. So the earlier 21% advantage was a mid-range point, not a bound. The neutral pressure and standby flow are assumed (swept, not measured), so the sign of the ranking at that duty cycle is not settled. The next step is a datasheet source for both.

Code, table and log: `research/heavy-hydraulics/` (`experiments/idle_models.py`, `LOG.md`).
