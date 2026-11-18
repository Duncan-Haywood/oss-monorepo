---
title: "A Wave Glider lost 30% of its speed in an hour, not over a season"
seo_title: "Wave Glider speed loss: fouling ramp or sudden step?"
date: 2026-11-11
tags: [research, marine-hull]
description: "On a 2015 Hawaii mission, most of a Wave Glider's speed loss was one drop on 7 August, confirmed by GPS. A slow decline of about 7% a month came on top of it."
---

The earlier posts in this series followed one fielded Wave Glider, the "Honey Badger", which sailed from Hawaii in 2015. Each time, the same thing got in the way: the vehicle itself slowed by about 30% between July and August, and that mattered more than the sea state. We don't know why it slowed. The usual guess for a vehicle that spends months at sea is biofouling: weed and barnacles on the float and wings. Fouling builds up gradually. A change of mode or thruster setting, damage, or something tangled in the wings would show as a sudden drop. A planner needs to know which it is. A gradual loss means planning on a decay rate and cleaning on a schedule. A sudden one means watching for the drop and inspecting when it comes.

**The test we pre-registered didn't answer the question.** We fixed the rules before running anything: correct each hour's speed for wave height, using only hours within 300 km of a buoy as before, and compare a smooth ramp with a single step. The ramp won narrowly. But that rule leaves no usable days between 13 June and 18 August, because in July the vehicle was more than 900 km from every buoy. So the test couldn't say where a step fell, only that one fell somewhere in a 67-day gap. We should have counted the usable days per month before writing the rules.

**Using every hour (a post-hoc analysis, labelled as such):**

- The step model now beats the ramp clearly (by 15 to 21 BIC). The step falls on 8 August, and a bootstrap puts it between 5 and 10 August.
- Hour by hour, through-water speed falls from 0.63 to 0.51 m/s between 14:00 and 15:00 UTC on 7 August. It then stays near 0.45 m/s for the rest of the mission. Fouling doesn't grow in an hour.
- The GPS track slows too: over-ground speed is 0.76 times its earlier value over the following week. So the vehicle really did slow down; this is not a fault in the water-speed sensor.
- After the step, speed keeps falling slowly, about 0.2 to 0.3% a day, or 7% a month. That decline is the size you'd expect from fouling.
- A drop of the same size on 12 June **reversed itself** after a week.

So the "30% drift" was mainly one event, with a slow decline on top of it. Sudden, partly reversible drops fit a changed setting, a tangle that was later shed, or a fault better than they fit growth. The telemetry has no thruster, mode or power fields, so it can't tell those apart. One hint: the telemetry's reporting rate starts falling in the days after the August drop, from 12 samples an hour to 6 by November. That is what a power-saving schedule would look like. For planning, the earlier finding still holds: a forecast based on the last 24 hours of speed adjusts to a step within a day. A design study, though, should treat steps of about 30% as discrete risks and add a slow loss of about 7% a month, not assume one smooth rate.

Everything here comes from one vehicle on one mission. The event was found by looking at the data, so it hasn't been tested against chance. The pilot's log for 7 August would settle the cause. The code, data, predictions and results file are in `research/marine-hull/` (milestone 6t).

*Written with AI assistance (Claude Code).*
