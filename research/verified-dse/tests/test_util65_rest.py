"""Milestone 142: milestone 141's unrun designs at 65% placement utilisation, run to completion (descriptive addition)."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "util65_rest"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_rows_follow_the_fixed_protocol():
    a = _load(HERE / "analyse.py", "util65_rest_analyse_rows")
    old, new = a.rows65()
    assert all(r["util"] == 65 and r["tag"] == a.run.CLOCK[r["design"]] for r in new)
    keys = [(r["design"], tuple(r["seq"])) for r in old + new]
    assert len(set(keys)) == len(keys)
    first, rest = a.analysed(old, new)
    assert len(first) == 20 and not set(first) & set(rest)
    assert rest == [d for d in a.run.ORDER if d not in set(first)][:len(rest)]
    assert len(rest) == N_REST


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "util65_rest_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()


N_REST = 26  # the flow stopped at its time limit with 26 of the 32 complete
