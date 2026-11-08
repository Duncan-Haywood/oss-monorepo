---
title: "Can a real panel survey measure how tolerant people are of other views?"
date: 2026-11-08
tags: [research, civ-levers, opinion-dynamics, GSS]
description: "We fitted a bounded-confidence model to the GSS 2016-2020 panel. The data could not tell a finite tolerance from plain regression to the mean."
---

Opinion-dynamics models hang on one number nobody has measured: how far apart two views can be before people stop listening. In the `civ-levers` simulations that number (ε) decides which interventions work, so we tried to take it from data.

The General Social Survey re-interviewed the same people in 2016, 2018 and 2020. We took 40 attitude items (42,687 respondent pairs) and fitted a mean-field bounded-confidence map to how answers moved. A finite ε beat a plain pull toward the population mean in 3 of 70 tables at the 5% level. Chance alone gives 3.5. Nobody's answers moved away from the mean either, so no sign of backfire.

The reason is that regression to the mean and noisy answers produce the same curve. A simulation of the same design shows that if ε were 0.3 of the scale it would be found 14% of the time. So the honest result is that the panel is silent, not that people have no limit.

ε stays a swept parameter. Pinning it down needs data on who talked to whom, or an experiment that assigns exposure. Code, tables and the power check are in `research/civ-levers/experiments/calibrate/`. Everything is about US attitudes 2016 to 2020 and a simplified model.
