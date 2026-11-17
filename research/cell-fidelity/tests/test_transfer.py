import importlib.util
from pathlib import Path

import pytest

HERE = Path(__file__).resolve().parents[1] / "experiments" / "transfer"
spec = importlib.util.spec_from_file_location("transfer_run", HERE / "run.py")
run = importlib.util.module_from_spec(spec)
spec.loader.exec_module(run)


def test_misclass_counts_disagreements():
    r = [0.0, 0.05, 0.2, 0.4]
    bad = [True, False, True, False]
    assert run.misclass(r, bad, 0.1) == pytest.approx(0.5)
    assert run.misclass(r, bad, 0.3) == pytest.approx(0.25)


def test_best_threshold_prefers_smallest_on_ties():
    r = [0.0, 0.3, 0.5]
    bad = [True, False, False]
    assert run.best_threshold(r, bad, [0.0, 0.1, 0.2]) == 0.0


def test_auc_perfect_reversed_and_ties():
    assert run.auc([3, 2, 1, 0], [True, True, False, False]) == 1.0
    assert run.auc([0, 1, 2, 3], [True, True, False, False]) == 0.0
    assert run.auc([1, 1], [True, False]) == 0.5
    assert run.auc([1, 2], [True, True]) != run.auc([1, 2], [True, True])  # nan without negatives


def test_untrusted_label_is_milestone_one():
    assert run.untrusted([0.0, 70.0, 80.0], [100.0, 100.0, 100.0]) == [True, True, False]


def test_params_hold_areal_current_and_copy_degradation_keys():
    pytest.importorskip("pybamm")
    from energy_cell import cell
    x = list(cell.BASELINE)
    pv, copied, cur = run.params(x, "Ai2020")
    assert "Typical plated lithium concentration [mol.m-3]" in copied
    a = pv["Electrode height [m]"] * pv["Electrode width [m]"] * pv["Number of electrodes connected in parallel to make a cell"]
    assert cur / a == pytest.approx(5.0 / (0.065 * 1.58), rel=1e-9)
    assert pv["Positive electrode thickness [m]"] == pytest.approx(x[0] * 1e-6)
    assert pv["Positive electrode active material volume fraction"] == pytest.approx(1 - x[1] - cell.INACTIVE)
    pv2, _, cur2 = run.params(x, "OKane2022")
    assert cur2 == pytest.approx(cell.I_DISCHARGE)
