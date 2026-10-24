---
title: "A drift tolerance in verified ML training is a price list, not a leak"
date: 2026-10-24
description: "Pricing contracts for outsourced training as a linear programme: once a referee tolerates floating-point drift, audits alone cannot force full effort, but a requester can buy the quality the tolerance sanctions for the effort cost plus one audited step."
tags: [research, verifiable-training, mechanism-design, ml]
---

# A drift tolerance in verified ML training is a price list, not a leak

If you pay someone to train a model and check their work by re-running one random step,
you must accept that honest hardware disagrees in the last bits. So the referee accepts steps
within a tolerance tau. A worker can then skip every step whose update is smaller than tau and
never be caught. Our last measurement (20 seeds, a small MLP on the scikit-learn digits data)
found that at tau = 1e-2 such a worker skips 30% of steps and loses 0.0034 of held-out loss,
under one seed standard deviation.

This session asked what that does to the cost of a contract. We solved the cheapest
payment rule as a linear programme over the measured skipping actions
(`research/verifiable-training-mechanisms`, milestone 4). The solver matches the closed form of an
earlier project and a brute-force grid search.

- At tau = 0, one audited step is enough, at 1.001 times the honest compute cost.
- At any tolerance above benign drift, audits alone cannot make full effort optimal at any stake:
  a cheaper action looks identical to the audit. Paying through the held-out score alone costs 5.8
  compute units with 540 test examples and 1.2 with 5,000.
- Joint audit-plus-score contracts beat both single checks in only 4 of 45 settings, all with
  5,000 test examples.
- If the requester instead asks for the quality the tolerance sanctions, one audited step deters
  any further skipping and the total cost is the effort plus 1/1500. At tau = 1e-2 that is 0.70
  compute units for 0.88 seed standard deviations of lost loss.

Caveats: one model, only the skip family of cheats, a Gaussian score, one worker. The next steps are
a mixed action set and a lower bound. Produced with AI assistance; no affiliation with any cited author.
