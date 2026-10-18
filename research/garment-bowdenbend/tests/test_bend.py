import math, pytest
from garment_bowdenbend.bend import bowden_eff, critical_bend, waist_net
from garment_assistloc.location import net_change


def test_eff_capstan():
    assert bowden_eff(0.1, 0) == 1.0
    assert bowden_eff(0.1, math.pi) == pytest.approx(math.exp(-0.1 * math.pi))


def test_more_bend_or_friction_costs_more():
    assert waist_net(0.3, 4, 3, 0.1, 6) > waist_net(0.3, 4, 3, 0.1, 2)
    assert waist_net(0.3, 4, 3, 0.2, 3) > waist_net(0.3, 4, 3, 0.05, 3)


def test_critical_bend_is_crossing():
    th = critical_bend(0.3, 4, 3.0, 0.1)
    assert th is not None and th > 0
    assert waist_net(0.3, 4, 3.0, 0.1, th) == pytest.approx(net_change("shank", 0.3, 4, 3.0), abs=1e-6)


def test_ratio_one_never_wins():
    assert critical_bend(0.3, 4, 1.0, 0.1) == 0.0


def test_negative_rejected():
    with pytest.raises(ValueError):
        bowden_eff(-0.1, 1)
