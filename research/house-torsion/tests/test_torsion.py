import math

from house_diaphragm.model import rigid_split
from house_torsion.model import eccentric_split, worst_split


def test_zero_ecc_matches_rigid_split():
    a = eccentric_split(4000, 3.0, 9.0, 12.0, 40, 28, 0.0)
    b = rigid_split(4000, 3.0, 9.0, 12.0, 40, 28)
    assert all(math.isclose(x, y, rel_tol=1e-9) for x, y in zip(a, b))


def test_force_balance_for_any_ecc():
    for e in (-4.0, 0.0, 2.0, 6.0):
        fa, fb, _ = eccentric_split(5000, 2.0, 7.0, 10.0, 40, 28, e)
        assert math.isclose(fa + fb, 5000, rel_tol=1e-9)


def test_moment_balance():
    fa, fb, th = eccentric_split(5000, 2.0, 7.0, 10.0, 40, 28, 3.0)
    k_long, W, L = 10.0, 28, 40
    moment = fa * (-L / 2) + fb * (L / 2) + th * k_long * (W / 2) ** 2
    assert math.isclose(moment, 5000 * 3.0, rel_tol=1e-9)


def test_equal_walls_split_by_lever_arm():
    fa, fb, _ = eccentric_split(1000, 5.0, 5.0, 0.0, 40, 28, 2.0)
    # no long walls: pure two-line lever, fb - fa = 2 F e / L
    assert math.isclose(fb - fa, 2 * 1000 * 2.0 / 40, rel_tol=1e-9)


def test_worst_split_grows_with_ecc_and_is_symmetric_for_equal_walls():
    a0, b0 = worst_split(1000, 5, 5, 10, 40, 28, 0.0)
    a1, b1 = worst_split(1000, 5, 5, 10, 40, 28, 0.05)
    assert math.isclose(a0, 500) and a1 > a0
    assert math.isclose(a1, b1)


def test_stiff_end_attracts_more_torque():
    # B stiffer than A: offsetting toward B raises B's load above the no-torsion value
    _, b0, _ = eccentric_split(1000, 1.0, 9.0, 10.0, 40, 28, 0.0)
    _, b1, _ = eccentric_split(1000, 1.0, 9.0, 10.0, 40, 28, 2.0)
    assert b1 > b0
