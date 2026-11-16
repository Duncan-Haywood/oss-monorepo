---
title: "Survey design effects on a rotated item: small clustering, but a 4 to 9% interval gap"
date: 2026-11-16
description: "With GSS strata and PSUs, design effects on pooled subgroup shares are only 1.06, but the survey's own error leaves calibration intervals 4-9% too narrow"
tags: [research, christian-belief-models, survey-methodology, design-effect, variance-estimation, GSS]
---

The [christian-belief-models](/research/christian-belief-models/) paper draft had a limitation it admitted openly. The section on how big a calibration subsample a rotated survey item needs treated every subsample as a simple random draw. It also scored each estimate against the group's *sample* share. The General Social Survey is not a simple random sample. It draws two primary sampling units (PSUs) per stratum, each stratum belongs to one year, and the file carries the codes (`vstrat`, `vpsu`). So this run asked two questions, with the predictions logged before it ran.

1. **How much does clustering add?** Respondents in the same PSU tend to answer alike, so the true variance is larger than a weights-only (Kish) formula says. The transferred model might absorb some of that local similarity. If it does, the residual y − f would have a smaller design effect than the item itself.
2. **What did scoring against the sample share leave out?** Against the *population* share, any estimate carries the survey's own sampling error. A calibration subsample cannot remove that error, and neither can the model. So the difference estimator's saving should shrink as the subsample grows.

The run refits the same 241 group × item cells as before. Its biases and variance ratios match the earlier run exactly. It then computes ultimate-cluster (with-replacement PSU) variances, counting every PSU of a stratum, including those with none of the group's respondents. It also draws 500 calibration subsamples per cell at 50 to 400 respondents.

- **Clustering barely matters here.** The median design effect on a group's share is 1.06 (pair-cluster bootstrap 1.05–1.07). The reason is in the counts: a group pooled over five decades has a median of 2.26 respondents per PSU, so there is little within-PSU similarity to inflate the variance. The prediction was 1.1 to 1.8, so it was refuted on the low side.
- **The model takes a little of it out.** The residual's design effect is 1.02. It is smaller than the item's in 78% of cells, and the saving is slightly larger under the design than without it (variance ratio 0.81 against 0.83). That is a smaller effect than predicted (median ratio 0.97, not at most 0.95).
- **The survey's own error is the real gap.** It is 1.5% of the plain mean's error at 50 respondents and 11% at 400 (about a quarter for immigrant generations, Hispanic Catholics and 2016–24 groups). Against the population share, the difference estimator's saving falls from 17% to 14% at 400. Intervals built from the subsample alone are too narrow by 4% at 50 and 9% at 400, and by up to 19% for the small groups.
- **The fix needs nothing a designer lacks.** The model's prediction is known for every respondent in the group, and the answer is known for the subsample. Linearise both parts and take the ultimate-cluster variance over PSUs. That estimate averages 0.94 of the true variance at 50 respondents and 0.99 at 400; the Kish formula falls to 0.85 at 400.

Of seven predictions, five held, one held in part and one was refuted. The paper's Section 5 now carries this check, and its pre-registration table counts 47 predictions over eight steps.

The caveats matter for anyone reusing the numbers. Pooling decades is what keeps the design effect small: an estimate for one year's subgroup puts more respondents in each PSU and would see larger effects. The 1972–74 waves have no design codes and are treated as simple random within year. The with-replacement PSU formula drops the first-stage finite-population correction.

Code, results and the logged predictions: [`research/christian-belief-models`](https://github.com/Duncan-Haywood/oss-monorepo/tree/main/research/christian-belief-models), `experiments/m6_design_variance/`.
