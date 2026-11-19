"""Milestone 154: the clipped ladder's rank information at ff against tt on 13 paired short add chains (replay)."""
import importlib.util
from pathlib import Path

EXP = Path(__file__).resolve().parents[1] / "experiments"


def _load():
    spec = importlib.util.spec_from_file_location("verified_dse_t154", EXP / "corner_rank" / "analyse.py")
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def _row(area, wns, rarea, rwns, period=10.0):
    return {"period_ns": period, "synth_netlist_area": area, "synth_netlist_wns": wns, "final_area_notap": rarea, "final_wns": rwns}


def test_keys_match_their_definitions():
    m = _load()
    r = _row(100.0, -2.0, 120.0, -3.0)
    assert m.r2c(r) == 100.0 * max(10.0, 1.25 * 12.0)
    assert m.r4(r) == 120.0 * 13.0
    assert m.mdelay(r) == 12.0 and m.rdelay(r) == 13.0


def test_best_rank_and_delay_share():
    m = _load()
    # r2c order equals r4 order: the routed-best point is the r2c top, rank 0.
    rs = [_row(a, 0.0, a, 0.0) for a in (10.0, 20.0, 30.0)]
    assert m.best_rank(rs) == 0.0
    # reversed: the routed-best point is r2c's last, rank 1.
    rs = [_row(a, 0.0, 40.0 - a, 0.0) for a in (10.0, 20.0, 30.0)]
    assert m.best_rank(rs) == 1.0
    # area constant: the routed score varies only through delay, so delay carries all of it.
    rs = [_row(10.0, 0.0, 50.0, w) for w in (0.0, -1.0, -3.0)]
    assert abs(m.delay_share(rs) - 1.0) < 1e-12
    assert m.sign_p(0, 0) == 1.0 and abs(m.sign_p(0, 5) - 0.0625) < 1e-12


def test_results_record_the_outcome():
    text = (EXP / "corner_rank" / "results.txt").read_text()
    assert text.count("\n") > 30
    assert "(1) PRIMARY mean tau(ff) - tau(tt) = -0.081, interval -0.176 to +0.008: refuted" in text
    assert "(4) mean d(ff) - d(tt) = -0.01 points: refuted" in text
    assert "(5) Spearman of tau against d over 26 units: -0.623: held" in text
    assert "Spearman of tauA against d over 26 units: +0.043" in text
    assert sum(l.endswith(": held") for l in text.splitlines()) == 5
