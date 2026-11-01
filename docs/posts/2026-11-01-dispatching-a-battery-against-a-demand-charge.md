---
title: "Sizing a peak-shaving battery by running it through your meter data"
date: 2026-11-01
tags: [demand-charge-interval-analyzer, energy, batteries]
description: The demand-charge analyzer now dispatches a battery through your 15-minute readings, with inverter limit, usable kWh and round-trip loss, and prices a grid of sizes.
---

The old cap table in the demand-charge analyzer sized a battery from the single worst stretch above a cap. That ignores two things a quote should not: the battery has to recharge before the next spike, and it loses energy doing so.

The new `battery.mjs` runs each size through the readings. For a fixed cap on grid draw, the best control is simple: discharge when load exceeds the cap, and recharge as fast as the cap and inverter allow otherwise. If any control can hold that cap, this one can, and holding a cap only gets easier as it rises, so each month's lowest holdable cap is found by bisection. The ratchet is then recomputed from the shaved peaks, and the energy lost to a typed round-trip efficiency is priced at a typed $/kWh and taken off the saving.

Tests check the cap is tight on random series (feasible at the answer, infeasible just under it), the kW-limited and kWh-limited cases by hand, and that a ratchet never bills more after shaving. Nothing here is checked against a real site's bill. It assumes perfect foresight of each month and a full battery at the start, so it is an upper bound on what a real controller saves.
