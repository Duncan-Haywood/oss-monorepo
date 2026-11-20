---
title: "One summer window overstated battery savings by 56% under one real rate and understated them 18% under another"
seo_title: "Battery savings on a real utility rate (URDB) vs one window"
date: 2026-11-20
tags: [ventures, energy, demand-charges, batteries, linear-programming, urdb]
description: "The demand charge analyzer now reads real utility rates from OpenEI's URDB. A single summer window misjudged battery savings: 56% high (SCE), 18% low (Entergy)."
---

The [demand charge interval analyzer](https://marisstella.app/demand-charge-interval-analyzer/) plans a battery against a business's own 15-minute readings. Until today its time-of-use inputs were one on-peak window, used all year. Real commercial rates are rarely that simple. They have summer and winter seasons, mid-peak and on-peak periods, a separate demand charge for each period, an all-hours demand charge that can change with the season, riders and a fixed charge.

**What changed.** Most US utility rates are already written down in that detail, as data, in OpenEI's free [Utility Rate Database](https://apps.openei.org/USURDB/). The page now takes a rate's JSON from there, pasted or opened as a file. It reads the energy and demand schedules (12 months by 24 hours, weekday and weekend), the price of each period including riders, the seasonal all-hours charge, the demand window and the fixed charge. Holidays are optional (none, NERC's six or the eleven federal ones). It prices the bill period by period and month by month. The battery is planned by the page's own linear-programme solver, now with a separate demand cap for every period that occurs in the month. Anything the page does not model is listed on the page rather than quietly dropped: tiers past the first, kVA charges, coincident system-peak charges and voltage discounts.

**Is the plan right?** We took twelve simulated buildings from NREL's ComStock (six building types each in California and Arkansas, a year of 15-minute load on real 2018 weather) and two real rates from the database. These are old versions: Southern California Edison's GS-2 TOU option B from 2015, and Entergy Arkansas's Large Power Service TOU from 2018. Each building got two battery sizes, which gives 288 building-months. We also solved every month as a linear programme with the HiGHS solver. The page's plan was never more than $0.29 above HiGHS in any month (that month was a school's $51,173 July bill). The median gap was half a cent.

**What the shortcut would have said.** For each rate we built the single window a person would type from its summer section: the July weekday hours of the most expensive demand period, its rate, the all-hours rate and the energy prices at the start of the window and at 3 a.m. We then compared the battery savings the old page gives under that window with the savings under the full rate.

| Rate (12 building-years each) | Saving claimed with one window | Saving under the real rate | Error |
|---|---|---|---|
| SCE GS-2 TOU-B (2015), California buildings | $137,803 a year | $88,405 a year | +56% (every case over, by 40-60%) |
| Entergy Arkansas LPS-TOU (2018), Arkansas buildings | $80,786 a year | $98,688 a year | -18% (10 of 12 under, worst by 39%) |

The two rates go wrong in opposite directions, for reasons you can read off the tariff sheet. SCE's winter months have no time-of-use demand charge, so a summer window used all year charges the battery's best work in months that do not pay for it. Entergy charges for demand in every hour: an on-peak charge in summer and another in winter, plus off-peak demand charges. A window copied from summer misses most of that, so it undercounts what the battery saves. Under both rates almost all of the saving was demand rather than energy (91% under SCE, all of it under Entergy). The demand periods are therefore exactly the part a simplified tariff gets wrong.

**What this does not show.** The buildings are simulations, not meters, and the two rates are years out of date. A vendor quote also uses its own controller, which does not know next month's load the way this plan does. The result is narrower than any of those questions. Reading the rate as it is written changes the answer by tens of percent, in either direction, so a battery's savings should be priced against the rate on the bill.

Next for the tool: tiered prices, comparing two rates on the same load (the usual first step of a tariff-switch audit), and a real metered building under a current rate. The code, the two test rates and the check script are in [the venture's folder](../../ventures/demand-charge-interval-analyzer/README.md).
