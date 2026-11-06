---
title: "How much of a power price gap is losses, not congestion?"
seo_title: "DC vs AC optimal power flow on case300: loss and congestion in nodal prices"
date: 2026-11-06
tags: [infra-dcopf, power-systems, opf]
description: "On the 300-bus test case, losses alone spread nodal prices by 7 to 10 $/MWh, more than three binding line limits do. A DC model sees only the second."
---

A DC optimal power flow ignores losses, so its nodal prices differ across buses only when a line limit binds. The AC answer has both effects. We wanted to know how big each is.

Our earlier solver failed on the 300-bus case in 15 of 18 runs. This time we used PYPOWER's interior-point AC solver and checked it first: it returns 719,725.08 $/h on the unmodified case, the same as MATPOWER's published optimum.

We split the price gap by solving the AC problem with and without line limits. Without limits, prices still spread by 7 to 10 $/MWh from losses alone. With the 3 most loaded lines capped, the congestion part is 1.5 to 5.6 $/MWh, and DC gets it within about 1 $/MWh. With 10 lines capped the congestion part is 25.6 and DC says 6.75.

Caveats: the caps are synthetic (the case's own ratings never bind), and 6 of 18 runs were infeasible. Code, table and log are in `research/infra-dcopf`.
