---
title: "Loss penalty factors in DC optimal power flow work at full load, if you take them at the right point"
seo_title: "DC OPF loss penalty factors at the AC optimum, IEEE 118-bus"
date: 2026-11-06
tags: [infra-dcopf, research, power-systems]
description: "On the IEEE 118-bus case, loss penalty factors evaluated at the AC optimum cut the DC dispatch's cost excess from 1.5 to 0.37 percent at full load."
---

Does a DC optimal power flow, made to see network losses through nodal penalty factors, order its generators well? Earlier in `infra-dcopf` the answer was mixed: factors taken at a DC dispatch helped at light load and hurt at full load (2.24 % above the AC optimum at 1.1 of load, worse than plain DC's 1.68 %).

I predicted the fault was where the loss sensitivities were measured, not the idea. Measured at the AC optimum and applied once, the AC cost of the dispatch on IEEE 118-bus is 0.367 % above the optimum at the case's load (plain DC 1.479 %) and 0.339 % at 1.1 of load (plain DC 1.678 %). At 0.6 and 0.8 of load the two versions agree.

Caveat: this uses the AC optimum, which a DC planner lacks, so it bounds what factors can do and is not a deployable scheme. One solver (pandapower), one dispatch point per cell; case30 and case39 differences are within 0.1 % and not interpretable. Next: factors from a previous-interval estimate.

Code, table and log: `research/infra-dcopf/`.
