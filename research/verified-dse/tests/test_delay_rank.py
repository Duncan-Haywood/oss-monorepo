"""Milestone 155: mapped delay rank agreement against clip share as the account of the ladder's losses (replay, 223 units)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t155", EXP / "delay_rank" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_auc_orients_low_values_as_losers():
    m = _load()
    fs = [{"d": 1.0, "x": 0.1}, {"d": 2.0, "x": 0.2}, {"d": -1.0, "x": 0.5}, {"d": 0.0, "x": 0.9}]
    assert m.auc(fs, "x") == 1.0
    fs = [{"d": 1.0, "x": 0.9}, {"d": -1.0, "x": 0.1}]
    assert m.auc(fs, "x") == 0.0
    fs = [{"d": 1.0, "x": 0.5}, {"d": -1.0, "x": 0.5}]
    assert m.auc(fs, "x") == 0.5


def test_delay_keys_and_flag():
    m = _load()
    r = {"period_ns": 10.0, "synth_netlist_wns": -2.0, "final_wns": 1.0}
    assert m.mdelay(r) == 12.0 and m.rdelay(r) == 9.0
    assert m.tau0([1, 1, 1], [1, 2, 3]) == 0.0  # a constant score counts as no information
    assert m.flagged({"share": 0.1, "tauD": 0.1}, "tauD")
    assert not m.flagged({"share": 0.3, "tauD": 0.1}, "tauD")
    assert not m.flagged({"share": 0.1, "tauD": 0.2}, "tauD")


def test_results_record_the_outcome():
    text = (EXP / "delay_rank" / "results.txt").read_text()
    assert "units: 223 (ff 92, tt 131); ladder branch 183 (ff 88, tt 95); losers 38" in text
    assert "(1) PRIMARY AUC(tauD) - AUC(share) = +0.107, interval -0.031 to +0.239: refuted" in text
    assert "(7) joint oracle flag (share < 0.2, tauD < 0.2): 17 of 38 losers, 26 non-losers: refuted" in text
    assert "SWC(1.25) | 0 | 0 | 2.76 | 2.58" in text  # milestone 153's 2.58% over the same 223 units
    assert "single-draw pilot AUC: mean 0.627" in text
    assert sum(l.endswith(": held") for l in text.splitlines()) == 4
