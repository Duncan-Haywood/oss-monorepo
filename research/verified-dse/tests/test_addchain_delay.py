"""Milestone 147: add-chain structure against mapped delay at SKY130 ff_n40C_1v95, a blind 2 x 2."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "addchain_delay"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_candidates_are_fresh_at_ff():
    run = _load(HERE / "run.py", "addchain_delay_run")
    prev = set(json.loads((EXP / "corner_ff_blind" / "meta.json").read_text())["base_period_ns"])
    prev |= set(json.loads((EXP / "addchain_ff" / "meta.json").read_text())["order"])
    assert not set(run.CANDIDATES) & prev
    assert not set(run.ADD) & set(run.CTRL)
    # no two candidates are the same design under different names
    keys = [json.dumps(v, sort_keys=True) for v in run.CANDIDATES.values()]
    assert len(set(keys)) == len(keys)


def test_selection_rule_reproduces_meta():
    run = _load(HERE / "run.py", "addchain_delay_sel")
    meta = json.loads((HERE / "meta.json").read_text())
    cells, clock, order = run.select(meta["base_period_ns"])
    assert order == meta["order"] and clock == meta["clock"]
    assert {f"{s}-{b}": v for (s, b), v in cells.items()} == meta["cells"]
    for d in order:
        assert run.band(meta["base_period_ns"][d]) == meta["band"][d]
    b2 = meta["batch2"]
    add, clock2, order2 = run.select2(cells, b2["base_period_ns"])
    assert order2 == b2["order"] and clock2 == b2["clock"]
    assert not set(order2) & set(order)


def test_band_edges():
    run = _load(HERE / "run.py", "addchain_delay_band")
    assert run.band(15.0) == "FAST" and run.band(16.5) == "SLOW" and run.band(15.8) is None and run.band(None) is None


def test_stratified_effect_ignores_imbalance():
    a = _load(HERE / "analyse.py", "addchain_delay_eff")
    d = {"a": 3.0, "b": 1.0, "c": 10.0, "e": 8.0, "f": 8.0}
    lab = {"a": "ADD", "b": "CTRL", "c": "ADD", "e": "CTRL", "f": "CTRL"}
    strat = {"a": "FAST", "b": "FAST", "c": "SLOW", "e": "SLOW", "f": "SLOW"}
    assert abs(a.effect(d, lab, strat) - 2.0) < 1e-12
    assert a.strat_perm_p({"a": 1.0, "b": 1.0}, {"a": "ADD", "b": "CTRL"}, {"a": "X", "b": "X"}, n=100) == 1.0


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "addchain_delay_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()
