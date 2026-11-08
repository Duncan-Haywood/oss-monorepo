---
title: "How fast do DC loss factors go stale?"
date: 2026-11-08
tags: [research, power-systems, opf, open-data]
description: "On IEEE case118 with a real PJM-zone load shape, penalty factors up to 12 hours old still cut a plain DC dispatch's excess AC cost by 58 % at the steepest ramps."
---

A DC optimal power flow ignores losses, so its dispatch costs a little more than the AC optimum. Penalty factors fix most of that, but an operator only has factors from an earlier interval. Last time they held up on a real hourly week. This run pushed on them: factors taken 1, 3, 6, 12 and 24 hours earlier, applied at the ten steepest load ramps of 2017 in the AEP zone's hourly shape, on case118.

Plain DC's mean excess AC cost was 0.73 to 1.41 %. Stale factors gave 0.47 % (1 h), 0.49 % (3 h), 0.54 % (6 h), 0.58 % (12 h) and 0.51 % (24 h). Fresh factors give 0.42 to 0.48 %. So the gap to fresh grows from 0.01 point at 1 to 3 hours to 0.16 point at 12 hours, and stale factors still beat plain DC in all 50 hours.

Limits: ten hours per lag, one case, one load shape applied to every bus, and no outages, which would age factors much faster. A line-trip test is next. Code and results are in `research/infra-dcopf` (LOG.md, README).
