import importlib.util
import math
import pathlib

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_graph_partition", _d / "graph_partition.py")
gp = importlib.util.module_from_spec(_s)
_s.loader.exec_module(gp)
_o = importlib.util.spec_from_file_location("hub_airspace_operator_layers_t2", _d / "operator_layers.py")
ol = importlib.util.module_from_spec(_o)
_o.loader.exec_module(ol)


def _mix4():
    # four operators, two pairs of crossing legs and a shared hub for operator 0's two destinations
    return [(1.0, 0, 0.0, 0.0, 3000.0, 0.0), (1.0, 0, 0.0, 0.0, -2000.0, 1500.0),
            (1.0, 1, 1500.0, -1500.0, 1500.0, 1500.0), (1.0, 2, 3000.0, 1000.0, -500.0, -800.0),
            (1.0, 3, -1000.0, -1000.0, 2500.0, 900.0)]


SP = (12.0, 18.0, 24.0, 28.0)


def test_partition_counts():
    assert len(gp.bipartitions()) == 128 and len(set(gp.bipartitions())) == 128
    # Stirling numbers S(8,1..4) = 1 + 127 + 966 + 1701
    k4 = gp.kway()
    assert len(k4) == 2795 and len(set(k4)) == 2795
    assert all(p[0] == 0 and max(p) <= 3 for p in k4)
    assert len(gp.kway(m=4, k=2)) == 8


def test_decomposition_is_exact():
    mix = _mix4()
    base = lambda kind, vx, vy, h: ol.layer("semi", kind, vx, vy, h)
    w, _ = gp.simulate_pairs(mix, SP, 200, base, n_flights=8000, seed=9)
    for p in ((0, 0, 1, 1), (0, 1, 0, 1), (0, 1, 1, 0), (0, 0, 0, 1)):
        fn = lambda kind, vx, vy, h, p=p: ol.layer("semi", kind, vx, vy, h) + (p[h],)
        d, _ = gp.simulate_pairs(mix, SP, 200, fn, n_flights=8000, seed=9)
        for z in ("enr", "term"):
            assert sum(x for k, x in d.items() if k[2] == z) == gp.score(w, p, z)


def test_pair_simulator_matches_11e():
    mix = _mix4()
    fn = lambda kind, vx, vy, h: ol.layer("semi+pC", kind, vx, vy, h)
    w, _ = gp.simulate_pairs(mix, SP, 200, fn, n_flights=6000, seed=4)
    _, cnt = ol.simulate(mix, SP, 200, rule="semi+pC", n_flights=6000, seed=4)
    for c in ("same", "cross"):
        for z in ("term", "enr"):
            mine = sum(x for (i, j, zz), x in w.items() if zz == z and (i == j) == (c == "same"))
            assert mine == cnt[(c, z)]


def test_closed_form_pairs_sum_to_11e():
    mix = _mix4()
    for rule in ("semi", "semi+inout"):
        w = gp.closed_form_pairs(mix, SP, 200, rule, pairs=20000, seed=3)
        c = ol.closed_form(mix, SP, 200, rule=rule, pairs=20000, seed=3)
        for cl in ("same", "cross"):
            for z in ("term", "enr"):
                mine = sum(x for (i, j, zz), x in w.items() if zz == z and (i == j) == (cl == "same"))
                assert math.isclose(mine, c[(cl, z)], rel_tol=1e-9, abs_tol=1e-12)


def test_best_is_max_cut():
    w = {(0, 1, "enr"): 5.0, (2, 3, "enr"): 4.0, (0, 2, "enr"): 1.0, (1, 3, "enr"): 1.0, (0, 0, "enr"): 7.0}
    parts = gp.bipartitions(4)[1:]
    assert gp.best(parts, w) == (0, 1, 1, 0)
    assert gp.score(w, (0, 0, 0, 0)) == 18.0 and gp.score(w, (0, 1, 1, 0)) == 7.0 and gp.score(w, (0, 1, 0, 1)) == 9.0


def test_pearson():
    assert math.isclose(gp.pearson([1, 2, 3], [2, 4, 6]), 1.0)
