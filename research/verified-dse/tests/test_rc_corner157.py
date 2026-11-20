"""Milestone 157: milestone 156's max-RC corner resumed on the designs it did not reach (flow run)."""
import importlib.util
from pathlib import Path

RC = Path(__file__).resolve().parents[1] / "experiments" / "rc_corner"


def _load(name, mod):
    spec = importlib.util.spec_from_file_location(mod, RC / name)
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_milestone_156_keeps_its_12_designs():
    a = _load("analyse.py", "vdse_t157_a156")
    b = _load("analyse157.py", "vdse_t157_a157")
    assert a.M156_N == b.M156_DONE == 12


def test_same_build_reproduces_milestone_156_rows():
    b = _load("analyse157.py", "vdse_t157_ctl")
    n, both, mapped, routed = b.control()
    assert n == 12 and both == 11 and mapped == 11 and routed == 11


def test_results_record_the_outcome():
    text = (RC / "results157.txt").read_text()
    assert "complete designs (paired prefix of milestone 143's order): 27 of 27; fresh (past milestone 156's 12): 15" in text
    assert "(1) PRIMARY fresh: mean d change +0.23 points, interval -0.51 to +0.93; higher on 10 of 15: held" in text
    assert "(5) pooled 27: mean d change +0.17 points, interval -0.61 to +1.01: held" in text
    assert "(6) pooled rcmax: SWC better on 22, worse on 5, tied on 0; sign p = 0.001514: held" in text
