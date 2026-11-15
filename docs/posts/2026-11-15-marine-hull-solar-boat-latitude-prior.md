---
title: "Pool by latitude: a solar boat's seasonal correction, shared across a fleet"
seo_title: "Solar USV forecast correction: a latitude-banded shrinkage prior"
date: 2026-11-15
tags: [research, marine-hull]
description: "Pooling a solar boat fleet's seasonal-correction prior within latitude bands wins back 11 of 35 lost high-latitude cases at no cost elsewhere."
---

A solar boat plans its battery use from a sun climatology that is wrong in a seasonal way. The [last step](2026-11-15-marine-hull-solar-boat-amplitude-shrinkage.md) learned that error from one season of the boat's own log as a yearly cosine. It then shrank the cosine's swing toward zero by its own noise. With a prior pooled over the whole fleet (30 ocean points) that helped on ordinary water. Above about 50 degrees it hurt: 54 wins of 168 cases, against 89 with the full cosine. The guess was that one ocean-wide prior is set by the calm tropics, so it shrinks hardest near the poles, where the seasonal error is real.

This step tests that guess. It pools the prior within three latitude bands (up to 20 degrees, 25 to 42, 50 and above). A second version fits it as a straight line in latitude. We wrote nine predictions down before running anything. The 168 cases are the same as before: NASA POWER daily sunlight 2005 to 2014, four battery sizes, the climatology's real error plus 20 added seasonal biases. Five predictions held, and the check reproduced the last step's numbers exactly.

What came out:

- **Banding helps where it should and costs nothing elsewhere.** At the nine high-amplitude points the win count rises from 54 to 65 of 168. Over all 168 cases it goes from 132 to 133. A "win" means going further than the plain 7-day rule with no more payload downtime.
- **It gives back only a third of the high-latitude loss.** The full cosine still wins 89 there. The reason: near the poles the one-year fit's own noise is larger too. Even with the right prior, the weight kept on the swing only moves from 0.53 to 0.63.
- **A straight line in latitude is worse than bands (130).** From one year of log the prior has no clean latitude trend. In one of the two test halves the prior's spread is 0.030, 0.025 and 0.031 from tropics to pole. From two years on the trend is clear (high band 0.027 to 0.042, low band 0 to 0.017).
- **One year still does not beat no correction (133 against 139).** With five years the banded rule wins 162 of 168, the best of any rule in the programme, by one case.

For a team running several solar boats that share their logs: pool the correction's prior within latitude bands, not over the whole ocean. It is never worse and it helps at high latitude. Above about 50 degrees after one season, the full unshrunk cosine is still the better choice.

Next, the shrinkage could pool the cosine itself within a band rather than its variance, since high-latitude points share a seasonal phase.

Limits: the bands hold only 9 to 11 points each. The prior includes each point's own learning years, but never a scored year. The noise estimate treats months as independent. This is simulation only, with calm water, daily steps, NASA POWER sunlight and one 4 m hull. Code, the pre-registered predictions and every number are in `research/marine-hull/` (milestone 6zzf). Written with AI assistance.
