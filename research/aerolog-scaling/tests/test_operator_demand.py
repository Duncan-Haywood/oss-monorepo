import importlib.util
import pathlib
import random

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_operator_demand", _d / "operator_demand.py")
od = importlib.util.module_from_spec(_s)
_s.loader.exec_module(od)
gp = od.gp


def _pairw(seed=1):
    r = random.Random(seed)
    return {(i, j, a + b): r.uniform(0.1, 5.0) for i, j in od.CROSS for a in "CR" for b in "CR"}


def test_mixed_picks_the_map_of_each_operator():
    pw = _pairw()
    src = "RCCCCCCR"
    w = od.mixed(pw, src)
    assert w[(0, 1, "enr")] == pw[(0, 1, "RC")]
    assert w[(0, 7, "enr")] == pw[(0, 7, "RR")]
    assert w[(2, 3, "enr")] == pw[(2, 3, "CC")]
    assert w[(3, 7, "enr")] == pw[(3, 7, "CR")]
    assert len(w) == len(od.CROSS)


def test_tv_is_zero_for_equal_and_one_for_disjoint():
    a = [(0.5, 100.0, 100.0), (0.5, 900.0, 100.0)]
    assert od.tv(a, a) == 0.0
    b = [(1.0, 5000.0, 5000.0)]
    assert abs(od.tv(a, b) - 1.0) < 1e-12


def test_mean_leg_is_weighted_distance():
    assert abs(od.mean_leg([(0.25, 3.0, 4.0), (0.75, 0.0, 10.0)], (0.0, 0.0)) - (1.25 + 7.5)) < 1e-12


def test_decompose_is_zero_when_paper_is_a_scaled_truth():
    r = random.Random(4)
    cf = {(i, j, "enr"): r.uniform(0.1, 3.0) for i, j in od.CROSS}
    pj = {k: 0.37 * v for k, v in cf.items()}
    parts = gp.bipartitions()[1:]
    op, terms = od.decompose(pj, cf, parts[5], parts[40])
    assert all(abs(x) < 1e-12 for x in op)
    assert all(abs(e) < 1e-12 for e in terms.values())


def test_decompose_total_is_the_margin_error():
    r = random.Random(5)
    cf = {(i, j, "enr"): r.uniform(0.1, 3.0) for i, j in od.CROSS}
    pj = {k: r.uniform(0.1, 3.0) for k in cf}
    parts = gp.bipartitions()[1:]
    P, Q = parts[11], parts[90]
    scale = sum(cf.values()) / sum(pj.values())
    spj = {k: scale * v for k, v in pj.items()}
    want = (gp.score(cf, P) - gp.score(cf, Q)) - (gp.score(spj, P) - gp.score(spj, Q))
    op, terms = od.decompose(pj, cf, P, Q)
    assert abs(sum(op) - want) < 1e-9
    assert abs(sum(terms.values()) - want) < 1e-9
