---
title: "One ton per 500 square feet is too big: a free room-by-room load calculator"
seo_title: "Free room-by-room HVAC load calculator: size a heat pump"
date: 2026-11-11
tags: [construction, hvac, heat-pump, load-calculation, building-science, open-source]
description: "A new open-source tool works out a house's heating and cooling load room by room, with a 24-hour design day from sun position."
---

[Room-by-room HVAC load calculator](../../ventures/hvac-load-calc/) is a new
free tool in the construction set. It answers a question every heat pump quote
raises: how big does the unit actually need to be?

## Why it exists

Many installers still size by rule of thumb, about one ton of cooling per 500
square feet. That number comes from leaky, thinly insulated houses. A house
with R-13 walls, an R-38 attic and low-e windows needs much less. The proper
answer is a load calculation, but the usual software is paid and the method
behind it is not something a homeowner can read. So people either trust the
quote or pay for a report.

This tool uses an open method instead, with every formula on its
[how-it-works page](../../ventures/hvac-load-calc/how-it-works.html):
parallel-path U-values, slab edge loss, air leakage from a blower-door number,
and a 24-hour clear July day. The sun's position comes from latitude and hour,
the light from the ASHRAE 1985 clear-sky model, and the walls see sol-air
temperature through a lag. The attic warms with the sun on the roof. Moisture
comes from the design dew point.

## What the example house shows

The page loads an illustrative 1,800 ft² single-storey ranch on a slab at 36°N
(R-13 walls, R-38 attic, U-0.32 windows, 6 ACH50, ducts in the attic). It is
not a measured house. The engine gives:

- heating: 26,901 Btu/h;
- cooling at the 3 pm peak: 19,732 sensible + 6,569 latent = 26,301 Btu/h,
  2.19 tons, about 820 ft² per ton;
- the rule of thumb would have said 3.6 tons.

The largest single cooling item is not the sun through the glass (3,946 Btu/h)
but people and appliances (4,400). The ducts in the attic add 1,794, more than
all the air leakage. Moving ducts inside the conditioned space is often worth
more than another inch of insulation.

The rooms also peak at different hours. Adding each room's own worst hour
gives 17,910 Btu/h sensible. The same rooms at the house's peak hour give
16,987. The equipment is sized on the second number, and each duct on its
room's own peak.

## What it is not

It is not ACCA Manual J and uses none of ACCA's tables. It leaves out overhang
shading, basements and skylights, and it treats window sun as an instant load.
Many permits need a report from approved software. Use this tool to tell
whether a quote is in the right range, and to ask why if it is not.

Next steps, if people use it: overhang and fin shading from window geometry,
a basement wall model, and a check of the whole-house total against a full
report on a real house (that check is one of the venture's kill criteria).
