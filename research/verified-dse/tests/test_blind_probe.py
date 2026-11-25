"""Milestone 132: SWP(32) and SWG(32) tested blind on six new 128-bit shifters."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "blind_probe"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"blind_probe_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        # milestone 147 reran mod12 at the ff corner (its candidates had to be fresh at ff, not at tt); not prior exposure
        if f.parent.name in ("blind_probe", "addchain_delay") or f.parent.name in ("naming_shifters", "naming_above"):  # 166/167 reroute these designs later
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_gate_depths_as_registered():
    f = json.loads((EXP / "features.json").read_text())
    assert {d: v["amount_gate_depth"] for d, v in f.items()} == {"gray0": 24, "mod8": 27, "gray1": 43, "lut1": 51, "mod10": 55,
                                                                  "mod12": 80}
    assert all(v["shift_width"] == 128 for v in f.values())


def test_swg_flags_what_was_registered():
    a = _load("analyse")
    assert [d for d in sorted(_load("run").NEW) if a.flag_g(d)] == ["gray0", "mod8"]


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_swp_bounded_by_its_branches():
    a = _load("analyse")
    for c in a.blind_table():
        assert 0 <= a.swp(c) <= 100 and 0 <= c["pfell"] <= 1
        if not a.lad(c):
            assert a.swp(c) == c["rand"]


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
