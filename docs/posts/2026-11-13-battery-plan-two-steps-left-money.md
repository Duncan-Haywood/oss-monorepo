---
title: "Planning a battery in two steps left 5 to 7% of the saving on the table"
seo_title: "Battery peak shaving vs arbitrage: the two-step gap, measured"
date: 2026-11-13
tags: [energy, batteries, optimisation, demand-charges]
description: "On 57 real building-months, planning demand caps first and energy second got 93-95% of the optimal battery saving under TOU rates. An exact LP now closes it."
---

The [Demand Charge Interval Analyzer](https://marisstella.app/demand-charge-interval-analyzer/) plans a battery for a business that pays both a demand charge (dollars per kW of its worst 15 minutes) and time-of-use energy prices. Until today it did that in two steps: first find the lowest demand caps the battery can hold, then, inside those caps, use a dynamic programme to charge cheap and discharge dear. Its README said plainly that this "is not a joint optimum". Nobody had measured how far off it was.

## The measurement

I took real 15-minute grid-import data from Open Power System Data's household data package: three small industrial sites and two public buildings in Konstanz, Germany (CC BY 4.0). 57 building-months had every reading. Each month was run under three illustrative tariffs (not any utility's) and four battery sizes, 684 cases in all, and solved two ways: by the tool's plan, and exactly, as one linear programme in HiGHS.

| Tariff | Share of the optimal saving the two-step plan got | Worst month, as % of that month's bill |
|---|---|---|
| Demand-heavy: $15/kW, flat energy | 100.0% | 0.02% |
| Two demand charges, $0.20 / $0.10 energy | 94.6% | 2.41% |
| Energy-heavy: $4 + $4 /kW, $0.35 / $0.10 energy | 93.4% | 7.94% |

With flat energy prices the two-step plan is optimal, as it should be: holding the lowest cap is the whole problem, and the greedy controller solves that exactly. Once energy prices vary by hour, it left 5 to 7% of the achievable saving unclaimed, and in 78 of 456 time-of-use cases more than 1% of the month's bill.

## Where the money went

Two places. The first is the order of the steps. On one industrial site in May 2016 (energy-heavy tariff, a 41 kW / 82 kWh battery), the lowest caps the battery could hold were 25.3 kW facility and 20.2 kW on-peak. The optimum instead lets the facility peak rise to 34.6 kW, because a battery not held in reserve for that peak can discharge through the whole on-peak window, and the on-peak energy it displaces is worth more than the extra demand charge. A plan that fixes the caps first can never find that trade.

The second is resolution. The dynamic programme splits the battery's charge into about ten steps per interval of inverter power. In the 20 worst cases, running it at the optimal caps still left 0.3 to 3.4% of the bill; at four times the resolution, 0.1 to 0.9%.

## The fix

The tool now also solves each month as one linear programme, in the browser, with no library. It is a Mehrotra predictor-corrector interior-point method. The month's constraints are a chain in time, so with rows in time order the normal equations are a banded matrix (bandwidth 4) and factor in linear time. The two demand caps touch every interval, so they are kept out of the band and folded back in with the Sherman-Morrison-Woodbury identity. A month of 15-minute data is about 17,000 variables and 12,000 constraints; it takes 0.1 to 0.5 seconds in Node.

The dispatch it returns is re-simulated inside the battery's limits before it is billed, so a solve that stopped short could only make the plan worse, never misreport it. On the same 684 cases the tool's plan now matches HiGHS to within 3 cents a month, and the joint plan is the one shown in 559 of them; in the other 125 plain peak shaving ties it.

## What it does not tell you

These are perfect-foresight upper bounds: the tool knows the month's load in advance. Each month is still optimised alone and the ratchet applied afterwards. The tariffs are illustrative and the buildings are German sites billed as if on a US-style tariff. The code, data download script and both result files are in [`ventures/demand-charge-interval-analyzer/check/`](../../ventures/demand-charge-interval-analyzer/check/).
