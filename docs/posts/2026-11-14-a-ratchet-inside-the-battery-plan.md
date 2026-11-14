---
title: "A ratchet inside the battery plan: worth 0.8% of the saving, and now exact"
seo_title: "Demand ratchet and battery dispatch: whole-year LP vs month by month"
date: 2026-11-14
tags: [demand-charges, batteries, optimisation, energy]
description: "Planning a battery month by month under an 80% demand ratchet left up to $660 a year on the table. One whole-year linear programme closes the gap to within $2.29 of HiGHS on 72 building-years."
---

The [Demand Charge Interval Analyzer](https://marisstella.app/demand-charge-interval-analyzer/) plans a battery against your own 15-minute meter data. Until today it planned each month alone and applied the demand ratchet afterwards. A ratchet bills at least a set share, often 80%, of the highest peak in the previous 11 months. That makes the months depend on each other, and planning them one at a time misses two things.

- **A month the floor already bills.** If June's peak puts an 80% floor on July, any facility kW July shaves below that floor saves nothing. The month-alone plan still holds battery energy back to shave July's peak, energy that could have been sold at the on-peak price.
- **A month that sets later floors.** Shaving the summer peak lowers up to 11 later bills, not just its own.

## The change

When the ratchet floor sets a month's bill in the month-by-month plan, the tool now also solves the whole period as one linear programme. Each month keeps the block it already had: battery full at the start of the month, refilled at the cheapest price at the end, no export, inverter and energy limits. The months are tied together only through billed demand: billed ≥ the month's own cap, and billed ≥ 80% of each cap in the 11 months before. The tool keeps whichever plan bills less over the year.

It runs on the same dependency-free interior-point solver as the monthly plan. Each month's two caps and its billed demand become dense columns, folded in with the Woodbury identity, so a year of 15-minute data comes to about 120,000 constraint rows with a band of 4.

If no floor binds, the year is not solved at all, and that is exact. A month is never billed below its own peak, so the year's bill can't be lower than the sum of each month's best bill alone, and the month-by-month plan already reaches that sum.

## Measured

Twelve full-year buildings came from NREL's ComStock dataset: six building types in Texas and Colorado, chosen by a fixed rule. These are EnergyPlus simulations on real 2018 weather, not meters. Each was run under three illustrative tariffs with an 80% ratchet and two battery sizes, 72 building-years in all, and each was also solved exactly by HiGHS as an independent check.

| Tariff | Month by month captures | Worst case above optimum | Shipped plan, worst case |
|---|---|---|---|
| Demand-heavy ($15/kW, flat energy) | 99.5% of the optimal saving | 0.12% of the yearly bill | $2.29 a year |
| Both demand charges | 99.3% | 0.56% | $0.82 a year |
| Energy-heavy (wide on/off spread) | 99.0% | 0.56% | $0.42 a year |

So month-by-month planning was already good. In total the new plan recovers $4,154 a year out of the $544,080 that the optimal plans save across the 72 cases. The largest single gain is $660 a year, for a standalone retail store in Texas with both demand charges. That is a refinement, not a new answer, but the tool can now say its plan is optimal for the model rather than close to it. The price is time: a year with a binding ratchet takes about 10 seconds more in the browser, and the page now shows a working message while it runs.

## Not checked

No metered building with a real ratchet. No real tariff's fine print: some ratchets count only summer peaks or use a different window. The method, scripts and results are in the venture's [README](../../ventures/demand-charge-interval-analyzer/README.md) and `check/ratchet_gap.py`.
