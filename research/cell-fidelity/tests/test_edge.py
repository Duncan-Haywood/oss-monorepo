import importlib.util
import math
from pathlib import Path

HERE = Path(__file__).resolve().parents[1] / "experiments" / "edge"
spec = importlib.util.spec_from_file_location("edge_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_spearman_handles_ties_and_degenerate_input():
    assert run.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert run.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    assert run.spearman([1, 2], [1, 2]) is None
    assert run.spearman([1, 1, 1], [1, 2, 3]) is None
    assert abs(run.spearman([1, 2, 2, 3], [1, 2, 3, 4]) - 0.9486832980505138) < 1e-12


def test_factors_multiply_back_to_the_score():
    wh = [10.0] + [9.0] * 98 + [6.0]
    f = run.factors(200.0, dict(cycle_wh=wh, mass_kg=0.1))
    assert f["bol"] == 100.0 and f["score"] == 60.0
    assert abs(200.0 * f["util"] * f["ret"] - f["score"]) < 1e-12


def test_factors_drop_unfinished_or_empty_runs():
    assert run.factors(100.0, dict(cycle_wh=[1.0] * 99, mass_kg=0.1)) is None
    assert run.factors(100.0, dict(cycle_wh=[0.0] * 100, mass_kg=0.1)) is None


def test_front_layers():
    pts = [(10, 0.0), (8, 0.5), (6, 0.4), (5, 0.9), (4, 0.1)]
    assert run.front(pts, 1) == [0, 1, 3]
    assert run.front(pts, 2) == [0, 1, 2, 3]


def test_variance_shares_sum_to_one():
    rows = []
    for k in range(6):
        u, util, ret = 100 + 10 * k, 0.9 - 0.05 * k, 0.4 + 0.01 * (k % 3)
        rows.append(dict(u=u, util=util, ret=ret, score=u * util * ret))
    sh = run.var_shares(rows)
    assert abs(sum(sh.values()) - 1.0) < 1e-9


def _pool():
    rows = []
    for k in range(30):
        rkt = -0.5 + k * 0.05
        u = 400 - 8 * k
        util = 0.95 if rkt >= 0.1 else 0.95 - (0.1 - rkt)
        ret = 0.4
        rows.append(dict(j=k, u=u, rkt=rkt, util=util, ret=ret, bol=u * util, score=u * util * ret))
    return rows


def test_condition_finds_two_regimes_and_the_edge_optimum():
    c = run.condition(_pool())
    assert c["u_rkt"] == -1.0
    assert c["sound_u_bol"] == 1.0 and c["starved_rkt_util"] == 1.0
    assert 0.0 <= c["best_rkt"] <= 0.3
    assert c["front_gap"][1] == 0.0 and c["front_calls"][1] == 30
    assert math.isclose(c["top_u_gap"][1], 0.0, abs_tol=1e-12)


def test_verdicts_follow_the_registered_ranges():
    good = dict(sound_u_bol=0.9, starved_rkt_util=0.7, u_rkt=-0.5, front_gap={1: 0.02})
    assert run.verdicts({"a": good}) == dict(H74="supported", H75="supported", H76="supported", H77="supported")
    bad = dict(sound_u_bol=0.4, starved_rkt_util=0.2, u_rkt=0.1, front_gap={1: 0.11})
    assert run.verdicts({"a": bad}) == dict(H74="refuted", H75="refuted", H76="refuted", H77="refuted")
    mid = dict(sound_u_bol=0.6, starved_rkt_util=None, u_rkt=-0.1, front_gap={1: 0.08})
    assert run.verdicts({"a": mid}) == dict(H74="mixed", H75="untestable", H76="mixed", H77="mixed")
