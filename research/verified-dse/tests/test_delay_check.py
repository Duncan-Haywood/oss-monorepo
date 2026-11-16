"""Milestone 135: the delay-check guard SWX(k, f) priced by replay on milestones 119 to 125 (and described on the blind pool)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments" / "delay_check"


def _load():
    spec = importlib.util.spec_from_file_location("delay_check_analyse", EXP / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def test_registered_parameters():
    a = _load()
    assert (a.K, a.F, a.DRAWS, a.SEED) == (3, 0.02, 200, 135)
    assert a.KS == (2, 3, 4) and a.FS == (0.0, 0.02, 0.05)


def test_parts_give_the_alarm_inputs():
    """The alarm compares mapped area A2 and routed delay D4 = period - final WNS, from milestone 134's parts()."""
    a = _load()

    def r(area, wns, a4, w4):
        return {"period_ns": 10.0, "synth_netlist_area": area, "synth_netlist_wns": wns, "final_area_notap": a4, "final_wns": w4}

    q = [a.parts(x) for x in (r(100, 2, 120, 4), r(90, 1, 110, 3))]
    assert q[0]["D4"] == 6.0 and q[1]["A2"] == 90


def test_analysis_reproduces_results(tmp_path):
    out = tmp_path / "r.txt"
    _load().main(out)
    assert out.read_text() == (EXP / "results.txt").read_text()


def test_outcome_as_logged():
    t = (EXP / "results.txt").read_text()
    assert "SWC check (this file's tie-breaks, all 90 cells): 4.76% against SWC's 4.77%." in t
    for line in ("(1) SWX(3,0.02) below SWC: False (5.01% against 4.77%)",
                 "(2) SWX(3,0.02) above SWG(32): True (5.01% against 3.91%)",
                 "(3) alarm share above 0.3 on failing cells (0.45) and below 0.2 on winning cells (0.47): False",
                 "(4) on winning cells, SWX(3,0.02) less than 0.5 point above SWC: False (0.97% against 0.00%)",
                 "(5) on failing cells, band fall-back below random fall-back: False (15.64% against 15.36%)",
                 "(6) design-bootstrap 95% interval of mean (SWX(3,0.02) - SWC) contains 0: True (-0.38 to +0.90 points)"):
        assert line in t
    assert "all cells: SWC 3.30, SWX(3,0.02) 4.02, SWXR(3,0.02) 4.08, random 4.65" in t
