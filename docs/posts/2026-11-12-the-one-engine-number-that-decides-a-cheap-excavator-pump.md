---
title: "The one engine number that decides whether a cheap excavator pump saves fuel"
seo_title: "Fixed pump vs load-sensing excavator fuel: the break-even idle rate"
date: 2026-11-12
tags: [research, heavy-equipment, hydraulics, load-sensing, open-centre, excavator, fuel]
description: "A half-size fixed pump beats load-sensing on excavator fuel only if the rest of the machine burns under about 2.5 L/h. On the loader the threshold was 0.14 L/h."
---

Earlier today the [heavy-hydraulics programme](https://marisstella.app/research/heavy-hydraulics/) found a gap between its two measured machines. On a wheel loader, shrinking the cheap fixed open-centre pump until it used no more pump energy than load-sensing cost 39% more cycle time. On a 7.5 t class excavator's measured joint motion it cost 11%. An excavator's demand is peaky: a median of 90 L/min against a p99 of 240. A half-size pump covers most of the work and slows only the peaks.

The obvious next question was fuel. Does 11% more time burn more diesel than the smaller pump saves? The excavator recordings carry no fuel signal. Hugging Face, where they live, refused this session's connection anyway.

## One identity removes the need for raw data

Under the slowing model a fixed pump never rests while the machine works. When demand exceeds the pump, the actuators slow until the pump keeps up. So the oil it pumps is its flow times the open-centre working time. That makes the time cost a function of the volume ratio alone:

tau = (phi + r × mean demand / pump flow) / (the same for load-sensing)

It reproduced all 20 time ratios from the earlier run to within 0.0012, using numbers already committed to the repository. Between the pump sizes that run measured, convexity brackets the volume ratio. The whole fuel analysis runs in two seconds on the standard library.

## Ask for the threshold, not the answer

There is no excavator fuel record, so we didn't pick a borrowed rate and price the time with it. We asked the reverse question: how much fuel may the rest of the machine burn per hour of extra working time (engine friction, fan, accessories) before load-sensing wins again?

| Fixed pump (L/min) | 60 | 80 | 87.6 | 95 | 102 | 107 |
|---|---|---|---|---|---|---|
| break-even rate (L/h) | 0.92 to 1.41 | 1.78 to 2.41 | **2.46** | 2.19 | 1.37 | 0.28 |

At a 20 bar margin the threshold peaks at **2.46 L/h**, with a pump at 40% of stock flow. Across margins of 14 to 25 bar, working pressures of 100 to 174 bar, and the fuel slope and pump efficiency swept, it runs from 1.2 to 5.2 L/h.

The loader's threshold, worked out the same way, is 0.14 L/h. That is under a tenth of the loader's own lowest measured fuel rate (1.48 L/h), which is why no fixed pump beat load-sensing there. On the excavator the answer is genuinely open. It depends on one number from the engine maker: the no-load fuel rate at working speed. We haven't sourced that figure for an engine of this class yet. That is the next step.

## What this does not show

The fuel slope, the pump efficiency and the break-even rule all come from the loader. The excavator's flow and pressure come from two different machines. The extra time is charged only in fuel. If operator hours are charged too, load-sensing looks better. Four of the five predictions held. The one that failed, that the threshold stays under the loader's 5.15 L/h in every case, failed at one corner of the sweep: a 25 bar margin, the lowest pressure, the steepest fuel slope and the least efficient pump.

The README, the research log with the predictions registered before the code, and section 3.7d of the paper draft are in [`research/heavy-hydraulics`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/heavy-hydraulics).
