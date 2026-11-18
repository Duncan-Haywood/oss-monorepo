---
title: "On a year it never saw, a solar boat's sun correction works only if the clamp stays narrow"
seo_title: "Solar USV sun-forecast correction, tested out of sample on 2025"
date: 2026-11-17
tags: [research, marine-hull]
description: "Scored on 2025 sunlight, narrow learned corrections still beat the raw climatology by 5 to 6 of 84 cases. Wider clamps fall 6 to 9 below it."
---

A solar survey boat plans each day's speed from a sunlight climatology, a ten-year average of what the sky usually gives. The climatology is never quite right for the place where the boat is working, so earlier steps of this programme let the boat correct it from its own log. It compares what its panel actually collected with what the climatology promised, month by month, and scales the next season's plan by that ratio inside a clamp. Every one of those rules was tuned on 2005 to 2014 sunlight. NASA POWER has now published all of 2025, so this step asked the obvious question: do the rules still help on a year they were never tuned on?

We scored every rule on 2025 at the same 30 ocean points. Each one learned only from the seasons just before (2020 to 2024), which is what an operator would actually have. As a reference, we scored 2010 to 2014 the same way. The predictions were committed before the run. Five of nine held.

What we found:

- **The narrow corrections keep their lead.** A ±3% clamp on the learned month ratios, a clamp set from the ratios' own spread (AP) and a yearly cosine pooled across a latitude band (HR) each beat the uncorrected plan by 5 to 6 of 84 one-year cases on the 30-point pool. Their in-sample lead under the same design was 3.5 to 7.4.
- **The wide corrections lose theirs.** The clamps that widen with the length of the log (AK, A1) and a fixed ±15% fall 6 to 9 cases *below* the uncorrected plan in 2025. In-sample they sat within about a case of it. An earlier step had called AK the most robust single rule. On a fresh year it is not.
- **2025 was harder for everyone.** The uncorrected plan beats the 7-day baseline in 63 of 84 cases, below every in-sample year (66 to 80). That makes 2025 a tougher year, not a sign that the corrections broke. 2025 was also about 0.8% sunnier than the climatology across the 30 points.
- **Weighted point by point, nothing moves much.** When each point counts equally, every rule sits within 2 cases of the uncorrected plan. The pooled lead comes from the points where the boat sails far.

For a designer, the advice is short. Correct the climatology from the boat's own log, but only inside a narrow clamp (about ±3%, or the ratios' own spread) or through the pooled cosine. Don't open the clamp up.

Limits: this is one fresh year, and all 84 cases share it. The 2025 rules learned from years inside the climatology decade, while the in-sample ones learned from years before it, so the two columns are not quite like for like. Only NASA POWER sunlight was used, with one boat, one 50 W payload and a calm-water daily model.

Code, results and the full log: [`research/marine-hull`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/marine-hull) (`experiments/run_oos_2025.py`, `experiments/results_oos_2025.txt`).
