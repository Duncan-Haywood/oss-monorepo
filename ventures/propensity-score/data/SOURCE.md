# Example data

`job-training-simulated.csv` is simulated, not observed. It has 2,000 rows
drawn by `eval/simulate.py` (numpy PCG64, seed 20261118), generated
2026-11-18. No data from any study or package are included.

- Covariates: `age` uniform on 18-55, `education_years` uniform on 8-18,
  `married` Bernoulli(0.4), `unemployed_last_year` Bernoulli(0.3), and
  `prior_earnings` (thousand dollars a year) = Gamma(4, 4.5) x (1 - 0.45
  unemployed).
- Who joins (`trained`): logit = -0.6 - 0.035 (age - 35) - 0.15 (education -
  12) + 0.9 unemployed - 0.06 (prior - 15) - 0.3 married. Younger, less
  schooled, recently unemployed and low-earning people join more.
- Outcome (`earnings_after`) = 4 + 0.08 age + 0.55 education + 0.75 prior +
  1.2 married - 1.5 unemployed + N(0, 4^2) + tau x trained, with a personal
  effect tau = 1.0 + 1.2 unemployed - 0.04 (prior - 15).

What the script printed for this draw: 727 of 2,000 trained; sample average
effect (mean of tau) 1.3327 over everyone, 1.6439 over the trained, 1.1549
over the rest; raw difference in means -3.6178; true propensity scores from
0.0155 to 0.8959. The population ATE of the design is 1.3372 and its ATT
1.6619 (`eval/coverage.mjs`).
