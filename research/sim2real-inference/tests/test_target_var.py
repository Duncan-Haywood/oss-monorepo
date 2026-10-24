import os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "experiments", "m6d_target_variance"))
import numpy as np
from target_var import eb_halfwidth


def test_eb_shrinks_with_n_and_variance():
    assert eb_halfwidth(0.01, 1.0, 240) < eb_halfwidth(0.01, 1.0, 60)
    assert eb_halfwidth(0.001, 1.0, 100) < eb_halfwidth(0.01, 1.0, 100)


def test_one_sided_identity():
    rng = np.random.default_rng(1)
    t = rng.random(1000)
    r = t * rng.random(1000)
    assert abs(np.abs(r - t).var() - (r - t).var()) < 1e-12
