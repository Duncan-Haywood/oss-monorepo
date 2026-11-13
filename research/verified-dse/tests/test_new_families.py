"""Milestone 118: the clipped switch SWC and a rank-agreement guard SWCG, tested blind on three new design families."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "new_families"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"new_families_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen_and_new_families():
    run, a = _load("run"), _load("analyse")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "new_families":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    fams = {a.score.family(d) for d in run.NEW}
    assert fams == {"funnel", "fir", "cordic"} and not fams & {a.score.family(d) for d in seen}
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_concordance_counts_strictly_agreeing_pairs():
    a = _load("analyse")
    assert a.concordant([1, 2, 3, 4], [10, 20, 30, 40]) == 6
    assert a.concordant([4, 3, 2, 1], [10, 20, 30, 40]) == 0
    assert a.concordant([1, 1, 2, 3], [5, 6, 7, 8]) == 5  # a tie in either list is not concordant


def test_guard_routes_eight_beyond_the_pilot():
    a = _load("analyse")
    assert (a.PROBES - 1) + a.TOP == 8
    cell = {"ratio": 2.0, "g": 9.0, "rand": 1.0}
    assert a.swcg(cell) == 1.0  # below the cost threshold the switch routes randomly
    cell["ratio"] = 5.0
    assert a.swcg(cell) == 9.0


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
