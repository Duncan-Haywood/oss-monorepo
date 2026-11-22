"""Milestone 3y: update rules for the principal point and distortion (experiments/m3y_pp_dist)."""
import importlib.util, os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
_s = importlib.util.spec_from_file_location("m3y_an", os.path.join(HERE, "..", "experiments", "m3y_pp_dist", "analyse.py"))
an = importlib.util.module_from_spec(_s)
_s.loader.exec_module(an)


def test_d200_matches_hand_value():
    # board fr1 (k1 0.2226, k2 -0.5679, f 518.28): rho^2 = (200/518.28)^2
    r2 = (200 / 518.28) ** 2
    want = 200 * (0.2226 * r2 - 0.5679 * r2 ** 2)
    assert abs(an.d200(518.28, 0.2226, -0.5679) - want) < 1e-12
    assert an.d200(500.0, 0.0, 0.0) == 0.0
    # k3 only enters the TUM fr1 model
    assert an.d200(500.0, 0.0, 0.0, 1.0) == 200 * (0.4 ** 2) ** 3


def test_scatter_pool_floor_and_k1():
    assert an.scatter_pool([310.0], None) is None              # one window, no history: no bar
    m, sd = an.scatter_pool([310.0], 4.0)
    assert m == 310.0 and sd == 4.0
    v = [300.0, 310.0, 320.0]                                  # sample sd 10
    m, sd = an.scatter_pool(v, 4.0)
    assert m == 310.0 and abs(sd - 10 / np.sqrt(3)) < 1e-12    # scatter above the floor
    m, sd = an.scatter_pool(v, 20.0)
    assert abs(sd - 20 / np.sqrt(3)) < 1e-12                   # floor above the scatter


def test_score_in_pixels_and_regret():
    bl = [{"ref": {"board": 320.0}, "pool": (320.0 + d, 1.0)} for d in (-1.0, 0.0, 1.0, 2.0, 3.0)]
    s = an.score(bl, "cx")
    # always adopts: errors {1, 0, 1, 2, 3}, median 1 px at every delta
    assert all(abs(v - 1.0) < 1e-12 for v in s["rules"]["always"]["med"])
    # never keeps the held value: median error = delta
    assert np.allclose(s["rules"]["never"]["med"], an.GRID["cx"])
    # regret of always: 1 - min(1, delta) is largest at delta 0
    assert abs(s["rules"]["always"]["worst_regret"] - 1.0) < 1e-12
    assert s["rules"]["always"]["argworst_delta"] == 0.0
