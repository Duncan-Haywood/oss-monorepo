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
