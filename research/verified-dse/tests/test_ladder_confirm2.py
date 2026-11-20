"""Milestone 138: SWC against random on a second confirmatory blind set (right and 256-bit shifters), one clock per design."""
import importlib.util
import json
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "ladder_confirm2"


def _load(name):
    spec = importlib.util.spec_from_file_location(f"ladder_confirm2_{name}", EXP / f"{name}.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_designs_are_unseen():
    run = _load("run")
    seen = set()
    for f in EXP.parent.glob("*/results*.jsonl"):
        # ladder_rest holds milestone 140's rows of the same designs; milestones 141 to 144 rerun them at other operating points
        if f.parent.name in ("ladder_confirm2", "ladder_rest", "util65_blind", "util65_rest", "corner_ss_blind", "corner_ff_blind",
                             "rc_corner"):  # milestone 156 reran them at ss with max RC
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
    """The flow stopped at its time limit (3,026 of 4,800 rows); the analysed set is run.py's ORDER prefix of complete designs."""
    run = _load("run")
    rs = [json.loads(l) for l in (EXP / "results.jsonl").read_text().splitlines()]
    assert all(r["tag"] == run.CLOCK[r["design"]] for r in rs)
    assert len({(r["design"], r["tag"], tuple(r["seq"])) for r in rs}) == len(rs)
    done = run.complete(rs)
    assert done == run.ORDER[:len(done)] and len(done) == 25
    assert all(sum(r["design"] == d for r in rs) == 120 for d in done)
    assert all(sum(r["design"] == d for r in rs) < 120 for d in run.ORDER[len(done):])


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load("analyse").main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()
