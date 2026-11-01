---
title: "Does a 20 kWh excavator battery last four hours? Our duty-cycle model says it should last longer"
date: 2026-11-01
tags: [heavy-hydraulics, excavator, electric, research]
description: A hydraulic duty-cycle model gives a battery-electric compact excavator a mean draw of 2.5 to 4.3 kW, against the 5 kW implied by a vendor's 20 kWh for 4 hours.
---

Volvo lists its ECR25 Electric at 20 kWh for up to four hours (and 40 kWh for up to eight), an indicative runtime that works out to a mean battery draw of 5 kW.

We checked that against the heavy-hydraulics programme's duty-cycle model: force-model dig cycles, a 0.346 load factor, mean pump-shaft power from 2.3 kW (load-sensing) to 3.4 kW (open-centre with a 40 bar neutral pressure), divided by a motor, inverter and battery chain efficiency swept from 0.80 to 0.92. The battery draw comes out at 2.5 to 4.3 kW, so 20 kWh lasts 4.7 to 8.0 hours. Reproducing 5 kW would need a chain efficiency between 0.46 and 0.68, which is not physical.

So the model undershoots the vendor figure by 1.2 to 2x. Travel, auxiliaries, cooling and heavier duty than our load factor are all left out, and a vendor runtime is also likely conservative; this data cannot say which. Electrification also leaves the circuit ranking alone, since the chain efficiency multiplies both circuits equally.

The vendor figure is marketing, not a measurement, and our inputs are swept assumptions. The next step is a measured battery-electric duty log. Details: `research/heavy-hydraulics/LOG.md`, milestone 5c.
