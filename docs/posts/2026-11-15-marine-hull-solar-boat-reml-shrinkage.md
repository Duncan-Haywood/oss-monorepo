---
title: "A better variance estimate doesn't rescue a one-season solar boat correction"
seo_title: "Solar USV seasonal correction: REML vs moment shrinkage, measured"
date: 2026-11-15
tags: [research, marine-hull]
description: "REML and the simple moment estimate of a fleet's spread agree within 0.004 in 44 of 48 cases; the safest one-season rule keeps polar boats' own fit, 140 of 168."
---

A solar boat plans its battery use from a sun climatology that is wrong in a seasonal way. The programme learns that error from one season of the boat's own log as a yearly cosine, and then shrinks that noisy cosine toward what neighbouring boats at similar latitude learned. In the [last step](2026-11-15-marine-hull-solar-boat-pool-the-cosine.md), lining southern boats up with northern ones by season made things worse. The shrinkage handed too much of each polar boat's correction to the band average. We guessed that the cause was a crude estimate of how much the boats differ, a simple moment estimate over nine points that weights every boat equally even though some boats' fits are much noisier than others.

So this step tried the textbook fix: a REML estimate of the spread between boats, with each boat weighted by its own noise (Morris 1983, the estimator used in random-effects meta-analysis). It also tried the blunt alternative: don't shrink at all above 50 degrees latitude. We committed eight predictions before running anything. The 168 cases are the same as before: NASA POWER daily sunlight 2005 to 2014, 30 ocean points, four battery sizes, and the climatology's real error plus 20 added seasonal biases. The check reproduced the last step's numbers exactly. Five predictions held.

What came out:

- **The estimator was not the problem.** REML and the moment estimate agree within 0.004 in 44 of 48 band, year and phase cases. The REML rule wins 140 of 168 cases, the same as the moment rule, but 137 of 240 per-point real-error cases against 140. The season-aligned REML pool is still worse (130). Where REML does differ, it hits zero spread and pulls every boat in a band fully onto the band mean, which is the likely reason it does worse at the high-amplitude points (66 of 168 against 97), though we did not test that.
- **The bluntest rule is the safest.** If a boat sits at 50 degrees or more, keep its own fitted cosine unshrunk; pool the rest within latitude bands. That rule wins 140 of 168, 102 of 168 at the nine high-amplitude points (the previous best was 97, and no correction gets 25), and 141 of 240 per-point cases. Its margin over the last step's best rule is one case, which is noise.
- **A pattern across four steps.** Every one-season rule built on the fitted cosine since milestone 6zze, 11 of them, lands between 126 and 140 of 168 overall, and no correction gets 139. What one season of log buys is a gain at high latitude, not overall.

For a team running solar boats: after one season, keep a high-latitude boat's own fitted seasonal correction and pool only the lower-latitude boats within bands. A cleverer variance estimator will not buy more. Two seasons of log do: the same rules reach 138 to 149 of 168.

Limits: the 50-degree threshold is the grid's band edge, not tuned. The bands hold only 9 to 11 points. The added biases are shared in calendar months, which favours calendar-phase pools by construction (this was fixed in advance). This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. The code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzh). Written with AI assistance.
