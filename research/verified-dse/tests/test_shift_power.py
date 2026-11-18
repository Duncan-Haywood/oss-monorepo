"""Milestone 120: milestone 119's structural shifter guard on a second blind test, with a barrel shifter written without a shift
operator (the RTL feature's blind spot) and a gate-level mux-share band that covers it."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "shift_power"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"shift_power_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "shift_power":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_guards_flag_what_was_registered():
    a = _load("analyse")
    assert [d for d in sorted(_load("run").NEW) if a.flag_s(d)] == ["alignsh128", "alignsh64", "lzcnorm128", "lzcnorm96"]
    assert all(a.flag_g(d) for d in _load("run").NEW)
    # the band leaves crossbars (ladder wins) and non-shifters alone
    assert not any(a.flag_g(d) for d in ("xbar16", "xbar32x2", "xbar32x4", "maxtree32x16", "mult32", "lzcnorm32"))


def test_swg_equals_sws_on_the_seen_cells():
    a = _load("analyse")
    seen = a.seen_tables()
    assert len(seen) == 148
    assert all(abs(a.swg(c) - a.sws(c)) < 1e-12 for c in seen)


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
