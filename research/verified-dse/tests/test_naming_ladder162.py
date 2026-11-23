"""Milestone 162: the ladder's edge under three namings (the A3 average, the analysed-set rule, and the committed flow table)."""
import importlib.util
import math
from pathlib import Path

NL = Path(__file__).resolve().parents[1] / "experiments" / "naming_ladder"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t162", NL / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _row(area, wns, p=10.0):
    r = {"period_ns": p, "status": "ok"}
    for st in ("global_place", "detail_place"):
        r[f"{st}_area"], r[f"{st}_wns"] = area, wns
    r["final_area_notap"], r["final_wns"] = area, wns
    return r


def test_a3_score_is_the_geometric_mean_of_the_draws_scores():
    m = _load()
    rs = [_row(100.0, 1.0), _row(110.0, -2.0), _row(95.0, 0.5)]
    a = m.average(rs)
    for area, wns in (("global_place_area", "global_place_wns"), ("detail_place_area", "detail_place_wns"),
                      ("final_area_notap", "final_wns")):
        got = a[area] * (10.0 - a[wns])
        want = math.exp(sum(math.log(r[area] * (10.0 - r[wns])) for r in rs) / 3)
        assert abs(got / want - 1) < 1e-12


def test_complete_is_a_prefix_rule():
    m = _load()
    d0, d1 = m.ORDER[0], m.ORDER[1]
    rs = [{"design": d, "variant": v, "i": i} for d in (d0, d1) for v in ("C", "R") for i in range(120)]
    assert m.complete(rs) == [d0, d1]
    assert m.complete([r for r in rs if not (r["design"] == d0 and r["i"] == 5 and r["variant"] == "R")]) == []


def test_committed_table_controls_and_predictions():
    m = _load()
    if not m.TABLE.exists() or not m.complete(m.rows()):
        return
    res = m.analyse(Path("/dev/null"), quiet=True)
    c1, n1 = res["c1"]
    c2, n2 = res["c2"]
    # milestone 162b: 3 of 2,777 points differ only in the mapped rung's OpenSTA WNS, by 0.01 ns (div8l 90, isq14 45, div14l 47)
    assert n1 > 0 and n1 - c1 == 3
    assert n2 > 0 and c2 == n2
    assert len(res["designs"]) == 27
    assert res["held"] == [True, True, True, True, False, True, False]
