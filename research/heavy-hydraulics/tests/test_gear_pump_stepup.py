"""Milestone 7c: GearedSpun equals SpunGear inside the family and with a lossless drive, its loss follows
(1 - eta_f) [t P_rated + (1 - t) P], and the committed results file carries the registered verdicts."""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parents[1]
EXP = HERE / "experiments"
RES = EXP / "gear_pump_stepup_results.txt"
sys.path.insert(0, str(HERE / "src"))
sys.path.insert(0, str(EXP))


def _pair(eta_f=0.9934, tare=0.65):
    import gear_pump_eight as g8
    import digitise_rexroth_azpf as rf
    from gear_pump_spin import SpunGear
    from gear_pump_stepup import GearedSpun
    rows = g8.azpf_rows()
    return SpunGear(rows, rf.SIZES, 3000.0), GearedSpun(rows, rf.SIZES, 3000.0, 200.0, eta_f, tare)


def test_geared_equals_spun_inside_the_family_and_when_lossless():
    spun, geared = _pair()
    for q in (10.0, 40.0, float(spun.qn[-1])):
        assert geared.eta(q, 150.0) == spun.eta(q, 150.0)
        assert geared.idle(q, 12.0) == spun.idle(q, 12.0)
    _, lossless = _pair(eta_f=1.0)
    for q in (65.0, 85.0, 120.0):
        assert abs(lossless.eta(q, 150.0) - spun.eta(q, 150.0)) < 1e-12
        assert abs(lossless.idle(q, 12.0) - spun.idle(q, 12.0)) < 1e-12


def test_loss_form_and_direction():
    from heavy_hydraulics.measured import gear_pump_point
    spun, geared = _pair(eta_f=0.99, tare=0.5)
    q = 75.0
    n = geared.speed(q)
    fl, pw = gear_pump_point(geared.rows, 28, n)
    sc = q / fl(20.0)
    want = sc * (pw(0.0) + 0.01 * (0.5 * pw(200.0) + 0.5 * pw(0.0)))
    assert abs(geared.idle(q, 0.0) - want) < 1e-9
    assert geared.eta(q, 150.0) < spun.eta(q, 150.0)
    assert geared.idle(q, 12.0) > spun.idle(q, 12.0)
    # at full rated load with any tare share the loss is (1 - eta_f) P, so the drive passes 1 / (2 - eta_f) of its
    # input (0.98039 for eta_f 0.98; 0.99344 at the sourced 0.9934): the documented reading of eta_f
    for t in (0.0, 0.65):
        _, g = _pair(eta_f=0.98, tare=t)
        ratio = g.eta(q, 200.0) / spun.eta(q, 200.0)
        assert abs(ratio - 1.0 / (2.0 - 0.98)) < 1e-9


def test_committed_results_carry_every_verdict():
    text = RES.read_text()
    for k in range(1, 7):
        assert re.search(rf"GB{k} .*: (held|refuted)", text)
    assert "Check: ungeared spun diagonals against 7b: azpf E50 0.8075 (+0.0000)" in text
    assert len(re.findall(r"^  azp[fn]\s+0\.9", text, re.M)) == 24
