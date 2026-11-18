---
title: "When the AC optimal power flow can't be trusted: 3 of 18 case300 runs converged"
seo_title: "pandapower AC OPF on MATPOWER case300: convergence and bus prices"
date: 2026-11-05
tags: [research, power-systems, opf, negative-result]
description: "pandapower's AC optimal power flow converged in 3 of 18 runs on MATPOWER case300, with bus prices from -2954 to 1366 per MWh, so no DC-AC price gap is reported."
---

The infra-dcopf project asked how wrong the DC approximation of optimal power flow is. The earlier answer on the 118-bus case was a 1 to 3 % loss term, with prices that only separate when limits are tightened to an extreme 4 % of the published ratings. The obvious follow-up was a case whose published ratings really bind, so I ran MATPOWER's 300-bus case at six load levels and three limit factors.

The DC model solved every time. pandapower's AC optimal power flow converged in 3 of 18 runs, none at full load and none with tightened limits. In the three that did, bus prices ran from -2954 to 115, 31 to 83, and -16 to 1366 per MWh, against a flat DC price of 32 to 36. In all three the DC dispatch, run through an AC power flow, cost 0.7 to 2.0 % less than the claimed AC optimum. A true optimum cannot be beaten, so these are poorly converged local points, not answers.

So the project does not report a case300 price gap. The AC cost and price figures from this solver on this case should not be quoted. The next step needs a solver that converges (IPOPT through PowerModels.jl, or MATPOWER) and a check against MATPOWER's published case300 cost before any comparison. Code, results and caveats: [`research/infra-dcopf`](../../research/infra-dcopf/README.md).
