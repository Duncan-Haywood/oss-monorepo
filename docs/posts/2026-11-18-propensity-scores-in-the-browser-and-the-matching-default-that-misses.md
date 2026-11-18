---
title: "Propensity scores in a browser tab, and the matching default that covered 54% of the time"
seo_title: "Free propensity score tool: matching, IPW and doubly robust AIPW"
date: 2026-11-18
tags: [propensity-score, causal-inference, matching, inverse-probability-weighting, research-algorithms, browser]
description: "A free propensity score tool matches statsmodels within 1e-6. Over 1,000 simulated samples, greedy matching was biased by -0.53; with replacement, -0.004."
---

People who join a training programme are not a random draw. In the example
that ships with the new
[propensity score tool](../../ventures/propensity-score/), 2,000 simulated
people choose whether to train. The younger ones, those with less schooling,
the recently unemployed and the low earners join more. The same things
drive what they earn later. So the raw comparison says training **cut**
earnings by 3.6 thousand dollars a year, when the true average effect in
that sample is **+1.33** (+1.64 for the people who joined).

The tool's job is to get from the first number to the second, and to show
the reader why they should believe it. It runs in the page, the command
line or an agent call, and nothing is uploaded. You give it a 0/1
treatment column, an outcome and the covariates measured before treatment.
It fits a logistic model of who was treated (the propensity score), then
reports four estimators side by side, each for the effect on everyone (ATE),
on the treated (ATT) and on the controls (ATC):

- **inverse probability weighting**, with weights normalised within each arm;
- **regression adjustment**, a linear outcome model in each arm averaged over
  the target group;
- the **doubly robust AIPW** estimate, which is right if either of those two
  models is right;
- **nearest-neighbour matching** on the logit of the score, within a 0.2 SD
  caliper.

It also shows the checks a reviewer asks for: standardised mean differences
before and after (with a love plot), an overlap histogram, effective sample
sizes and optional trimming to scores between 0.1 and 0.9.

## Pinned to statsmodels

The weighting, regression and AIPW standard errors stack the logistic
model's estimating equations with the outcome models' and the means'. That
way they count the noise of the estimated score, not just the noise of the
outcome. The tests check them against statsmodels 0.15.0's
`TreatmentEffect`, which was run only as an external program to record
reference numbers. On three covariate specifications of the example, all 21
estimates and their potential-outcome means agree within 1e-9. Every
standard error agrees within 1e-6, and the largest gap seen was 1.7e-7. The
logistic coefficients agree within 1e-10.

## Where the textbook default went wrong

The first version of the matcher did what many tutorials show: greedy 1:1
matching without replacement, hardest-to-match treated units first, within
the caliper. On the example it gave an ATT of 0.76 against a true 1.64, with
95 of the 727 treated people left unmatched, even though the matched pairs
looked balanced. So before writing the page I ran a
coverage study. `eval/coverage.mjs` redraws the example's design 1,000
times at n = 2,000 and checks each 95% interval against the population
effect:

| Estimator | Bias | Coverage |
|---|---|---|
| Regression adjustment, ATE | -0.004 | 94.3% |
| AIPW, ATE | -0.003 | 94.0% |
| IPW, ATE | -0.021 | 92.5% |
| IPW, ATT | -0.005 | 93.4% |
| Matching with replacement, ATT | -0.004 | 95.2% |
| **Matching without replacement, ATT** | **-0.533** | **54.0%** |

Matching without replacement runs out of good controls where scores are high.
There are 727 treated people against 1,273 controls, and few of those
controls look like the treated people most likely to join. Later treated
units get worse partners or none. The ones the caliper drops are exactly the
people with the largest effects, so the matched estimate is about a different,
lower-effect group. The balance table cannot show this, because it only
describes the pairs that were kept. Matching with replacement
lets a good control serve several treated units. Its variance (Abadie &
Imbens 2006) counts that reuse, and it was unbiased with 95.2% coverage. That
is now the default. Greedy matching stays as an option, and the result text
warns when it is used.

The general point is that a matching estimator's properties depend on the
ratio of controls to treated units in each region of the score, not just on
the method's name. When most of the people who look like the treated were
treated, there is no one left to match them with.

## What no diagnostic catches

The page's result always ends with the same sentence: the numbers are causal
only if every common cause of treatment and outcome is among the covariates.
The example shows why that is not boilerplate. Run it with only age and
education as covariates and both balance to within 0.01 under the weights.
The love plot looks perfect, and every estimate sits between -3.3 and -2.7.
Prior earnings and unemployment, the real confounders, are missing, and
nothing on the page can tell you that.

One honest wrinkle in the shipped example: this particular draw lands low.
The AIPW interval for the ATE (0.46 to 1.31) ends just under the sample's
true 1.33. The coverage study says that happens in about 6% of samples, and
the README says so rather than swapping in a luckier seed.

## Next

The obvious next step is a sensitivity analysis for unmeasured confounding
(an E-value or an omitted-variable bound), because that is the assumption
the example shows can't be checked. After that come entropy balancing,
overlap weights and an AIPW estimate for the ATT. The tool sits beside
[regression discontinuity](../../ventures/regression-discontinuity/),
[difference-in-differences](../../ventures/difference-in-differences/) and
[synthetic control](../../ventures/synthetic-control/) in the
[research-algorithm tools](../../portfolio/research-tools/README.md).

*Statistical estimates from data you supply, not medical, policy, legal or
financial advice. Not affiliated with the authors of the cited papers or the
statsmodels project.*
