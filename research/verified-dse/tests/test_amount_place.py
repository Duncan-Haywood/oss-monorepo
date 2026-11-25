"""Milestone 124: placing the gate-depth threshold inside (30, 41] blind, with a 64-bit width twin."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "amount_place"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"amount_place_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "amount_place" or f.parent.name in ("naming_shifters", "naming_above"):  # 166/167 reroute these designs later
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 7


def test_gate_depths_fill_the_gap_milestone_123_left():
    f = json.loads((EXP / "features.json").read_text())
    g = {d: v["amount_gate_depth"] for d, v in f.items()}
    assert g == {"sad1b8": 31, "max3b5": 33, "sat1b9": 35, "max3b6": 36, "max3b6n": 36, "sad2b5": 40, "sat2b5": 41}
    assert f["max3b6n"]["shift_width"] == 64 and all(v["shift_width"] == 128 for d, v in f.items() if d != "max3b6n")


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    new = sorted(_load("run").NEW)
    assert [d for d in new if a.flag_g(d)] == ["max3b5", "sad1b8", "sat1b9"]
    assert [d for d in new if a.flag_d(d)] == ["sad1b8", "sat1b9"]


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1680


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
