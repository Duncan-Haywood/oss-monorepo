---
title: "Last hour's loss factors are as good as this hour's"
date: 2026-11-08
tags: [research, power-systems, opf, open-data]
description: "On two real PJM hourly load weeks run through the IEEE 118-bus case, penalty factors from the previous hour's AC optimum keep essentially all the gain of same-hour factors over a plain DC dispatch."
---

A plain DC optimal power flow ignores losses, so its dispatch costs 0.7 to 1.1 % more than the AC optimum once run through an AC power flow. Loss penalty factors taken at the AC optimum shrink that, but an operator only has last interval's AC solution. We ran 168 hours of AEP-zone load from PJM (winter and summer 2017, scaled onto the IEEE 118-bus case) and compared plain DC, factors from hour h-1, and factors from hour h.

Mean excess over the AC optimum: winter 0.734 % plain, 0.499 % previous-hour, 0.498 % same-hour; summer 1.053 %, 0.436 %, 0.431 %. Hour-old factors keep all of the same-hour gain here.

Limits: hourly load is slow, so this is the easy case; one network, uniform load shape, no ramping, no binding line limits, one solver. Code, data note and results are in `research/infra-dcopf`.
