"""Milestone 133: SWC, SWG(32) and SWP(32) tested blind on seven 128-bit left shifters probed for the ladder branch."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "ladder_blind"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"ladder_blind_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "ladder_blind" or f.parent.name in ("naming_shifters", "naming_above"):  # 166/167 reroute these designs later
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.CAND)
    assert set(run.ORDER) == set(run.NEW) == set(run.KEEP) and len(run.NEW) == 7


def test_keep_follows_the_probe_rule():
    run, probe = _load("run"), json.loads((EXP / "probe.json").read_text())
    assert set(probe) == set(run.CAND)
    assert sorted(run.KEEP) == sorted(d for d, v in probe.items() if v["ratio"] > 3.3)


def test_swg_flags_what_was_registered():
    a = _load("analyse")
    assert [d for d in sorted(_load("run").NEW) if a.flag_g(d)] == ["bcd2", "bcd3", "cmp16", "crc7s16"]


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1680


def test_swpf_paired_with_swp():
    a = _load("analyse")
    for c in a.blind_table():  # blind_table asserts the two rules distrust on the same draws
        assert 0 <= a.swpf(c) <= 100 and 0 <= a.swp(c) <= 100
        if c["pfell"] == 0:
            assert abs(a.swpf(c) - a.swp(c)) < 1e-9


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
