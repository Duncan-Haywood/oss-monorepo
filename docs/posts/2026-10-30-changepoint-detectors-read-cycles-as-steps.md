---
title: A changepoint detector reads a cycle as 23 steps
date: 2026-10-30
tags: [changepoint-detector, false-alarms, time-series]
description: "On real lynx and sunspot cycles a default changepoint detector finds 23 and 46 steps that are not there; --ar1 or a bootstrapped penalty removes them."
---

Ask a default changepoint detector about the Canadian lynx trapping record, 1821 to 1934, and it finds 23 level
changes. There are none: the numbers swing on a ten-year cycle. The yearly sunspot count does the same, 46 steps in
289 years.

We checked four setups on both series. A longer minimum segment only thins the false steps (3 and 7). Allowing for
lag-1 autocorrelation (`--ar1`) or using the bootstrapped mean-and-variance penalty leaves none. The catch: zero is
also what a detector that sees nothing would say, and we have not measured power on a real step hidden inside a
cycle. The numbers and code are in the changepoint-detector README.
