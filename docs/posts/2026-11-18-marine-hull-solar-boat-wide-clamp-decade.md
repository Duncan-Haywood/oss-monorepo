---
title: "The solar boat's one wide-clamp win survives a forced sun bias, so it was never about the bias"
seo_title: "Solar USV sun correction: the wide clamp's win is not a bias"
date: 2026-11-18
tags: [research, marine-hull]
description: "Forcing the learned sunlight ratios ±3% in the design where ±10% beat ±2% at high latitude never removes its lead; ±2% still beats no correction every year."
---

The [marine-hull programme](../../research/marine-hull/README.md) has a solar survey boat that plans its days from a sunlight climatology, corrected by month-by-month ratios it learns from its own log and clamps to a narrow band. Across many designs the ±2% clamp has been the safe choice. There is one exception: at nine high-latitude points, scored on 2010 to 2014 against a 2015 to 2024 climatology, the ±10% clamp beat ±2% by 12.7 of 84 cases.

[The last step](2026-11-18-marine-hull-solar-boat-offset-sign.md) ruled out one explanation (that a dark learned offset made the wide clamp win) by forcing the offset in a different design, where darker always hurt. That left two candidates. Either the dark offset was an accurate forecast in those dark years and the wide clamp won by passing it through, or something about that decade favours a wide clamp whatever the offset. This step runs the same forced shift inside the design where the wide clamp won. Nine predictions were committed to the script before the full run, and at zero shift the run reproduced the earlier numbers exactly.

Five-year mean, out of 84 cases (four battery sizes times 21 power-demand shapes, distance and dark hours summed over the nine points) where a rule must match a simple 7-day baseline on distance without more dark hours. No correction scores 27.6.

| clamp | d = -3% | -1.5% | 0 | +1.5% | +3% |
|---|---|---|---|---|---|
| ±2% | 31.2 | 32.5 | 34.0 | 34.9 | 35.2 |
| ±5% | 34.3 | 37.5 | 40.7 | 42.2 | 42.0 |
| ±10% | 36.7 | 41.4 | 46.7 | 47.3 | 46.6 |

**The lead survives every shift.** ±10% stays ahead of ±2% from 5.5 to 12.8 cases at every shift tested. Darker still costs, most through the wide clamp, just as in the other design. Seven of the nine predictions failed, including the central one: if the dark offset were an accurate forecast, the plain climatology should fail on dark hours in those years, because it would be planning on too much sun. It fails on distance in 281 of its 282 failing cases. And the offset is small at these points: the learning years and the scored years both sit about 0.5% below the climatology, so a ±3% shift moves the offset by six times its own size and still leaves the result in place.

**What this changes.** Neither the offset's sign nor its accuracy explains why the wide clamp won here. The remaining candidate is the month-to-month shape of the learned ratios, which a ±10% clamp lets through and a ±2% clamp cuts. That is an inference from what the shift could not move, not yet a test; the next step splits the correction into level and shape and clamps each one separately. For a designer, the rule stays the same and gets firmer. ±2% is at or above no correction in every one of these five years at every shift. On the mean it is the only width at or above no correction in both designs. Whether ±10% leads or trails depends on the decade, from +12.8 here to -20 in the other design, and nobody can know that in advance. A per-point count with each point weighted equally doesn't even agree on which way the shift helps the wide clamp.

Limits: one design and one history length; five scored years that share learning seasons; the shift is uniform across months; the high-latitude sum is carried by the two points where the boat moves most; one boat with a 50 W payload on a calm-water daily model; NASA POWER sunlight only; 20 of the 21 power shapes are synthetic.

Results: [`results_offset_sign_out.txt`](../../research/marine-hull/experiments/results_offset_sign_out.txt); code: [`run_offset_sign_out.py`](../../research/marine-hull/experiments/run_offset_sign_out.py).
