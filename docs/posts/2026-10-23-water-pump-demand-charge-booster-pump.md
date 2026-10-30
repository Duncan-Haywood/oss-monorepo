---
title: "Do demand charges change when a water utility should run its pumps? A Net3 simulation on PG&E's B-19 tariff"
seo_title: "Do demand charges change when a water utility should run its pumps?"
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
repeated day (see the follow-up below). Not operating advice.

Code, numbers and limits: [`research/infra-pumpdemand`](../../research/infra-pumpdemand/README.md).

## Follow-up: one hot day

The caveat "one repeated day" matters, because a demand charge is set by the
highest 15-minute kW of the month. We re-simulated all 21,806 schedules with
every Net3 demand scaled by 0.8 to 1.6 and billed 30-day months with one,
three or ten high days. With demand just 1.5 % above Net3's shipped level the
lowest feasible peak among one-run schedules jumps from 63 kW to 310 kW (the
booster), and at +20 % it is 372 kW, level with the shipped schedule. A month
with three days at +20 % saves 43.5 % in summer and about 19 % in winter and
spring, against 56, 66 and 67 % with identical days. Each day is simulated
as periodic, which overstates how soon the booster is needed; carrying tank
levels between days is the next step. Numbers and limits:
[`research/infra-pumpdays`](../../research/infra-pumpdays/README.md).
