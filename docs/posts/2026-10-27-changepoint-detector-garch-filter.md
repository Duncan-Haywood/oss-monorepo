---
title: "A GARCH filter fixes false alarms in changepoint detection, then breaks real ones"
date: 2026-10-27
description: "Dividing a series by a fitted GARCH volatility cut false change alarms from about 50% to 1% but hid a real variance break 94 times in 100. A negative result."
tags: [changepoint-detector, statistics, negative-result]
---

[changepoint-detector](../../ventures/changepoint-detector/) warns when noise looks like clustered volatility, because clusters of big swings read as false variance changes (about half of GARCH nulls at n = 200). We tried the obvious fix: fit GARCH(1,1), divide by its conditional sd, then detect.

On 200 simulated series per cell, false alarms on GARCH noise fell from 51% to 1%, and a 1.5 sd mean shift was found more often (50% to 78%). But a real doubling of sd was found exactly once in 6% of runs instead of 97%, because GARCH treats a lasting jump in variance as persistence. So it stays out of the tool. The fix needs a joint likelihood where variance may break between segments, which PELT's independent-segment cost can't express. Script and numbers are in the README; simulated noise only.
