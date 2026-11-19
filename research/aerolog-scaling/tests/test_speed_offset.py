import importlib.util
import os
import sys

import numpy as np

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


so = _mod("speed_offset_test", "speed_offset.py")
rb = _mod("rtk_baro_for_so", "rtk_baro.py")


def test_offsets_match_11an_p4_set():
    c = so.offsets_10(rb.load())
    assert len(c) == 5
    # 11an's rtk_baro_stats_results.txt: median 0.806, min -4.703, max 1.553
    assert abs(np.median(c) - 0.806) < 1e-3
    assert abs(c.min() + 4.703) < 1e-3 and abs(c.max() - 1.553) < 1e-3
    assert len(so.offsets_10(rb.load(), all12=True)) == 12


def test_with_offsets_cancels_inside_an_operator():
    sup = {(0, 0): np.array([0.1, -0.1]), (0, 1): np.array([0.0, 0.2]), (1, 1): np.array([0.3])}
    out = so.with_offsets(sup, np.array([2.0, -1.0]))
    assert np.allclose(out[(0, 0)], sup[(0, 0)]) and np.allclose(out[(1, 1)], sup[(1, 1)])
    assert np.allclose(out[(0, 1)], [3.0, 3.2])


def test_with_spread_keeps_mean_and_adds_variance():
    c10 = np.array([-2.0, 0.0, 2.0])
    sup = {(0, 0): np.zeros(10), (0, 1): np.zeros(10)}
    out = so.with_spread(sup, c10, 1.0)
    assert np.allclose(out[(0, 0)], 0.0)
    d = (c10[:, None] - c10[None, :]).ravel()
    assert abs(out[(0, 1)].mean()) < 1e-12
    assert abs(np.mean(out[(0, 1)] ** 2) - np.mean(d ** 2)) < 1e-9


def test_draw_offsets_deterministic_and_scaled():
    c10 = np.array([1.0, 2.0, 3.0])
    a = so.draw_offsets(c10, 6, 0.5, 42)
    assert np.allclose(a, so.draw_offsets(c10, 6, 0.5, 42))
    assert set(np.round(a, 9)) <= {0.5, 1.0, 1.5}
