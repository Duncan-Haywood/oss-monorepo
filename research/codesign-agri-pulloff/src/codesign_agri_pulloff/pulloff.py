"""Re-runs codesign-agri (model and optimisers imported unchanged) with the stem pull-off force taken from measurements.
codesign-agri drew pull-off force from a lognormal with an ASSUMED median of 3.5 N. Dimeas et al. (2015), as reported by Rajendran et al. (2022),
measured 13.94 N to detach a 2.17 mm peduncle by pulling alone and 3.17 N for a 1.78 mm peduncle by bending and pulling. This file builds the
fruit population with the median set anywhere in that range, and exposes the 10 N gripping limit of Rajendran et al. as an upper bound for grip force."""
import os, sys
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", "codesign-agri", "src"))
from codesign_agri import agri as G, optimisers as O

BASE_MEDIAN = 3.5          # codesign-agri's assumed median, N
PULL_BEND, PULL_ONLY = 3.17, 13.94      # measured, N (Dimeas et al. via Rajendran et al. 2022)
GRIP_LIMIT = 10.0          # N, gripping force limit for the peduncle (Rajendran et al. 2022; Robofruit paper, safety factor 2 on 22.5-26.8 N)


def population(median, seed=12345, n=G.N_FRUIT):
    """Identical random stream to codesign_agri.agri._population; only the pull-off median differs."""
    r = np.random.default_rng(seed)
    d = np.clip(r.normal(28.0, 5.0, n), 15.0, 45.0)
    ripe = r.random(n)
    p_bruise = 110e3 - 70e3 * ripe
    f_detach = np.clip(r.lognormal(np.log(median), 0.3, n) * (1.2 - 0.5 * ripe), 0.5, None)
    e = np.abs(r.normal(0.0, 4.0, n))
    wet = r.random(n) < 0.3
    mu0 = np.where(wet, 0.35, 0.8) * r.uniform(0.85, 1.15, n)
    clutter = r.random(n)
    return dict(d=d, ripe=ripe, pb=p_bruise, fd=f_detach, e=e, mu0=mu0, clutter=clutter)


def make_evaluate(median):
    pop = population(median)
    return lambda x: G.evaluate(x, pop)


def set_grip_bound(fmax):
    """Moves the grip-force upper bound used by the optimisers (module-level array in codesign_agri.optimisers)."""
    O._UB[3] = fmax
