"""Milestone 167: two more namings of the 12 decided shifter designs at 32 gates or more (analysis of the committed flow table)."""
import importlib.util
import json
from pathlib import Path

NA = Path(__file__).resolve().parents[1] / "experiments" / "naming_above"


def _load():
    spec = importlib.util.spec_from_file_location("vdse_t167", NA / "run.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_design_set_and_order():
    m = _load()
    assert len(m.ORDER) == 12 and m.ORDER[0] == "max3b5" and m.ORDER[-1] == "mul3n"
    ref = json.loads((NA.parent / "tie_rule" / "designs.json").read_text())
    depths = [ref[x]["depth"] for x in m.ORDER]
    assert depths == sorted(depths) and min(depths) >= 32
    assert abs(m.sign_p(11, 1) - 0.0063) < 1e-3


def test_committed_designs_keep_sign_and_class():
    d = json.loads((NA / "designs.json").read_text())
    assert len(d) == 12
    for x, v in d.items():
        assert (v["d"]["A3"] > 0) == (v["d"]["Y"] > 0), x
        assert abs(v["d"]["A3"]) >= 4, x
    assert d["pmul4"]["d"]["A3"] >= 4
    assert all(v["swc"]["A3"] == 0 for x, v in d.items() if x != "pmul4")


def test_controls_in_results():
    t = (NA / "results.txt").read_text()
    assert "control (a) (orig netlist re-placed reproduces arm Y on every OUTCOME field): 48 of 48" in t
    assert "control (b) (rung 1 equals arm Y): 4991 of 4991 runs" in t
    assert "control (c) (arm Y's d reproduces milestone 165 to 0.01): True" in t
