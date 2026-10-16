import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeperson import person as X

def test_baseline_matches_wide_model():
    # same scenario/gate as garment-twonodemet's fixed 0.5 clo, 70 kg, 1.7 m must give the same discomfort
    sc = X.scenarios((24.0,))[0]
    old = X.Q.h.met.simulate(24.0, 1.0, 2.0, X.Q.OURS, X.h.Gate(33.6, 33.8, 0.0))[1]
    new = X.simulate(sc, X.Q.OURS, X.h.Gate(33.6, 33.8, 0.0))
    assert abs(X.met.discomfort(old) - X.met.discomfort(new)) < 1e-12

def test_groups_differ_from_training():
    assert all(sc != X.TRAIN for sc in X.TEST.values())
    assert all(set(sc).isdisjoint(X.TRAIN) for sc in X.TEST.values())

def test_each_room_both_directions():
    assert len(X.TRAIN) == 6 and all(len(s) == 6 for s in X.TEST.values())

def test_clothing_changes_outcome():
    g = lambda: X.h.Gate(33.6, 33.8, 0.0)
    a = X.met.discomfort(X.simulate(X.scenarios((24.0,), clo=0.3)[0], X.Q.OURS, g()))
    b = X.met.discomfort(X.simulate(X.scenarios((24.0,), clo=1.2)[0], X.Q.OURS, g()))
    assert a != b
