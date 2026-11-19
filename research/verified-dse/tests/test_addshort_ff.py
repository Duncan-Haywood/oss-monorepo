"""Milestone 152: SWC(0) against SWC(1.25) on fresh short add chains at ff."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load(rel, name):
    spec = importlib.util.spec_from_file_location(name, EXP / rel)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _designs(src):
    p = EXP / src / "results.jsonl"
    return {json.loads(l)["design"] for l in p.read_text().splitlines()}


def test_candidates_are_fresh_at_ff():
    run = _load("addshort_ff/run.py", "verified_dse_t152_run")
    seen = set()
    for src in ("corner_ff_blind", "addchain_ff", "delay_split_ff", "addchain_delay"):
        seen |= _designs(src)
    assert not set(run.CANDIDATES) & seen
    assert len(run.CANDIDATES) == 15


def test_seen_baselines_are_milestone_147_candidates():
    run = _load("addshort_ff/run.py", "verified_dse_t152_run2")
    for d in run.SEEN_BASELINE:
        assert run.M147.CANDIDATES[d] == run.CANDIDATES[d]


def test_select_keeps_fast_designs_in_shuffled_order_and_alternates_clocks():
    run = _load("addshort_ff/run.py", "verified_dse_t152_run3")
    base = {d: 10.0 for d in run.CANDIDATES}
    base[run.SHUFFLED[0]] = 15.5
    base[run.SHUFFLED[1]] = None
    order, clock = run.select(base)
    assert order == run.SHUFFLED[2:]
    assert [clock[d] for d in order[:3]] == ["tight", "relaxed", "tight"]


def test_sign_p_and_lomo():
    m = _load("addshort_ff/analyse.py", "verified_dse_t152_an")
    assert m.sign_p(0, 0) == 1.0
    assert abs(m.sign_p(5, 0) - 0.0625) < 1e-12

    def u(fold, clip):
        return {"fold": fold, "design": fold, "cell": {"ratio": 5.0, "rand": 9.0, "clip": clip}}
    us = [u("m1", {0: 9.0, 0.5: 9.0, 0.8: 9.0, 1: 9.0, 1.25: 0.0}), u("m2", {0: 0.0, 0.5: 9.0, 0.8: 9.0, 1: 9.0, 1.25: 9.0})]
    pick, reg = m.lomo(us, ["m1", "m2"])
    assert pick == {"m1": 0, "m2": 1.25} and reg == 9.0


def test_results_record_the_outcome():
    text = (EXP / "addshort_ff" / "results.txt").read_text()
    assert "complete designs (order prefix): 15 of 15" in text
    assert "(1) PRIMARY mean d(0) = -1.03 points (SWC(0) 6.15% against SWC(1.25) 7.18%)" in text
    assert "(2) csum2-like misses (SWC(0) >= 20%, SWC(1.25) <= 5%): none: refuted" in text
    assert "pooled 4.04% against SWC(1.25) 3.66%: held" in text
