---
title: Does tracking the delay fix audio sync when the first window is wrong?
date: 2026-11-05
---
Syncing two cameras by audio fails on some real clips because the correlation peak lands on a period alias or the windows share too little sound. A natural fix is to search only near the delay predicted from earlier windows. We tested it on ten real clips (0 dB white noise, 0.8 s offset, drift of 40 ppm over an hour, 12 windows per camera).

It did not help. On the four failing clips at 2 s windows, 37.6% of windows were wrong with no prior, 37.8% with a +-50 ms tracked prior and 38.7% with +-20 ms. An oracle that knows the true delay gets 14.7%. The reason shows up in the series: a series whose first window is right stays right, one whose first window is wrong stays wrong. A tracker inherits the first estimate's error.

So spend the effort on the first sync: a 3 s window fixes `soft` and `untie` outright. A tone clip (`space2`, period 12.1 ms) is still wrong in every tracked series, because the delay moves more between windows than the period.

Limits: ten clips, one noise level, linear drift by construction, and no re-acquisition rule. Code and numbers: `research/capture-aliaswin`.
