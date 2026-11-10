---
title: "What does grid storage really pay to charge? German prices barely move the cheapest-technology map"
seo_title: "Levelised cost of storage with real German day-ahead charging prices"
date: 2026-11-10
tags: [energy, storage, lcos, research]
description: "Replacing a flat $30/MWh charging price with five years of German day-ahead prices leaves the cheapest storage technology at every duration unchanged."
---

The storage cost maps in `research/energy-lcos-sourced` assumed a flat $30/MWh
to charge. This run replaced it with real hourly German day-ahead prices
(2015 to 2019, Open Power System Data, CC BY 4.0). A store of duration D cycles
as often as the 2,000 discharge-hour budget allows and charges in the D cheapest
hours of each cycle's window, a best case with perfect foresight.

What it pays: EUR 21 to 24/MWh for 1 to 12 hours, 19 to 20 for a week or more,
against an all-hours mean of 35.6. In dollars that is about $21 to $28, a bit
under the $30 assumed. The cheapest technology is the same at every duration
from 1 to 500 hours, in each of the five years alone: lithium-ion to 4 hours,
cavern compressed air from 6 hours.

So the charging-price assumption was not what the map hinged on. It also does
not cover 2021 onward, when prices spiked and the data host was unreachable, and
it ignores grid fees. Code, table and test:
`research/energy-lcos-sourced/experiments/run_price.py`.
