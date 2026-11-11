"""Milestone 113: the cost-ratio switch on eight designs no earlier table ran."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "fresh_designs"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"fresh_designs_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen_and_sequences_are_milestone_108s():
    run = _load("run")
    seqs = run.fresh_sequences()
    assert len(seqs) == 120 == len(set(seqs))
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        if f.parent.name == "fresh_designs":
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.NEW)  # no earlier table ran any of the eight
    assert set(run.ORDER) == set(run.NEW) and len(run.NEW) == 8
    for stem, *_ in run.NEW.values():
        assert (EXP.parents[1] / "designs" / f"{stem}.v").exists()


def test_table_covers_every_cell():
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    run = _load("run")
    assert {(r["design"], r["tag"]) for r in rs} == {(d, t) for d in run.NEW for t in run.FACTORS}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 1920


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
