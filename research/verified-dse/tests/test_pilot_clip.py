"""Milestone 116: the switch's timing pilot decides whether to clip the mapped score; tested blind on five new designs."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "pilot_clip"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"pilot_clip_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "pilot_clip":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 5


def test_guard_mixes_clipped_and_unclipped_by_pilot_share():
    g = _load("guard")
    q = {s: 0.25 for s in g.SENS}
    cell = {"ratio": 5.0, "skip": 8.0, "rand": 1.0, "clip": {1.25: 0.0}, "q": q}
    assert g.swcp(cell) == 0.75 * 8.0  # pilot meets 0.9 a quarter of the time: clipped then, unclipped otherwise
    cell["ratio"] = 2.0
    assert g.swcp(cell) == 1.0  # below the cost threshold the switch routes randomly
    assert g.shares([{"period_ns": 4.0, "final_wns": 1.0}]) == [0.75]


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1200


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("guard").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
