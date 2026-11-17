---
title: "A control series made the test sharper, and its placebo dates fired"
seo_title: "Comparative interrupted time series: a control and its placebos"
date: 2026-11-17
tags: [changepoint-detection, statistics, interrupted-time-series, pre-registration]
description: "Subtracting a control series kept a date test calibrated in simulation and tripled its power. On the 1983 seat-belt data, 3 of 3 placebo dates fired."
---

The [changepoint detector](https://marisstella.app/changepoint-detector/) can test a date you name, such as a law or a launch, for a step or a change of slope. Its weak spot is series that wander. A shared wander, or a trend change that hits everything at once, looks like an effect at your date. The standard fix is a control series: something the change should not touch. You test the difference between the two series, or their ratio on logs.

I pre-registered that fix before running it, with the pass marks written down first. It met every simulation bar and then failed a placebo check on real data. So it did not ship.

## The simulations

Each simulated pair shared a common part: a sticky AR(1) process or a random walk, sometimes with a shared step or slope change at the date. The pass marks were run on fresh seeds:

- **No real change.** The test on the difference flagged 3.3 to 7.8% of pairs at p 0.05. The treated series alone flagged 5.5 to 22.6%, and where the common part was a walk it refused most of them.
- **A real 2 sd step in the treated series only.** The difference found it 55.8, 52.3 and 10.5% of the time in the three power cells. The series alone found it 10.8, 19.8 and 4.3%.

A second version put the control in as a regressor with its own coefficient. It failed during exploration. The control's own noise shrinks the coefficient, so a shared slope change leaks through, and it flagged 18% of no-change pairs.

## The seat belts

The UK front-seat belt law of 31 January 1983 is the classic case. Rear-seat passengers were not covered, so they are the control. Without the control, drivers show a 21% step and a slope change, and the slope change is shared by all three series. With the control, the slope change goes away (p 0.95) and the step is a 24% fall in drivers relative to rear-seat passengers (95% range 18 to 30%).

The placebo check was the bar that mattered. I ran the same test on the rows before the law at 1974, 1977 and 1980, where nothing should show. All three fired (joint p 0.018, 0.003, 0.002).

## Why

Looking afterwards, not pre-registered, I found three causes:

- **1974 was a bad placebo.** The 1973-74 fuel crisis is a real step in every one of these series.
- **The ratio is far quieter than either series.** Its lag-one autocorrelation is about 0 against 0.3 to 0.5 for drivers alone, so the test is much sharper.
- **The ratio's trend is not straight.** It bends slowly over 14 years. Drivers alone hide that bend in their noise (p 0.81 and 0.83 at the 1977 and 1980 placebos). The quiet ratio shows it.

The slope term carried every rejection. The placebo steps were small and none reached p 0.05.

## What is next

A control removes shared shocks, and then the baseline has to be right as well. The next round will be pre-registered on real pairs not seen here. It will put an in-time placebo check beside the test, refusing or warning when earlier dates fire, or it will test only the step against the control.

Everything is in the [README](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/ventures/changepoint-detector) under "A control series", with the pre-registration and every output file in `eval/`.
