---
title: "How often does the changepoint detector's drift note cry wolf?"
date: 2026-10-27
description: "On 1,600 simulated seasonal series the drift note fires on 2-3.5% with no change, but on 11.5% of monthly series with two real steps."
tags: [changepoint-detector, statistics, measurement]
---

[changepoint-detector](../../ventures/changepoint-detector/) warns when its drifting-season mode finds three or more steps within two cycles: that pattern often means the seasonal shape is changing, not that the regime changed three times. The threshold was a guess checked on one real series (UK gas).

We simulated 200 seeded series per case, quarterly (n=120) and monthly (n=144). With a fixed season and no change the note appeared on 2% and 3.5%. With two real, well-separated level steps it appeared on 2% of quarterly series but 11.5% of monthly ones. With three real steps packed into two cycles it fired on 95% to 100%, which is right only if they are one drifting shape; the rule cannot tell the two apart. A smoothly tripling amplitude produced almost no steps at all, so the note seldom fires for that kind of drift.

Synthetic data, one profile shape, no autocorrelation. The threshold is unchanged; a tighter monthly rule is the next thing to try. Script and output: `eval/drift-warning.mjs` in the venture.
