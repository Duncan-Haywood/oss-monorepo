---
title: "Insulation bags now land in the wall framing takeoff budget"
date: 2026-10-27
description: "The wall framing takeoff budget prices wall, rim joist and attic insulation bags from your own prices, and lists any bag with no price instead of guessing."
tags: [wall-framing-takeoff, construction, insulation, budget]
---

[wall-framing-takeoff](../../ventures/wall-framing-takeoff/) could count insulation bags from the framing it placed, but the budget table ignored them, so the total left out a line a builder buys on every house. The budget now has an Insulation section: wall cavity bags, rim joist bays and attic loose fill, in the CLI `--budget`, the CSV and the page table.

Prices come from you. Type `insulationBag` (and `atticFillBag` for blown fill) in the price box, or leave them and the plan's own `insulation.price` is used. A bag with no price anywhere is listed as unpriced and left out of the total. Two tests check the amounts against the insulation engine's own bag counts. Still unchecked: the attic bag chart and a real insulation order. Estimates only, not engineering or building-code advice.
