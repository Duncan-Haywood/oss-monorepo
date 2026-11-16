# Pre-registration: a test at a date the user names (2026-11-16)

Written before `known-date.mjs` was run on any series, synthetic or real. Context: the flagship row's
slope item ends "next a given knot", and the product's own explainer page tells analysts that testing
at a date picked by looking at the chart is biased. The other side of that is a question analysts
really have and this tool did not answer: "the law, launch or price change happened on this date,
written down before I looked; did the level or the slope change there?" That is an interrupted time
series (segmented regression, Wagner et al. 2002; Bernal, Cummins and Gasparrini 2017), and the
standard tools for it are a regression package or Google's CausalImpact (R, needs a control series).

**Model.** x_t = a + b t + d 1{t >= k} + c (t - k)+ + [period - 1 seasonal dummies] + u_t, with
u_t = rho u_{t-1} + e_t. k is given, not searched, so no sup over knots. rho by iterated Prais-Winsten
(capped at 0.95). Statistics: the Wald F for d = c = 0 (2 df) and the t for d and for c.

**Calibration.** A parametric bootstrap: series drawn from the null fit (line plus seasons) with
AR(1) noise at the null residuals' bias-corrected rho (Kendall 1954), every replicate re-estimating rho.
p = (1 + #replicates at least as large) / (1 + reps). The F-table p is reported next to it, so the
size table shows what the bootstrap buys. A 95% range for d and c is the estimate plus or minus its
standard error times the bootstrap's 97.5th percentile of |t|.

**Guard.** When the full model's residuals have bias-corrected lag-1 rho above 0.9 (0.7 under 100
points), the series is refused as too close to a unit root for a level test. A known date makes the
full model's residuals a fair place to read this (nothing is searched to make them small).

**Fixed now.** 199 replicates in the simulation, 999 on the real series, seed 1, at least 8 points
on each side of the date (plus one period when seasons are on).

**Synthetic size bar.** Null AR(1) series (line plus noise), rho in {0, 0.4, 0.8}, n in {40, 120},
date at 50% and 80% of the series, 400 series per cell: bootstrap joint p <= 0.05 in 2-8% of series
in every cell. Reported, no bar: the F-table size; power for a step of 1 innovation sd and for a
slope change; random walks (share refused).

**Real series and predictions** (the dates are documented interventions, fixed before any run):

- A. UK car drivers killed or seriously injured, logs, period 12, date 1983-02 (front-seat belt law of
  31 January 1983; `data/uk-driver-deaths.csv`): joint p <= 0.01 and a step d between -0.35 and -0.05.
- B. Front-seat passengers KSI (`data/uk-road-casualties.csv`, `front`), same setup: joint p <= 0.01, d < 0.
- C. Rear-seat passengers KSI (`rear`), not covered by the 1983 law, same setup (the control): no
  significant drop, i.e. the step's bootstrap p > 0.05 or d >= 0.
- D. Nile annual flow (`data/nile.csv`), date 1899 (first year after the Aswan dam of 1898): joint
  p <= 0.01 and d < 0.
- E. Placebos: Nottingham monthly temperature (`data/nottem.csv`), period 12, dates 1925-01, 1930-01,
  1935-01: at most one of the three with joint p <= 0.05.

**Bar to ship** (CLI `--known-date`, report, agent tool): the synthetic size bar holds in every cell
and A, B, C and D all meet their predictions. E is reported either way. If anything in the bar fails,
the README records the negative result and nothing ships in the CLI.
