"""Milestone 125: SWG(32) tested blind at 28 to 36 gates, and 64-bit multi-lane shifters."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "amount_lanes"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"amount_lanes_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "amount_lanes" or f.parent.name in ("naming_shifters", "naming_above"):  # 166/167 reroute these designs later
            continue
        for line in f.read_text().splitlines():
            try:
                r = json.loads(line)
            except ValueError:
                continue
            # registration was at tt; a later run at another corner (milestone 152 ran a different avg6 at ff) is not a leak
            if "design" in r and r.get("corner", "tt").startswith("tt"):
                seen.add(r["design"])
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 8


def test_gate_depths_as_registered():
    f = json.loads((EXP / "features.json").read_text())
    g = {d: v["amount_gate_depth"] for d, v in f.items()}
    assert g == {"pmul3": 28, "avg5": 31, "sel64": 33, "avg6": 35, "pmul4": 36, "lane2k2": 48, "lane4k2": 48, "lane4k1": 25}
    assert all(v["shift_width"] == (64 if d.startswith("lane") else 128) for d, v in f.items())


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    new = sorted(_load("run").NEW)
    assert [d for d in new if a.flag_g(d)] == ["avg5", "lane4k1", "pmul3"]
    assert [d for d in new if a.flag_g(d, 36)] == ["avg5", "avg6", "lane4k1", "pmul3", "sel64"]
    assert [d for d in new if a.flag_d(d)] == ["avg5", "avg6", "lane4k1", "pmul3", "pmul4", "sel64"]


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1920


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
