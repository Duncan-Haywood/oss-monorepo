"""Milestone 123: word-level amount depth against gate-level amount depth, tested blind on shifters where the two disagree."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "amount_cut"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"amount_cut_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "amount_cut" or f.parent.name in ("naming_shifters", "naming_above"):  # 166/167 reroute these designs later
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_word_and_gate_depths_disagree_as_designed():
    f = json.loads((EXP / "features.json").read_text())
    assert all(v["shift_width"] == 128 for v in f.values())
    assert {d: v["amount_depth"] for d, v in f.items()} == {"wsum3w": 2, "mul2w": 2, "xor4": 3, "xor8": 7, "wsum4n": 3, "mul3n": 3}
    g = {d: v["amount_gate_depth"] for d, v in f.items()}
    assert min(g["wsum3w"], g["mul2w"], g["wsum4n"], g["mul3n"]) > 36 > max(g["xor4"], g["xor8"])


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    new = sorted(_load("run").NEW)
    assert [d for d in new if a.flag_g(d)] == ["xor4", "xor8"]
    assert [d for d in new if a.flag_d(d)] == ["mul2w", "wsum3w"]
    assert all(a.flag_d(d, 8) for d in new)


def test_seen_thresholds_separate_the_seen_ladder_cells():
    """Where both thresholds were read: every seen ladder-branch wide shifter on one side of 36 gates and of 3 word cells."""
    a = _load("analyse")
    lad = [c for c in a.seen_tables() if c["ratio"] > a.score.THETA and a.FEAT[c["design"]].get("shift_width", 0) >= 64]
    assert lad
    for c in lad:
        assert a.flag_g(c["design"]) == a.flag_d(c["design"])
        assert (a.swc(c) > c["rand"]) == a.flag_g(c["design"])


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
