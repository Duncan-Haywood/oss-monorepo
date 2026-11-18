---
title: "Stale loss factors still fix most of a DC dispatch's error"
date: 2026-11-07
description: "Loss penalty factors taken from the AC optimum one load step earlier keep about 90% of the gain over plain DC dispatch on the IEEE 118-bus case."
tags: [research, power-systems, infra-dcopf]
---

A DC optimal power flow ignores losses, so its dispatch costs more than the AC optimum once you check it with a full AC power flow. Earlier runs showed that penalty factors, which weigh each generator by the losses it causes, close most of that gap, but only when computed at the AC optimum, which a DC planner does not have.

This run takes the factors from the AC optimum of a neighbouring load level instead, as a stand-in for the previous dispatch interval. On case118 at full load, plain DC costs 1.479 % above the AC optimum. Factors from a load 0.1 lower give 0.402 %, against 0.367 % for the oracle. A 0.2 step gives 0.703 %: stale factors still help, about 70 % of the gain.

Limits: one network, and a load scale stands in for time. A real hourly profile is the next step. Code and results: `research/infra-dcopf/experiments/run_prev_interval.py`.
