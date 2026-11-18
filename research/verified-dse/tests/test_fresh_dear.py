"""Milestone 112: the cost-ratio switch on a fresh pool where routing is dear."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "fresh_dear"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"fresh_dear_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_sequences_are_milestone_108s_and_disjoint_from_milestone_1():
    run = _load("run")
    seqs = run.fresh_sequences()
    assert len(seqs) == 120 == len(set(seqs))
    old = set(run._load(EXP.parent / "rung_bias" / "run.py", "rb").sequences(60))
    assert not old & set(seqs)
    before = dict(run.flow.DESIGNS)
    defs, base = run.designs_and_bases()
    assert run.flow.DESIGNS == before  # importing and querying leaves the shared design table alone
    assert set(run.SOURCES) == set(base) == set(defs) and base["mult24"] == 4.69


def test_summary():
    t = (EXP / "results.txt").read_text()
    assert "mean regret SW: 1.05%, worst 6.46%; vs random better 9, worse 3" in t
    assert "mean regret random: 3.16%" in t
    assert "cells with routed/r2 > 3: 12 of 12" in t
    for k, want in zip(range(1, 7), (True, True, True, True, True, False)):
        assert t.split(f"({k})")[1].splitlines()[0].endswith(str(want))


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
