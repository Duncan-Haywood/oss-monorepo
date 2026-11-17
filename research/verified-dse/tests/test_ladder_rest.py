"""Milestone 140: milestone 138's unrun designs, resumed with the same run.py, rows kept apart from milestone 138's table."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
HERE = EXP / "ladder_rest"


def _load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_new_rows_are_milestone_138_designs_past_its_prefix():
    run = _load(EXP / "ladder_confirm2" / "run.py", "ladder_rest_run")
    old = [json.loads(l) for l in (EXP / "ladder_confirm2" / "results.jsonl").read_text().splitlines()]
    new = [json.loads(l) for l in (HERE / "results.jsonl").read_text().splitlines()]
    done = set(run.complete(old))
    assert len(done) == 25 and not done & {r["design"] for r in new}
    assert all(r["tag"] == run.CLOCK[r["design"]] for r in new)
    keys = [(r["design"], r["tag"], tuple(r["seq"])) for r in old + new]
    assert len(set(keys)) == len(keys)  # --resume never re-ran a point


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load(HERE / "analyse.py", "ladder_rest_analyse").main(out)
    assert out.read_text() == (HERE / "results.txt").read_text()
