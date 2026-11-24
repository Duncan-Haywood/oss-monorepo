"""Milestone 166: two more namings of the 13 decided shifter designs below 32 gates (analysis of the committed flow table)."""
import importlib.util
import json
from pathlib import Path

NS = Path(__file__).resolve().parents[1] / "experiments" / "naming_shifters"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t166", NS / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_classes_and_sign_test():
    m = _load()
    assert m.cls(-4.0) == "win" and m.cls(4.0) == "loss" and m.cls(3.99) == "tie"
    assert abs(m.sign_p(5, 8) - 0.5811) < 1e-3
    assert m.sign_p(0, 0) == 1.0


def test_committed_designs_keep_sign():
    d = json.loads((NS / "designs.json").read_text())
    assert len(d) == 13
    for x, v in d.items():
        assert (v["A3"] > 0) == (v["Y"] > 0), x
        assert abs(v["A3"]) >= 4, x


def test_controls_in_results():
    t = (NS / "results.txt").read_text()
    assert "control (a) (orig netlist re-placed reproduces arm Y on every OUTCOME field): 52 of 52" in t
    assert "control (c) (arm Y's d reproduces milestone 165 to 0.01): True" in t
