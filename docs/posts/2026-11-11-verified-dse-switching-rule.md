---
title: "Chip design search: time one run, then decide whether to trust the cheap estimate"
seo_title: "A cost-ratio rule for multi-fidelity chip design search"
date: 2026-11-11
tags: [research, chip-design, verified-dse, open-source]
description: "On 26 held-out chip designs, a rule fixed before any routing (use the cheap-estimate ladder only when routing costs over 3x a mapped score) halves the regret of either fixed policy."
---

The [verified-dse](../../research/verified-dse/) programme asks when a cheap
estimate of a chip design's area-times-delay can steer a search that ends in
an expensive routed run (Yosys, ABC and OpenROAD on SKY130). The
[previous step](2026-11-11-verified-dse-when-routing-is-dear.md) found that the
cheap-estimate ladder beats random routing only where a routed run costs more
than about 3 times a mapped estimate. This step turns that into a rule and
checks whether it holds up once the threshold is chosen honestly.

The rule needs no routed results: time one design point through the flow, and
if routing costs more than theta times the mapped estimate, run the ladder
("score everything at the mapped rung, route the best 8"); otherwise spend the
same wall-clock routing randomly drawn points. Theta was chosen by
leave-one-design-out on 52 cells from 26 designs, with the predictions
committed before the first run.

- **Every fold picks 3, and the rule beats both fixed policies.** Mean regret
  against the best routed point is 1.66%, against 2.29% for always routing
  randomly and 4.38% for always running the ladder, at the same wall-clock.
  The worst cell drops from 49.9% to 13.2%.
- **Testing the cheap estimate on a small routed pilot does not help.** A guard
  that routes 3 to 6 random points and abandons the ladder when the estimate
  ranks them badly does flag the worst design, but its false alarms elsewhere
  cost more than it saves. Simply routing six random points inside the ladder's
  budget hedges just as well, and adds nothing measurable on top of the rule.
- **On ten small designs it costs a little.** On a fresh pool the rule chose
  nothing on, routing is cheap almost everywhere, so the rule routes randomly
  in 18 of 20 cells: 1.21% against 1.04% for always running the ladder, a gap
  within noise.

Two caveats. Theta = 3 was the split named in advance last time, so finding the
minimum there is not independent evidence; and the test set has almost no cells
where routing is dear, so the ladder half of the rule still needs a test set
that chose nothing, such as detail-routed 24 and 32-bit multipliers. Code,
tests and the full log are in the project directory, MIT licensed.
