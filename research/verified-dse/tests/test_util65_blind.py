"""Milestone 141: the one-clock blind designs at 65% placement utilisation, analysed on the longest complete prefix of a seeded order."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "util65_blind"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_rows_follow_the_fixed_protocol():
    run = _load(HERE / "run.py", "util65_blind_run")
    rows = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
    assert len(run.ORDER) == 52 and len(set(run.ORDER)) == 52
    assert all(r["util"] == 65 and r["tag"] == run.CLOCK[r["design"]] for r in rows)
    keys = [(r["design"], tuple(r["seq"])) for r in rows]
    assert len(set(keys)) == len(keys)
    assert len(run.complete(rows)) == 20


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "util65_blind_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()
