---
title: "An honest error bar cannot see a 5% stale camera calibration, and that changes the decision rule"
seo_title: "Detecting a stale camera calibration from self-calibration"
date: 2026-11-20
tags: [research, sensing-selfcal, camera-calibration, change-detection]
description: "On TUM video, a 2-sd test on pooled self-calibrations needs 7 to 10% focal-length staleness to fire reliably; adopting the pool beats keeping a stale value."
---

The last step of the `sensing-selfcal` programme
([a memory of the camera's scatter](2026-11-20-three-camera-self-calibrations-need-a-memory-of-scatter.md))
made the error bar on pooled camera self-calibrations honest. It did that by
widening the bar to the scatter the camera has already shown, about 3% of the
focal length per 1.2 s window. This step asks what that honest bar is good for
as a decision: can a robot use it to notice that the focal length it holds has
gone stale?

The test re-uses the same 43 windows of TUM RGB-D video (saved solves, nothing
re-solved). The robot holds the board calibration shifted by 0 to 10%, and a
gate flags a block of K pooled windows when the pool is more than 2 sd from
the held value. The eight predictions were written into the log before the
analysis was. Three held.

| windows pooled (causal prior) | false alarms | flagged at 5% stale | staleness flagged 4 times in 5 |
|---|---|---|---|
| 1 | 0.16 | 0.36 | not within 10% |
| 3 | 0.05 | 0.46 | 10% |
| 5 | 0.03 | 0.47 | 8.5% |
| 8 | 0.00 | 0.59 | 7% |

False alarms are rare, as predicted. What failed is resolution: I expected five
windows to catch 5% staleness, and they catch it about half the time. The bar
is honest in the root-mean-square sense because of a tail of bad blocks. That
makes it wide for the typical block, whose pool is only about 1.2% from the
board.

That gap changes which decision rule makes sense. "Keep the held value unless
the pool proves it wrong" leaves a median error of up to 4.5% (at 4.5%
staleness, just below where the gate fires). Adopting the five-window pool
every time is 1.17% from the board in the median and 2.9% at the 95th
percentile, however stale the held value was. The gate still helps in the
other direction. When the held value is right (1% stale), it refuses the
outlier pools that always-adopt takes, and the 95th-percentile error drops to
1.69%. So the rule a robot wants is asymmetric: adopt by default, and refuse
only pools that are implausible against the camera's own history. That rule is
the next test, not a result yet.

The limits: staleness here is a shifted held value, not a real refocus (a
refocus would also move the distortion and the principal point). The board
reference is itself about 1.6% from the other two references. And
overlapping blocks from one recording order on two cameras are far fewer
independent tests than their count suggests. A floor learned only from the
prior-steadied windows, the other question in this step, did not improve on
the history floor (rms z 1.17 against 0.87 at five windows).

Code, log and figure: [`research/sensing-selfcal`](../../research/sensing-selfcal/README.md),
milestone 3v ([analysis](../../research/sensing-selfcal/experiments/m3v_stale/analyse.py),
[log](../../research/sensing-selfcal/LOG.md)).
