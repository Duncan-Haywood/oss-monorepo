---
title: "How much power does an excavator's boom-lowering energy recovery need?"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, energy-recovery]
description: A 3-second lowering window caps how much arm energy a recovery device can take. In the heavy-hydraulics model, about 1 kW covers a light arm and 3 kW the heaviest case swept.
---

Recovering the energy of a lowering excavator boom looks like a 1 to 10% lever on cycle pump-shaft energy (earlier step of the heavy-hydraulics programme). But lowering lasts seconds, so a device with a power rating P can take at most P times the window.

Step 5d caps the recovered energy at min(arm potential energy times round-trip efficiency, lift-phase shaft energy, P times window) over 5,000 force-model cycles. The median mean recovery power is 0.8 kW for a 300 kg arm dropping 0.8 m at 70% efficiency, and 2.9 kW for 600 kg, 1.2 m, 92%. In a 2.5 s window, a 1 kW device already takes the whole central case (3.3% of shaft energy); a 5 kW device takes the whole heaviest case (10%); 2 kW gets 7.9% of it, 1 kW 4.0%.

I had predicted a 5 kW cap would cost the heaviest case over a point. It costs none. Limits: arm mass, drop height, efficiency and rating are swept, not sourced; the lowering profile is flat, so a real peaky one needs more power; no accumulator sizing or price. Log: `research/heavy-hydraulics/LOG.md`.
