---
title: "The cheapest Texas plan at 1,000 kWh was the dearest for most homes we billed"
seo_title: "Texas electricity bill credits: 1,000 kWh price vs your real cost"
date: 2026-11-14
tags: [texas-electricity-plan-checker, ventures, energy, consumers]
description: "We billed 200 simulated Texas homes on three example plans. The one with the lowest 1,000 kWh price was the cheapest for 54 and the dearest for 138."
---

Every retail electricity plan in the competitive parts of Texas carries an Electricity Facts Label with three average prices: at 500, 1,000 and 2,000 kWh a month. Plan lists sort by the middle one. A plan can be built to look cheap at exactly that point. Give it a high energy charge and a large bill credit that pays only between 1,000 and 2,000 kWh, and the 1,000 kWh average drops to half its neighbours'.

Whether that plan is cheap *for you* depends on how many of your months land inside the band. The new [Texas electricity plan checker](https://marisstella.app/texas-electricity-plan-checker/) answers that directly. Paste each plan's label text and your Smart Meter Texas download, and it bills every one of your months on every plan.

## The label checks itself

Copying text out of a PDF is fragile, so the checker never trusts its own reading. From the terms it has read, it recomputes the label's three average prices. A label rounds to a tenth of a cent, so correct terms land within about 0.05 cents of each. A credit misread as $100 instead of $125 misses the 1,000 kWh price by 2.5 cents and shows up as a mismatch, not as a quietly wrong ranking.

The three prices also tell you something before you open the label. A plan with no credit or tier costs a fixed amount plus a rate per kWh, so its three points sit on one line. Draw the line through the 500 and 2,000 kWh bills. If the 1,000 kWh bill falls well below it, something pays out near 1,000 kWh. The tool does that arithmetic for prices typed straight from a plan list.

## 200 homes, three plans

We wanted to know how far the 1,000 kWh price can mislead for realistic Texas usage. So we took 200 homes from NREL's End-Use Load Profiles: ResStock building simulations under 2018 weather, calibrated to the housing stock, from Harris, Fort Bend, Dallas, Tarrant and Collin counties. These are simulations, not meters. We billed each home's year on the tool's three example plans, which are invented but follow the label's layout and share the same placeholder delivery charges:

| Example plan | Label 1,000 kWh | Cheapest for | Dearest for |
|---|---|---|---|
| A: flat 9.1¢ + $9.95 base | 16.0¢ | 89 homes | 44 |
| B: 14.6¢, $125 credit at 1,000-2,000 kWh | 8.1¢ | 54 homes | 138 |
| C: 8.2¢ to 1,000 kWh, 12.9¢ above, $9.95 fee under 1,000 | 14.2¢ | 57 homes | 18 |

The plan that looks cheapest by half was the dearest of the three for 138 of the 200 homes. Its band caught only 37.5% of all home-months. Texas homes swing from mild-month lows under 1,000 kWh (44.9% of home-months) to August highs over 2,000 (17.5%), and the median home collected the credit in 4.5 of its 12 months. Picking B by its label price cost a home a median $241 a year against the cheapest of the three on its own usage, and $649 at the 90th percentile. Multiplying the 1,000 kWh price by a year's kWh underestimated B's real cost by a median $1,178.

Free-nights plans have the same problem from the other side. The median home used 30.8% of its electricity between 9 p.m. and 6 a.m. (26.9% to 35.0% from the 10th to the 90th percentile). With the same base and delivery charges, a free-nights plan beats a flat 9.1¢ energy rate only if its daytime rate is under 9.1 / (1 − 0.308), about 13.2¢.

## What this does and does not say

It says three label prices leave a lot out for a realistic spread of Texas usage. It says nothing about any real plan's price, and a simulated home is not your meter. The scripts that fetch the homes and bill them are in the venture's [`check/`](https://github.com/duncan-haywood/oss-monorepo/tree/main/ventures/texas-electricity-plan-checker/check) folder, and the saved output is tested to match what they print.

Not yet checked: a real provider's EFL PDF copied through a browser (none could be fetched from the session that built this, so the reader's tests use labels written in the same layout), and a real Smart Meter Texas file. If you try it on yours and the label check disagrees, that is exactly the report we want.
