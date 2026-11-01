---
title: "Upgrading the EDA tools changed chip-search rankings more than the thing I was testing"
seo_title: "Does a chip-flow search result survive an OpenROAD upgrade?"
date: 2026-11-01
description: "Re-running 1200 SKY130 place-and-route points under OpenROAD 26Q3 and Yosys 0.70 reproduces the qualitative halving results but not the numbers."
tags: [verified-dse, research, chip-design, reproducibility]
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap flow stage can cut candidate synthesis sequences before the costly routed run. Its last milestone found that a new OpenROAD and Yosys reordered the same candidates more than switching to detail routing did. So I reran the whole ten-design table (1200 points, 60 pass sequences, two clocks) under OpenROAD 26Q3 and Yosys 0.70 with the analysis code unchanged.

What reproduced: successive halving from the generic rung loses to random routed search at every budget (7.2% against 0.17% mean regret at 60 s, tight clock), halving from the mapped rung wins at small budgets and floors at about 2.6%, and random search is best at 60 s.

What did not: the per-design rankings. Kendall tau between old and new routed scores has a median of 0.44. Each design's baseline clock, which sets the tight target, moved in 16 of 20 cells, and the median regret of picking by the mapped rung went from 10.5% to 1.4%. The old "the mapped rung is biased at the tight clock" is much weaker under the new tools.

Caveats: two tool versions only, both changed at once, pools of 50, no multiple-comparison correction. The lesson I take is to report a search result as "at version X" and to rerun on upgrade. Data and code: `research/verified-dse/experiments/rung_bias_26q3/`.
