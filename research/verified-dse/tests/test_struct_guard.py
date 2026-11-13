"""Milestone 119: a structural shifter guard (route randomly when the RTL has a wide data shifter), chosen on 136 seen cells and
tested blind on three new design families."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "struct_guard"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"struct_guard_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen_and_new_families():
    run, a = _load("run"), _load("analyse")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name in ("struct_guard", "shift_power"):  # this table and later milestones (120 reruns lzcnorm wider)
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)
    fams = {a.score.family(d) for d in run.NEW}
    assert fams == {"rotmask", "lzcnorm", "maxtree"} and not fams & {a.score.family(d) for d in seen}
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 6


def test_features_cover_every_seen_and_blind_design():
    run, a = _load("run"), _load("analyse")
    assert set(run.NEW) <= set(a.FEAT)
    assert {c["design"] for c in a.seen_tables()} <= set(a.FEAT)


def test_shift_width_separates_shifters_from_selects():
    f = _load("analyse").FEAT
    # crossbar ports are indexed part-selects a few bits wide; a decoder shifts a constant
    assert all(f[d]["shift_width"] <= 8 for d in ("xbar16", "xbar32x2", "xbar32x4"))
    assert f["decmux64"]["shift_width"] == 0
    assert f["barrel128"]["shift_width"] == 128 and f["funnel128"]["shift_width"] == 256
    assert f["maxtree32x16"]["shift_width"] == 0 and f["mult32"]["shift_width"] == 0


def test_guard_replaces_swc_by_random_only_on_flagged_designs():
    a = _load("analyse")
    g = a.guarded("S", 64)
    cell = {"design": "barrel128", "rand": 1.0, "ratio": 5.0, "clip": {a.nf.ALPHA: 9.0}, "skip": 9.0}
    assert g(cell) == 1.0
    cell["design"] = "mult32"
    assert g(cell) == a.swc(cell) == 9.0
    assert a.guarded("S", None)(dict(cell, design="barrel128")) == 9.0


def test_selection_is_sws64():
    a = _load("analyse")
    seen = a.seen_tables()
    assert len(seen) == 136
    assert a.choose(seen, "S") == 64


def test_table_covers_every_cell():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1440


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
