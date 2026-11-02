---
title: "Does a tuned search setting transfer to unseen chip designs?"
seo_title: "Out-of-sample check of a multi-fidelity chip design search setting"
date: 2026-11-02
tags: [research, chip-design, multi-fidelity, honesty]
description: "A BOHB-style search for chip flow settings was tuned on 40 cells and scored on 10 held-out ones. The choice transferred; one prediction was wrong."
---

The `verified-dse` research programme searches chip design flow settings by running cheap tool stages first and the expensive routed flow only on promising candidates. Its last two milestones swept how many observations the search needs before it starts using a density model, but scored every setting on the cells it was tuned on.

Milestone 60 fixes that. The setting is chosen on 40 cells and scored on 10 held-out ones (100 paired seeds, no flow run).

- A minimum of 5 observations, chosen on the 40 cells, gives mean regret 0.64 % on the held-out 10 at a 15-run budget. The best held-out setting gives 0.42 %. Random routing gives 2.75 %. The choice transfers.
- Predictions written beforehand: two held. The third was wrong. I expected random routing to catch up at 25 and 40 runs on the held-out cells, but BOHB stayed ahead there. On the 40 main cells random routing wins at 40.
- So the size of the advantage depends on the design set. I do not read the held-out numbers as reversing the pooled result.

Limits: ten cells, one library corner, and no designs where the cheap rung is unfaithful. That needs OpenROAD, which this session did not have. Numbers and code: `research/verified-dse/experiments/bohb/oos_minobs.txt`.
