"""Milestone 153: SWC(1) against SWC(1.25) blind at tt on milestone 152's fresh short add chains."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"
FF_ONLY = ("addshort_ff", "addchain_ff", "addchain_delay", "delay_split_ff", "corner_ff_blind", "corner_ss_blind", "addshort_tt")


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, EXP / rel)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_fresh_at_tt():
    run = _load("addshort_tt/run.py", "verified_dse_t153_run")
    seen = set()
    for p in EXP.glob("*/results.jsonl"):
        if p.parent.name in FF_ONLY:
            continue
        seen |= {json.loads(l).get("design") for l in p.read_text().splitlines()}
    assert not set(run.ORDER) & seen
    assert set(run.SEEN_AT_TT) <= seen
    assert len(run.ORDER) == 13


def test_designs_and_clocks_match_milestone_152():
    run = _load("addshort_tt/run.py", "verified_dse_t153_run2")
    ff = json.loads((EXP / "addshort_ff" / "meta.json").read_text())
    assert run.ORDER == [d for d in ff["order"] if d not in ("csum4", "avg6")]
    for d in run.ORDER:
        assert run.CANDIDATES[d] == run.M152.CANDIDATES[d]
        assert run.CLOCK[d] == ff["clock"][d]


def test_spearman_and_ranks():
    m = _load("addshort_tt/analyse.py", "verified_dse_t153_an")
    assert m.ranks([5, 5, 1]) == [1.5, 1.5, 0.0]
    assert abs(m.spearman([1, 2, 3, 4], [2, 4, 6, 8]) - 1) < 1e-12
    assert abs(m.spearman([1, 2, 3], [3, 2, 1]) + 1) < 1e-12
    assert m.spearman([1, 1, 1], [1, 2, 3]) == 0.0


def test_results_record_the_outcome():
    text = (EXP / "addshort_tt" / "results.txt").read_text()
    assert "complete designs (order prefix): 13 of 13" in text
