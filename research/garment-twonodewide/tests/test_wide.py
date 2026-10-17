import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodewide import wide as W

def test_test_rooms_not_in_training():
    assert W.disjoint()

def test_wide_contains_narrow():
    assert set(W.TRAIN_NARROW) <= set(W.TRAIN_WIDE)

def test_each_room_both_directions():
    assert len(W.TRAIN_WIDE) == 10 and len(W.TRAIN_NARROW) == 6

def test_tune_on_wide_picks_grid_member():
    g = W.Q.P.grid()[:6]
    b, _ = W.Q.tune(W.Q.prop_cost, W.TRAIN_WIDE, W.Q.OURS, 5.0, 0.01, g)
    assert b in g
