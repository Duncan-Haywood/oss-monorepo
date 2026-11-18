import importlib.util
import pathlib
import random

_d = pathlib.Path(__file__).resolve().parents[1] / "experiments" / "hub_airspace"
_s = importlib.util.spec_from_file_location("hub_airspace_robust_selection", _d / "robust_selection.py")
rs = importlib.util.module_from_spec(_s)
_s.loader.exec_module(rs)
gp = rs.gp

PARTS = gp.bipartitions()[1:]
MK = rs.masks(PARTS)


def _v(seed=1):
    r = random.Random(seed)
    return [r.uniform(0.1, 5.0) for _ in rs.CROSS]


def test_mask_scores_match_graph_partition_score():
    v = _v()
    w = {(i, j, "enr"): x for (i, j), x in zip(rs.CROSS, v)}
    s = rs.scores(v, MK)
    for p, x in zip(PARTS, s):
        assert abs(gp.score(w, p) - x) < 1e-9


def test_zero_noise_rules_equal_argmax():
    v = _v(2)
    order, _ = rs.ranked(PARTS, v, MK)
    dr = rs.draws(v, 0.0, random.Random(0), k=20)
    assert rs.vote(PARTS, v, MK, dr) == order[0]
    assert rs.cvar(PARTS, v, MK, dr) == order[0]
    w = {(i, j, "enr"): x for (i, j), x in zip(rs.CROSS, v)}
    assert PARTS[order[0]] == gp.best(PARTS, w)


def test_draws_are_mean_one():
    v = [1.0] * len(rs.CROSS)
    dr = rs.draws(v, 0.25, random.Random(3), k=4000)
    m = sum(sum(d) for d in dr) / (len(dr) * len(v))
    assert abs(m - 1.0) < 0.01


def test_normalised_mean_sums_to_one():
    out = rs.normalised_mean([_v(4), _v(5), [2 * x for x in _v(4)]])
    assert abs(sum(out) - 1.0) < 1e-12


def test_spearman_and_sign_test():
    assert abs(rs.spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1.0) < 1e-12
    assert abs(rs.spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1.0) < 1e-12
    lo, hi, p = rs.sign_test([0, 0, 0, 0, 0], [1, 1, 1, 1, 1])
    assert (lo, hi) == (5, 0) and abs(p - 0.0625) < 1e-12
