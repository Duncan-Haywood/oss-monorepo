import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeprop import prop as P

def test_law_endpoints_and_midpoint():
    g = P.PropGate(33.0, 34.0)
    assert g(0, 30.0, 0) == P.CLOSED
    assert g(0, 35.0, 0) == P.OPEN
    assert abs(g(0, 33.5, 0) - (P.CLOSED + P.OPEN) / 2) < 1e-12

def test_lag_is_first_order():
    g = P.PropGate(33.0, 34.0, lag=10.0)
    t = g(0, 35.0, 0)
    assert abs(t - (P.CLOSED + (P.OPEN - P.CLOSED) / 10)) < 1e-12

def test_transmittance_stays_in_range():
    for sc in P.TRAIN[:2]:
        lo, hi = P.tau_range(sc, P.OURS, (33.0, 34.0), 5.0)
        assert P.CLOSED - 1e-9 <= lo <= hi <= P.OPEN + 1e-9

def test_narrow_band_approaches_onoff():
    sc = P.TRAIN[0]
    d = P.score(sc, P.OURS, (33.2, 33.2 + 1e-6), 0.0)
    assert abs(d - P.L.h.score(sc, P.OURS, band=(33.2, 33.2), lag=0.0)) < 0.05

def test_tuned_no_worse_than_grid_member_on_train():
    b, s = P.tune(P.TRAIN, P.REF, 5.0)
    assert s <= P.mean_score(P.TRAIN, P.REF, (33.0, 34.0), 5.0) + 1e-12
