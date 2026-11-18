"""Simulate the example data: a voluntary job-training programme with confounding.

Writes data/job-training-simulated.csv (2,000 rows) and prints the true
sample average effects, which are written into data/SOURCE.md by hand.
numpy PCG64, seed 20261118. Nothing here comes from a real study.
"""
import numpy as np
from pathlib import Path

rng = np.random.Generator(np.random.PCG64(20261118))
n = 2000
age = rng.integers(18, 56, n)
educ = rng.integers(8, 19, n)
married = rng.binomial(1, 0.4, n)
unemployed = rng.binomial(1, 0.3, n)
# prior earnings, thousands of dollars a year; lower for the unemployed
prior = np.round(np.clip(rng.gamma(4.0, 4.5, n) * (1 - 0.45 * unemployed), 0, None), 2)

# Who signs up: younger, less schooling, recently unemployed, lower earnings
lin = -0.6 - 0.035 * (age - 35) - 0.15 * (educ - 12) + 0.9 * unemployed - 0.06 * (prior - 15) - 0.3 * married
p = 1 / (1 + np.exp(-lin))
d = rng.binomial(1, p)

# The effect differs by person: larger for the unemployed and low earners
tau = 1.0 + 1.2 * unemployed - 0.04 * (prior - 15)
y0 = 4 + 0.08 * age + 0.55 * educ + 0.75 * prior + 1.2 * married - 1.5 * unemployed + rng.normal(0, 4, n)
y = np.round(y0 + tau * d, 2)

out = Path(__file__).resolve().parent.parent / "data" / "job-training-simulated.csv"
with out.open("w") as f:
    f.write("person,age,education_years,married,unemployed_last_year,prior_earnings,trained,earnings_after\n")
    for i in range(n):
        f.write(f"{i + 1},{age[i]},{educ[i]},{married[i]},{unemployed[i]},{prior[i]:.2f},{d[i]},{y[i]:.2f}\n")

print("n", n, "treated", int(d.sum()))
print("sample ATE (mean tau, all)", round(float(tau.mean()), 4))
print("sample ATT (mean tau, treated)", round(float(tau[d == 1].mean()), 4))
print("sample ATC (mean tau, controls)", round(float(tau[d == 0].mean()), 4))
print("naive difference in means", round(float(y[d == 1].mean() - y[d == 0].mean()), 4))
print("propensity range", round(float(p.min()), 4), round(float(p.max()), 4))
