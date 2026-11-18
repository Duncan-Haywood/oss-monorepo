import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'experiments'))

from marine_hull import suboff  # noqa: E402


def test_hydrostatics_match_report():
    vol, area = suboff.hydrostatics(1000)
    assert abs(vol - suboff.REFERENCE['volume_m3']) < 0.001
    assert abs(area - suboff.REFERENCE['wetted_m2']) < 0.001


def test_radius_continuous_at_joins():
    for x in (suboff.X_FORE, suboff.X_MID, suboff.X_AFT):
        assert abs(suboff.radius_ft(x - 1e-7) - suboff.radius_ft(x + 1e-7)) < 1e-6


def test_ends_closed_and_max_radius():
    assert suboff.radius_ft(0.0) == 0.0 and suboff.radius_ft(suboff.X_END) == 0.0
    assert abs(suboff.radius(5.0 * suboff.FT) - 0.254) < 1e-9


def test_cylinder_limit_of_integrator():
    # the middle body alone is a cylinder: area 2 pi R L exactly
    L = (suboff.X_MID - suboff.X_FORE) * suboff.FT
    assert abs(2 * math.pi * 0.254 * L - 2 * math.pi * suboff.radius(6.0 * suboff.FT) * L) < 1e-12


def test_hoerner_and_implied_k():
    import run_suboff_bare as r
    assert abs(r.hoerner(0.508 / 4.3561) - 1.0708) < 1e-3
    # implied (1+k) inverts the resistance law
    from marine_hull.hull import cf_ittc57
    u, s, L = 6.0, 5.988, 4.3561
    rt = 0.5 * r.RHO * u * u * s * 1.17 * cf_ittc57(u * L / 1e-6)
    assert abs(r.implied(u, rt, s, L, 1e-6) - 1.17) < 1e-12
