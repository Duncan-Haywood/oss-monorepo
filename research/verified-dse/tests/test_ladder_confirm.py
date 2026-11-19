"""Milestone 137: SWC against random on a confirmatory blind set, one clock per design."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "ladder_confirm"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"ladder_confirm_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        # later milestones rerun these same blind designs at other operating points (141 to 144, and amin4/amin6 at ff in 146);
        # they are not prior exposure
        if f.parent.name in ("ladder_confirm", "util65_blind", "util65_rest", "corner_ss_blind", "corner_ff_blind", "delay_split_ff",
                             "addchain_delay", "addshort_ff"):  # milestone 152 reran csum4 at ff
            continue
        for line in f.read_text().splitlines():
            try:
                seen.add(json.loads(line)["design"])
            except (ValueError, KeyError):
                pass
    assert seen and not seen & set(run.CAND)


def test_keep_and_clocks_follow_the_registered_rules():
    run, probe = _load("run"), json.loads((EXP / "probe.json").read_text())
    assert set(probe) == set(run.CAND)
    assert run.KEEP == [d for d in run.CAND if probe[d]["ratio"] > 3.3]
    assert [run.CLOCK[d] for d in run.KEEP] == [("tight", "relaxed")[i % 2] for i in range(len(run.KEEP))]


def test_table_has_one_clock_per_design():
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert {(r["design"], r["tag"]) for r in rs} == {(d, run.CLOCK[d]) for d in run.KEEP}
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs) == 120 * len(run.KEEP)


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
