"""Milestone 4f's estimators read ~1 when every view adds an independent offset to f."""
import importlib.util, itertools, os
import numpy as np

HERE = os.path.dirname(__file__)
_spec = importlib.util.spec_from_file_location("m4f", os.path.join(HERE, "..", "experiments", "m4f_setsize", "analyse.py"))
m4f = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4f)


def fake(seed=0, tau=0.02):
    rng = np.random.default_rng(seed)
    off = rng.normal(0, tau, 13)
    return {v: dict(f=500 * (1 + off[list(v)].mean()), sf=500 * tau / np.sqrt(len(v)) / 2, status=2)
            for n in range(3, 14) for v in itertools.combinations(range(13), n)}


def test_jackknife_and_references_agree_under_independent_offsets():
    rat = m4f.ratios(m4f.per_size(fake()))
    for n in (4, 5, 6):
        assert 0.85 < rat[n]["J_dp"] < 1.15 and 0.85 < rat[n]["a13_dp"] < 1.15
    for n in range(4, 11):
        assert 0.8 < rat[n]["J_a13"] < 1.2
        assert 0.4 < rat[n]["R_a13"] < 0.6        # sf was set to half the true sd


def test_failed_solves_are_skipped():
    sols = fake(1)
    sols[(0, 1, 2, 3)]["status"] = 0
    tab = m4f.per_size(sols)
    assert tab[4]["converged"] == tab[4]["sets"] - 1
