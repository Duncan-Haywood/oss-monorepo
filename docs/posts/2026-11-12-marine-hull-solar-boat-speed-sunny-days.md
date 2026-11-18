---
title: "Should a solar boat speed up on sunny days? No, and a perfect forecast makes it worse"
seo_title: "Solar USV speed control: steady speed beats chasing the sun"
date: 2026-11-12
tags: [research, marine-hull]
description: "In 300 simulated one-year missions, a deck-solar survey boat goes further holding speed steady than chasing the sun; a perfect forecast costs 3.6%."
---

A small deck-solar survey boat on a year-long mission decides each day how fast to go. Earlier steps of the marine-hull programme gave it a battery target that keeps the payload powered through winter. Even with that target, a plan that knows the whole year's sun in advance still covers about 10% more distance than the boat's causal rule. We'd assumed the difference was timing: a planner with foresight spends hard on sunny days.

This step tested that assumption, and it was wrong.

We split the foresight plan's advantage into two parts. One is energy: does it get to spend more, by wasting less sun at a full battery or ending the year with an empty one? The other is timing: how far it gets per unit of energy compared with spending that energy at a perfectly steady rate. Before running anything we wrote down seven predictions. Most of them assumed the energy part would dominate.

It doesn't. When the foresight plan has to finish the year with the same half-full battery as the rule, it spends only **0.5% more** propulsion energy, yet it goes about 10% further. Almost all of its edge comes from spending **more evenly**. The rule gets 0.75 km for each kilometre that perfectly steady spending would give, and foresight gets 0.82. In the tropics foresight reaches 0.99. Sun lost to a full battery is 0.13% of the harvest, so recapturing it gains 0.2%.

The reason is drag. Power rises much faster than speed, so going fast on a sunny day and slow on a dull one covers less ground than holding a steady pace on the same energy (Jensen's inequality). Rules that track the weather more closely did worse, as that predicts. Using yesterday's sun cost 4.6% of the distance. A **perfect** one-day-ahead sun forecast cost 3.6% and added half again to the payload's dark hours. Two of our seven predictions held.

After reading those results we tried the opposite: plan power from the *average* sun for that day of the year, the same climatology the battery target already uses, and let the battery level correct the rest. Over the same 300 missions that rule covered 2.2% more distance and had **0.27 times** the avoidable payload downtime. It did better on both counts. With slower battery feedback (30 days instead of 10) it covered 5% more distance for about the same downtime, which closes half the gap to foresight. These variants were picked after seeing the data, so they are in-sample results. The next step is a held-out test on years the rule never saw, as we did for the battery target in 6zm.

All of this is simulation: calm water, daily time steps, NASA POWER sunlight at 30 ocean points for 2015 to 2024, one 4 m boat with a 10 kWh pack and a 30 W payload. Within-day speed control isn't modelled. Code, data, the pre-registered predictions and a bug we fixed before writing this up are in `research/marine-hull/` (milestone 6zn).
