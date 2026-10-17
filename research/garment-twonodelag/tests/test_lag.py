import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodelag import lag as L

SMALL = [(0.0, 0.0), (5.0, 0.03)]

def test_zero_penalty_cost_is_plain_proxy():
    sc = L.TRAIN[0]
    plain = L.h.score(sc, L.OURS, band=L.DEFAULT_BAND, lag=5.0)
    assert abs(L.cost(sc, L.OURS, L.DEFAULT_BAND, 5.0, 0.0) - plain) < 1e-12

def test_penalty_adds_per_switch():
    sc = L.TRAIN[0]
    n = L.n_switches(L.run(sc, L.OURS, L.DEFAULT_BAND, 0.0))
    d = L.cost(sc, L.OURS, L.DEFAULT_BAND, 0.0, 0.03) - L.cost(sc, L.OURS, L.DEFAULT_BAND, 0.0, 0.0)
    assert abs(d - 0.03 * n) < 1e-12

def test_lag_zero_reproduces_held_tuning():
    b, s = L.tune(L.TRAIN, L.OURS, 0.0, 0.0)
    hb, hs = L.h.tune(L.TRAIN, L.OURS)
    assert b == hb and abs(s - hs) < 1e-12

def test_tuned_no_worse_than_default_on_train():
    for lag, pen in SMALL:
        b, s = L.tune(L.TRAIN, L.REF, lag, pen, grid=L.h.bands() + [L.DEFAULT_BAND])
        assert s <= L.mean_cost(L.TRAIN, L.REF, L.DEFAULT_BAND, lag, pen) + 1e-12

def test_penalty_never_raises_switch_count_of_tuned_band_on_train():
    # a heavier penalty can only make the tuned band switch no more on the training set than the penalty-free one
    b0, _ = L.tune(L.TRAIN, L.OURS, 0.0, 0.0)
    b1, _ = L.tune(L.TRAIN, L.OURS, 0.0, 0.03)
    n = lambda b: sum(L.n_switches(L.run(sc, L.OURS, b, 0.0)) for sc in L.TRAIN)
    assert n(b1) <= n(b0)
