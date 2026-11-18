"""Milestone 146: slow add chains and fast control chains at SKY130 ff_n40C_1v95."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "delay_split_ff"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_pools_are_fresh_and_disjoint():
    run = _load(HERE / "run.py", "delay_split_run")
    assert not set(run.ADDS_POOL) & set(run.CTRLF_POOL)
    m144 = _load(EXP / "corner_ff_blind" / "run.py", "delay_split_m144")
    assert not set(run.POOL) & (set(m144.ORDER) | set(run.M145.ORDER))


def test_selection_follows_the_fixed_rule():
    run = _load(HERE / "run.py", "delay_split_sel")
    meta = json.loads((HERE / "meta.json").read_text())
    order, clock, group = run.select(meta["candidate_base_period_ns"])
    assert order == meta["order"] and clock == meta["clock"] and group == meta["group"]
    for d, g in group.items():
        p = meta["base_period_ns"][d]
        assert (p >= run.SLOW_MIN) if g == "ADDS" else (p <= run.FAST_MAX)


def test_rows_follow_the_fixed_protocol():
    a = _load(HERE / "analyse.py", "delay_split_rows")
    rows = a.rows()
    meta = json.loads((HERE / "meta.json").read_text())
    assert meta["liberty_sha256"] == a.run.M145.SHA256
    assert meta["tools"]["openroad"] == "26Q3" and "0.71" in meta["tools"]["yosys"]
    for r in rows:
        assert r["corner"] == "ff_n40C_1v95" and r["tag"] == meta["clock"][r["design"]]
        assert abs(r["period_ns"] - round(meta["base_period_ns"][r["design"]] * a.run.FACTORS[r["tag"]], 3)) < 1e-9
    keys = [(r["design"], tuple(r["seq"])) for r in rows]
    assert len(set(keys)) == len(keys) == 120 * len(meta["order"])


def test_spearman_and_effects():
    a = _load(HERE / "analyse.py", "delay_split_fx")
    assert abs(a.spearman([1, 2, 3], [3, 2, 1]) + 1) < 1e-12
    e = a.effects({"ADDF": [2.0], "ADDS": [2.0], "CTRLF": [0.0], "CTRLS": [0.0]})
    assert e["structure"] == 2.0 and e["delay"] == 0.0 and e["interaction"] == 0.0


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "delay_split_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()
