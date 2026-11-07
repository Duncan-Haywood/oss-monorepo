---
title: "A pilot certificate for chip-flow search lowers regret but does not bound it"
date: 2026-11-07
description: "On 40 cached SKY130 place-and-route cells, a certified pilot meant zero regret in 87% of halving runs, but one uncertified-by-theory cell still lost 13.9%."
tags: [research, verified-dse, chip-design]
---

When a cheap synthesis score ranks designs for a multi-stage search, can a small routed pilot tell you the search will not drop the best design? The `verified-dse` programme has a rank-displacement certificate for that (T < 1). Earlier milestones described it from the optimum's side. This one reads it from the practitioner's side, on the 40 cached cells (2 clocks, 10 designs, 2 halving starts) with 300 pilots and 200 tie-breaks each.

At a pilot of 16 routed points, 22% of pilots are certified. After a certificate, successive halving had zero regret in 87.3% of draws, against 31.5% after no certificate, and the mean excess over the best design was 1.1% against 7.0%. I predicted a floor of 90% zero-regret and a ceiling of 5% on any cell's mean loss. Both were wrong: the 90% figure is reached only at 24 pilot points (90.7%), and the tight-clock `adder_op16` cell from the R2 start is not guaranteed, yet half its pilots are certified and its mean regret is 13.9%.

So the certificate is a good screen and not a bound; a regret certificate stays open. All from a cached table, no new flow run. Code and results: `research/verified-dse/experiments/theory/pilot_cert_regret.py`.
