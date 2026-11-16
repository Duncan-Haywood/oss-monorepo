"""Milestone 7d: the grouping and the k_lo feature behave as registered, the pooled design matrix carries the shape
family's feature, and the committed results file reproduces its milestones' checks and carries every verdict."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_third_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def test_groups_hold_every_reading_of_a_maker_family_together():
    import gear_pump_third as t3
    assert t3.group("casappa") == "casappa" and t3.group("azpu") == "azpu"
    assert t3.group("azpf") == t3.group("azpf_spin") == t3.group(("azpf", 0.9934, 0.65)) == "azpf"
    assert t3.group(("azpn", 0.98, 0.65)) == "azpn"
    assert t3.name(("azpf", 0.9934, 0.65)) == "azpf_gear" and t3.name(("azpn", 0.98, 0.65)) == "azpn_gear98"


def test_57_lmin_is_inside_every_family_and_unaffected_by_the_drive():
    import gear_pump_eight as g8
    import digitise_rexroth_azpf as rf
    from gear_pump_spin import SpunGear
    from gear_pump_stepup import GearedSpun
    rows = g8.azpf_rows()
    spun, geared = SpunGear(rows, rf.SIZES, 3000.0), GearedSpun(rows, rf.SIZES, 3000.0, 200.0, 0.9934, 0.65)
    assert 57.0 < spun.qn[-1]
    assert geared.eta(57.0, 150.0) == spun.eta(57.0, 150.0)
    assert geared.eta(85.0, 150.0) < spun.eta(85.0, 150.0)   # so k_lo rises with the drive's loss


def test_design_uses_shape_feature_and_drag_kw():
    import numpy as np
    import gear_pump_third as t3
    kw = {"a": 2.0, "b": 3.0}
    feat = {"lo": {"a": 0.1, "b": -0.2}, "hi": {"a": 0.0, "b": 0.0}}
    X = t3.design([("a", "b"), ("b", "a")], kw, feat, "lo")
    assert np.allclose(X, [[1.0, 3.0, 0.1], [1.0, 2.0, -0.2]])
    assert t3.design([("a", "b")], kw, feat, "one").shape == (1, 1)


def test_committed_results_reproduce_checks_and_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"TN{k} .*: (held|refuted)", text)
    for want in ("0.0022, +0.0000)", "0.0035, -0.0000)", "0.0051, +0.0000)"):
        assert want in text
    assert "196 cells:" in text
