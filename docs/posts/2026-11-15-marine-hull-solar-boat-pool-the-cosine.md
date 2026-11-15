---
title: "Don't pull a polar solar boat toward its neighbours: pooling a seasonal correction backfires"
seo_title: "Solar USV forecast correction: pooling the seasonal cosine by fleet"
date: 2026-11-15
tags: [research, marine-hull]
description: "Pooling a solar boat fleet's one-season sun correction toward a hemisphere-aligned band mean scored 127 of 168; trusting each boat's own fit, 140."
---

A solar boat plans its battery use from a sun climatology that is wrong in a seasonal way. The programme learns that error from one season of the boat's own log as a yearly cosine. The [last step](2026-11-15-marine-hull-solar-boat-latitude-prior.md) shrank the cosine's swing toward zero, with a prior pooled within latitude bands. It helped on ordinary water but still lost near the poles, where the seasonal error is large.

This step tried a different target. Instead of shrinking each boat's cosine toward zero, shrink it toward the average cosine of its latitude-band neighbours. Southern boats are shifted six months so that winter lines up with winter. If boats at the same latitude share their seasonal error, that should keep the swing and remove the noise. We wrote nine predictions down before running anything. The 168 cases are the same as before: NASA POWER daily sunlight 2005 to 2014, four battery sizes, the climatology's real error plus 20 added seasonal biases. Three predictions held, and the check reproduced the last step's numbers exactly.

What came out:

- **The shared high-latitude swing is real.** Lined up by hemisphere, the nine points at 50 degrees and above share a seasonal error of 4 to 6% peaking near local midsummer, against 1 to 2% in the tropics.
- **Pulling toward it costs anyway.** The aligned band rule wins 127 of 168 cases and 133 of 240 per-point cases on the real climatology error, below the last step's 133 and 135. The fitted spread between neighbours is small, so the rule keeps only 20 to 30% of each boat's own cosine and hands the rest to the band average. But a North Sea boat and a Gulf of Alaska boat are not the same.
- **The version without alignment did best of any one-season rule so far.** Pooling in calendar months mixes hemispheres. That inflates the spread, so the rule keeps about 60% of each boat's own fit. It wins 140 of 168 cases (no correction wins 139), 97 of 168 at the high-amplitude points (the unshrunk cosine 89) and 140 of 240 per-point real-error cases (the previous best was 136).

That last result needs care. One case over no correction is within noise. The added seasonal biases are shared in calendar months by construction, which favours the unaligned rule; we wrote that down in advance. The fair test is the real climatology error, and there it also wins (140 against 133 to 136 per-point cases). The reason looks mechanical, not physical: it does better because it trusts each boat's own data more.

For a team running several solar boats that share their logs: after one season, do not pull a high-latitude boat's correction toward its neighbours' average. Keep most of its own fitted cosine. Pooling is safe on ordinary water.

Next, the shrinkage could use a better estimate of the neighbour spread than the simple moment estimate over nine points. Another option is a floor on how much of a high-latitude boat's own fit is kept.

Limits: the bands hold only 9 to 11 points each. The noise estimate treats months as independent. The explanation of why the unaligned rule wins comes from a check after the run, not from a prediction. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzg). Written with AI assistance.
