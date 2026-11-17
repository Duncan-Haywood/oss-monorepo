"""Simulated regression discontinuity data for the tests and the page example.

Sharp design: the Lee (2008) calibration used in the simulations of
Calonico, Cattaneo & Titiunik (2014, Econometrica), Model 1: running variable
x = 2*Beta(2,4) - 1, cutoff 0, fifth-order polynomial on each side, normal
noise with sd 0.1295. The true jump at the cutoff is 0.52 - 0.48 = 0.04.

Fuzzy design: same x; take-up probability 0.2 below the cutoff and 0.7 above
(plus a gentle slope), outcome jumps by 0.5 for each unit treated, so the
local average treatment effect is 0.5.

Covariate z: smooth in x, no jump (a placebo outcome). Written with numpy's
PCG64 so the files can be regenerated exactly: python3 eval/simulate.py
"""
import numpy as np, pathlib

here = pathlib.Path(__file__).parent
rng = np.random.default_rng(20140101)

def lee(x):
    l = 0.48 + 1.27*x + 7.18*x**2 + 20.21*x**3 + 21.54*x**4 + 7.33*x**5
    r = 0.52 + 0.84*x - 3.00*x**2 + 7.99*x**3 - 9.01*x**4 + 3.56*x**5
    return np.where(x >= 0, r, l)

n = 1000
x = 2*rng.beta(2, 4, n) - 1
y = lee(x) + rng.normal(0, 0.1295, n)
z = 0.3 + 0.5*x + rng.normal(0, 0.2, n)
with open(here / "../data/lee-simulated.csv", "w") as f:
    f.write("vote_margin,next_vote_share,prior_share\n")
    for a, b, c in zip(x, y, z):
        f.write(f"{a:.6f},{b:.6f},{c:.6f}\n")

n = 1500
x = rng.uniform(-1, 1, n)
p = np.where(x >= 0, 0.7, 0.2) + 0.1*x
d = (rng.uniform(0, 1, n) < p).astype(int)
y = 1 + 0.8*x - 0.4*x**2 + 0.5*d + rng.normal(0, 0.3, n)
with open(here / "fuzzy.csv", "w") as f:
    f.write("score,treated,outcome\n")
    for a, b, c in zip(x, d, y):
        f.write(f"{a:.6f},{b},{c:.6f}\n")

# Integer running variable with many ties (test scores), sharp design at 50.
n = 800
s = rng.integers(20, 81, n)
y = 10 + 0.2*(s - 50) + 3.0*(s >= 50) + rng.normal(0, 2.0, n)
with open(here / "ties.csv", "w") as f:
    f.write("score,outcome\n")
    for a, c in zip(s, y):
        f.write(f"{a},{c:.6f}\n")
