---
title: "Do loss penalty factors fix a DC power-flow dispatch? Only at light load"
seo_title: "Do loss penalty factors fix a DC power-flow dispatch?"
date: 2026-11-04
description: "On the IEEE 118-bus case, charging each generator for the losses it causes helped at 60 to 80 % load and hurt at full load."
tags: [research, infra-dcopf, power-systems]
---

# Do loss penalty factors fix a DC power-flow dispatch?

A DC optimal power flow ignores losses, so it orders generators by their own cost. The textbook repair is a penalty factor per generator, 1/(1 − ∂Loss/∂P). We tried it in `research/infra-dcopf` on IEEE case118 using pandapower, measuring the AC cost of each dispatch against the AC optimum.

At 60 and 80 % of load, penalty factors cut the excess cost from 0.73 and 0.75 % (plain DC) to 0.56 and 0.46 %, better than spreading the losses uniformly (0.64, 0.58 %). At full load they did worse than the uniform share (1.35 against 1.18 %), and at 110 % worse than plain DC (2.24 against 1.68 %). An undamped version blew up to 21 %.

So it is not a free fix. The sensitivities are taken at the DC dispatch, which is itself wrong, and the iteration is only damped, not proven to converge. This is one solver and one dispatch point per cell. The next step is to take the sensitivities at the AC optimum. Code, tests and tables: `research/infra-dcopf/README.md`.
