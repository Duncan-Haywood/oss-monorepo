import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_random_layouts", _d / "random_layouts.py")
rl = importlib.util.module_from_spec(_s)
_s.loader.exec_module(rl)

PTS = [(x * 250.0, y * 250.0) for x in range(-20, 21) for y in range(-20, 21)]


def test_draw_layout_is_deterministic_and_valid():
    a = rl.draw_layout(PTS, 3)
    b = rl.draw_layout(PTS, 3)
    assert a == b
    hubs, radii, speeds, shares = a
    assert len(hubs) == rl.M and all(math.dist(p, q) >= rl.MIN_SEP for i, p in enumerate(hubs) for q in hubs[i + 1:])
    assert all(rl.R_LO <= r <= rl.R_HI for r in radii) and all(rl.V_LO <= v <= rl.V_HI for v in speeds)
    assert math.isclose(sum(shares), 1.0)


def test_mix_radii_respects_radius_and_share():
    hubs, radii, shares = [(0.0, 0.0), (1000.0, 0.0)], [1000.0, 2500.0], [0.3, 0.7]
    mix = rl.mix_radii(PTS, hubs, radii, shares)
    for j in range(2):
        mine = [m for m in mix if m[1] == j]
        assert math.isclose(sum(m[0] for m in mine), shares[j])
        assert all(0 < math.hypot(m[4] - m[2], m[5] - m[3]) <= radii[j] for m in mine)


def test_heuristics_density_and_overlap():
    hubs, radii, shares = [(0.0, 0.0), (500.0, 0.0), (4000.0, 4000.0)], [1000.0, 1000.0, 600.0], [0.5, 0.3, 0.2]
    dist, over, dens = rl.heuristics(PTS, hubs, radii, shares)
    assert math.isclose(dist[(0, 1, "enr")], 0.15 / 500.0)
    assert over[(0, 2, "enr")] == 0.0 and dens[(1, 2, "enr")] == 0.0
    assert over[(0, 1, "enr")] > 0 and dens[(0, 1, "enr")] < over[(0, 1, "enr")]


def test_spearman_and_median():
    assert math.isclose(rl.spearman([1, 2, 3, 4], [10, 20, 30, 40]), 1.0)
    assert math.isclose(rl.spearman([1, 2, 3, 4], [4, 3, 2, 1]), -1.0)
    assert rl.median([3, 1, 2]) == 2 and rl.median([4, 1, 2, 3]) == 2.5
