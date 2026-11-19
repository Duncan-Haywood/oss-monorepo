"""Milestone 7ad: the outer-loop model, the conditional-integration probe and the verdict file."""
import importlib.util
import os
import sys

import numpy as np

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.join(HERE, "..", "src"))
from codesign_cant import poshold as P  # noqa: E402

_spec = importlib.util.spec_from_file_location("m7ad_model", os.path.join(HERE, "..", "experiments", "m7ad_settle", "model.py"))
MO = importlib.util.module_from_spec(_spec); _spec.loader.exec_module(MO)


def test_slow_root_is_near_minus_ki_over_kp_for_small_ki():
    for kp, kd, ki in ((15.0, 7.0, 0.3), (25.0, 6.0, 0.5), (12.0, 9.0, 0.1)):
        r = MO.slow_root(kp, kd, ki)[0]
        assert abs(r + ki / kp) < 0.1 * ki / kp


def test_model_tail_grows_with_ki_and_vanishes_without_integral():
    t0, _ = MO.tail(18.0, 7.0, 0.0)
    t1, _ = MO.tail(18.0, 7.0, 0.5)
    t2, _ = MO.tail(18.0, 7.0, 2.0)
    assert t0[0] < 0.005 < t1[0] < t2[0]


def test_conditional_integration_removes_the_model_tail():
    tl, _ = MO.tail(15.0, 6.9, 1.4)
    tb, _ = MO.tail(15.0, 6.9, 1.4, band_int=0.25)
    assert tl[0] > 0.05 > 0.02 > tb[0]


def _roll(band):
    old = P.PINT_BAND
    P.PINT_BAND = band
    try:
        rng = np.random.default_rng(0)
        x = rng.uniform(0.2, 0.8, size=(2, 12))
        return P.score(x, episodes=2, seed=1)
    finally:
        P.PINT_BAND = old


def test_default_band_is_none_and_an_infinite_band_changes_nothing():
    assert P.PINT_BAND is None
    a, b = _roll(None), _roll(np.inf)
    np.testing.assert_array_equal(np.asarray(a[0]), np.asarray(b[0]))
    c = _roll(0.01)
    assert not np.array_equal(np.asarray(a[0]), np.asarray(c[0]))


def test_verdicts_file_is_what_the_script_prints():
    d = os.path.join(HERE, "..", "experiments", "m7ad_settle")
    if not os.path.exists(os.path.join(d, "results.json")):
        return
    import subprocess
    before = open(os.path.join(d, "verdicts.txt")).read()
    subprocess.run([sys.executable, "verdicts.py"], cwd=d, check=True, capture_output=True)
    assert open(os.path.join(d, "verdicts.txt")).read() == before
    assert "Verdicts:" in before and before.count("AD") >= 8
