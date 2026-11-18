"""Simulate the example data: returns to schooling with an omitted ability term.

Writes data/schooling-simulated.csv (3,000 people in 150 counties) and prints
what data/SOURCE.md quotes. numpy PCG64, seed 20261118. Nothing here comes
from a real survey.

The story: people with more unobserved ability get more schooling and earn
more at any schooling level, so ordinary least squares overstates the return
to a year of school. Growing up in a county with a four-year college nearby,
or with lower public tuition, raises schooling but has no other route to
wages, so both are valid instruments. The true return is 0.08 (8% a year).
"""
import numpy as np
from pathlib import Path

rng = np.random.Generator(np.random.PCG64(20261118))
G, per = 150, 20
n = G * per
county = np.repeat(np.arange(1, G + 1), per)

# County-level traits: college nearby, public tuition ($ thousand a year),
# urban, south, and a county wage shock unrelated to the instruments.
near_c = rng.binomial(1, 0.45, G)
tuition_c = np.round(rng.uniform(2.0, 9.0, G), 2)
urban_c = rng.binomial(1, 0.6, G)
south_c = rng.binomial(1, 0.35, G)
shock_c = rng.normal(0, 0.10, G)
near, tuition, urban, south, shock = (v[county - 1] for v in (near_c, tuition_c, urban_c, south_c, shock_c))

black = rng.binomial(1, 0.15, n)
ability = rng.normal(0, 1, n)
exper = rng.integers(1, 26, n)

educ_latent = 12.6 + 0.9 * ability + 0.7 * near - 0.18 * (tuition - 5.5) - 0.5 * black + 0.4 * urban - 0.3 * south + rng.normal(0, 1.6, n)
educ = np.clip(np.round(educ_latent), 8, 20).astype(int)

beta = 0.08
sd = 0.28 + 0.008 * exper  # heteroskedastic: wages spread out with experience
lwage = (1.1 + beta * educ + 0.045 * exper - 0.0008 * exper**2 - 0.14 * black - 0.09 * south
         + 0.15 * urban + 0.12 * ability + shock + rng.normal(0, 1, n) * sd)
lwage = np.round(lwage, 4)

out = Path(__file__).resolve().parent.parent / "data" / "schooling-simulated.csv"
with out.open("w") as f:
    f.write("person,county,log_wage,education_years,experience,experience_sq,black,south,urban,college_nearby,tuition\n")
    for i in range(n):
        f.write(f"{i + 1},{county[i]},{lwage[i]:.4f},{educ[i]},{exper[i]},{exper[i] ** 2},{black[i]},{south[i]},{urban[i]},{near[i]},{tuition[i]:.2f}\n")

print("n", n, "counties", G)
print("corr(educ, ability)", round(float(np.corrcoef(educ, ability)[0, 1]), 4))
print("mean educ", round(float(educ.mean()), 3), "range", int(educ.min()), int(educ.max()))
print("counties with a college nearby", int(near_c.sum()))
print("true return to schooling", beta)
