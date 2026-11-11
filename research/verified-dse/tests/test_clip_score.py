"""Milestone 115: a mapped score clipped at the clock period, chosen on held-out cells, tested blind on seven new designs."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "clip_score"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"clip_score_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "clip_score":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 7


def test_clip_only_binds_when_mapped_delay_meets_the_clock():
    s = _load("score")
    r = {"period_ns": 10.0, "synth_netlist_wns": 4.0, "synth_netlist_area": 2.0}  # mapped delay 6
    assert s.r2c(r, None) == 12.0
    assert s.r2c(r, 1.25) == 20.0  # 1.25 * 6 = 7.5 < 10: scored as meeting the clock, area x period
    assert s.r2c(r, 2) == 24.0     # 2 * 6 = 12 > 10: area x alpha x delay
    cell = {"ratio": 2.0, "skip": 9.0, "rand": 1.0, "clip": {1.25: 0.0}}
    assert s.swc(cell, 1.25) == 1.0  # below the threshold the switch routes randomly
    cell["ratio"] = 5.0
    assert s.swc(cell, 1.25) == 0.0


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1680


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("score").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_summary():
    t = (EXP / "results.txt").read_text()
    assert "Chosen alpha: 1.25" in t
    assert "SW 1.66%, SWC in-sample 0.77%, SWC leave-one-family-out 1.66%" in t
    assert "mean regret: SW 2.73%, SWC 0.83%" in t
    assert "-3.63 to -0.41 points" in t
    for k in range(1, 7):
        assert t.split(f"({k})")[1].splitlines()[0].split(":")[1].strip().startswith("True")
