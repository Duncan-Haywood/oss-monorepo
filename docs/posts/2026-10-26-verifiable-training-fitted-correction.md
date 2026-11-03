---
title: "A fitted fudge factor for predicting how much a lazy trainer loses did not transfer"
seo_title: A fitted correction for a lazy trainer's loss did not transfer
date: 2026-10-26
description: "One fitted scalar to predict a lazy trainer's accuracy loss did not transfer to held-out settings."
tags: [verifiable-training, negative-result, research]
---

In the verifiable-training programme, a worker who skips cheap gradient steps that a referee will wave through loses some accuracy. Last milestone's parameter-free predictor (C: train for as many steps as the skipped path length leaves) always undershot the measured loss. The obvious fix is one fitted scalar.

I fitted it on the digits MLP (k = 3.6, the geometric mean of measured/C over the three detectable rows) and applied it to the transformer, which the fit never saw. Before running I predicted it would not carry over.

| transformer tau | C / measured | 3.6 x C / measured |
|---|---|---|
| 1e-3 | 0.00 | 0.00 |
| 1e-2 | 0.49 | 1.75 |
| 3e-2 | 0.61 | 2.21 |
| 1e-1 | 0.69 | 2.48 |

Inside the 0.5 to 2 band: C on 2 of 4 rows, the corrected predictor on 1 of 4. On digits the undershoot shrinks from 9.5x at tau 1e-3 to 1.6x at 1e-1, so no single factor fits; leaving one out moves k from 2.2 to 5.4. The error is a function of tau, not a constant. Three fit rows, skip cheat only.

Code, results and log: `research/verifiable-training-mechanisms/experiments/h6_fitted/`.
