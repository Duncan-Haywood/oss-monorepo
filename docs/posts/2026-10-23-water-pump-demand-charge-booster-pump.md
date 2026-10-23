---
title: "Do demand charges change when a water utility should run its pumps? A Net3 simulation on PG&E's B-19 tariff"
date: 2026-10-23
description: "Billing 21,806 pump schedules on a real demand tariff: the booster's peak drives the bill, and demand charges change the saving's size, not the best schedule."
tags: [water-utilities, energy, demand-charges, simulation, wntr]
---

# Do demand charges change when a water utility should run its pumps?

Utility electricity bills have two parts: energy (kWh, priced by time of day)
and demand (the highest 15-minute kW in the month). A pump scheduler that
only shifts kWh out of peak hours can miss the second part. We simulated it.

**Setup.** EPANET's Net3 example network through WNTR, at a 15-minute
hydraulic step. We simulated all 21,806 schedules of the lake pump with at
most two on-runs a day and billed each on PG&E Schedule B-19 (published
rates, effective March 2026, secondary voltage), with the tanks back to
within 0.1 % of a day's demand.

**Result.** Net3's shipped schedule peaks at 373 kW because a 310 kW booster
pump runs whenever tank 1 is low. Demand charges are 60 to 64 % of its
monthly bill. Running the lake pump nearly all day keeps the tank full,
idles the booster and cuts the peak to 63 kW: the bill falls 56 to 67 %
depending on season (62.5 % over a year). The schedule that minimises energy
cost and the one that minimises the full bill are the same, and stay the
same when we scale the demand rates from 0 to 20 times. Demand charges make
the saving bigger (39 % at no demand charge, 65 % at twenty times) but do
not change the answer.

**Caveats.** Net3 is a teaching network with an unusual gravity river
source; B-19 is mandatory above 499 kW so this is what the tariff would
charge, not a tariff a utility this small is on; list prices only; one
repeated day. Not operating advice.

Code, numbers and limits: [`research/infra-pumpdemand`](../../research/infra-pumpdemand/README.md).
