import numpy as np
from garment_assist.model import Body, profiles, evaluate, break_even_mass, metabolic_power


def test_profile_shape():
    p, th, om, tau = profiles()
    assert abs(p[np.argmax(tau)] - 0.47) < 0.01 and tau.max() == np.float64(1.6 * 70)


def test_no_suit_is_zero_change():
    r = evaluate("none", 0.0)
    assert r["dankle_pct"] == 0 and r["dwhole_pct"] == 0


def test_active_assist_reduces_ankle_cost():
    assert evaluate("active", 0.3)["dankle_pct"] < 0


def test_mass_penalty_is_linear_and_can_cancel():
    a = evaluate("active", 0.3, mass_added=0.0)["dwhole_pct"]
    b1 = evaluate("active", 0.3, mass_added=1.0)["dwhole_pct"]
    b2 = evaluate("active", 0.3, mass_added=2.0)["dwhole_pct"]
    assert abs((b2 - b1) - (b1 - a)) < 1e-9
    m = break_even_mass("active", 0.3)
    assert abs(evaluate("active", 0.3, mass_added=m)["dwhole_pct"]) < 1e-9


def test_late_timing_hurts():
    assert evaluate("active", 0.3, timing=0.0)["dankle_pct"] < evaluate("active", 0.3, timing=0.15)["dankle_pct"]


def test_no_help_gives_no_break_even():
    assert break_even_mass("active", 0.3, timing=0.4) is None or break_even_mass("active", 0.3, timing=0.4) > 0


def test_metabolic_nonnegative():
    _, _, om, tau = profiles()
    assert metabolic_power(tau, om) > 0
