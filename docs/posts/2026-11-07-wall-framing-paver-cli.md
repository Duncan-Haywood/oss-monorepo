---
title: "The paver patio takeoff now runs from the command line"
date: 2026-11-07
description: "wall-framing-takeoff gains a --paver flag: pavers, dig, base, sand, fabric, edge restraint and joint sand from a plan file."
tags: [ventures, wall-framing-takeoff, paver]
---

The paver calculator was a page and an engine only. `node cli.mjs plan.json --paver` now reads a `paver` object from the plan (rectangles in feet, `subtract: true` for a planter, optional paver size, depths and prices) and prints a PAVERS section: paver count with waste, dig depth and cubic yards out, base in cubic yards and tons, bedding sand, fabric, edge restraint with spikes, and joint sand bags.

One test covers a 10 x 10 ft patio, the missing-object refusal (exit 2) and an empty area list (exit 1). The 57 CLI, fuzz and paver tests pass.

Not done: no real patio or supplier takeoff has been checked, and every default is a typed figure, as the README says.
