import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_operator_layers", _d / "operator_layers.py")
ol = importlib.util.module_from_spec(_s)
_s.loader.exec_module(ol)
_m = importlib.util.spec_from_file_location("hub_airspace_mixed_t", _d / "mixed_fleet.py")
mf = importlib.util.module_from_spec(_m)
_m.loader.exec_module(mf)


def _cross_mix(theta_deg, hub_b=1):
    th = math.radians(theta_deg)
    ux, uy = math.cos(th), math.sin(th)
    hb = (1500 - 1500 * ux, -1500 * uy)
    return [(1.0, 0, 0.0, 0.0, 3000.0, 0.0), (1.0, hub_b, hb[0], hb[1], 1500 + 1500 * ux, 1500 * uy)]


def test_layer_bits():
    assert ol.layer("single", "o", 1, 0, 3) == (0,)
    assert ol.layer("semi+inout", "i", -1, 0, 0) == (1, 1)
    assert ol.layer("pA", "o", 1, 0, 2) == (1,) and ol.layer("pA", "o", 1, 0, 1) == (0,)
    assert ol.layer("pC", "o", 1, 0, 3) == (0,) and ol.layer("pC", "o", 1, 0, 2) == (1,)
    assert len({ol.layer("semi+inout+pC", k, vx, 0, h) for k in "oi" for vx in (1, -1) for h in range(4)}) == 8


def test_old_rules_match_11d():
    # the four 11d rules give 11d's layer partition, so the 11d rows reproduce exactly
    legs = [(k, vx, vy, h) for k in "oi" for vx, vy in ((1, 0), (-1, 0), (0, 1), (0, -1), (-2, 3)) for h in range(4)]
    for rule, old in (("single", "single"), ("inout", "inout"), ("semi", "semi"), ("semi+inout", "semi_inout")):
        for a in legs:
            for b in legs:
                same_new = ol.layer(rule, *a) == ol.layer(rule, *b)
                same_old = mf.layer(old, *a[:3]) == mf.layer(old, *b[:3])
                assert same_new == same_old


def test_pairing_separates_operators():
    # operators 0 and 2 are in different pA groups: no cross conflict; 0 and 1 share a group: conflicts remain
    mix_apart = _cross_mix(90, hub_b=2)
    s, cnt = ol.simulate(mix_apart, (20.0, 20.0, 20.0, 20.0), 120, rule="pA", n_flights=20000, seed=1)
    assert cnt[("cross", "enr")] == 0 and ol.closed_form(mix_apart, (20.0,) * 4, 120, rule="pA", pairs=5000)[("cross", "enr")] == 0
    mix_same = _cross_mix(90, hub_b=1)
    s, cnt = ol.simulate(mix_same, (20.0,) * 4, 120, rule="pA", n_flights=20000, seed=1)
    assert cnt[("cross", "enr")] > 0


def test_single_rule_matches_11d_simulator():
    mix = _cross_mix(60)
    sp = (12.0, 28.0)
    a, _ = ol.simulate(mix, sp, 120, rule="single", n_flights=5000, seed=5)
    b, _ = mf.simulate(mix, sp, 120, rule="single", n_flights=5000, seed=5)
    assert a == b
    assert ol.closed_form(mix, sp, 120, pairs=3000) == mf.closed_form(mix, sp, 120, pairs=3000)


def test_kendall():
    assert ol.kendall([1, 2, 3], [4, 5, 6]) == 1.0
    assert ol.kendall([1, 2, 3], [6, 5, 4]) == -1.0
