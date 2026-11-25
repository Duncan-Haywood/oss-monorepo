import importlib.util
import math
import os
import sys

HERE = os.path.join(os.path.dirname(__file__), "..", "experiments", "hub_airspace")
sys.path.insert(0, HERE)


def _mod(name, fname):
    spec = importlib.util.spec_from_file_location(name, os.path.join(HERE, fname))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


st = _mod("stale_track_test", "stale_track.py")


def test_ages_are_a_distribution_with_the_geometric_mean():
    """Mean age = latency + period / 2 + period q / (1 - q)."""
    for q in st.QS:
        ag = st.ages(q)
        assert abs(sum(w for _, w in ag) - 1.0) < 1e-12
        mean = sum(A * w for A, w in ag)
        assert abs(mean - (st.LAT + 0.5 * st.PERIOD + st.PERIOD * q / (1 - q))) < 1e-4


def test_age_scaled_radius_meets_the_budget_exactly():
    c = 1.7e-4
    for acc in st.ACCS:
        mix, b = st.ar_mix(c, 12.54, acc, 0.75)
        miss = sum(w * math.exp(-((r - st.LAM_H) ** 2) / (2 * st.sig(A, r, 12.54, acc) ** 2))
                   for (r, w), (A, _) in zip(mix, st.ages(0.75)))
        assert abs(miss / b - 1) < 1e-9
        assert abs(c * (b + st.th.p_v(st.Z)) - st.TG) < 1e-18


def test_fixed_radius_meets_target_and_reduces_to_11bg_without_velocity_error():
    c = 1.7e-4
    r = st.r_fixed(c, st.TG, 12.54, 1.0, 0.5)
    ag = st.ages(0.5)
    assert c * (st.ph_fixed(r, 12.54, 1.0, ag) + st.th.p_v(st.Z)) <= st.TG * (1 + 1e-9)
    assert c * (st.ph_fixed(r - 0.01, 12.54, 1.0, ag) + st.th.p_v(st.Z)) > st.TG
    r0 = st.r_fixed(c, st.TG, 12.54, 0.0, 0.5)              # no velocity error: age does not matter
    assert abs(r0 - st.th.r_needed(c, st.TG, 12.54, st.Z)) < 1e-6


def test_one_radius_grows_with_loss_and_speed_error():
    c = 1.7e-4
    rs = [st.r_fixed(c, st.TG, 12.54, 1.0, q) for q in st.QS]
    assert rs == sorted(rs)
    assert st.r_fixed(c, st.TG, 12.54, 3.0, 0.5) > st.r_fixed(c, st.TG, 12.54, 1.0, 0.5)
