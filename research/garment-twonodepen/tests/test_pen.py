import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodepen import pen as Q

def test_swings_full_cycle_is_two():
    tr = [(0, Q.CLOSED, 0, 0), (1, Q.OPEN, 0, 0), (2, Q.CLOSED, 0, 0)]
    assert abs(Q.swings(tr) - 2.0) < 1e-12

def test_swings_constant_is_zero():
    assert Q.swings([(i, 0.5, 0, 0) for i in range(5)]) == 0.0

def test_zero_penalty_is_plain_discomfort():
    sc = Q.TRAIN[0]
    tr = Q.h.met.simulate(*sc, Q.OURS, Q.P.PropGate(33.0, 34.0, 0.0))[1]
    assert abs(Q.prop_cost(sc, Q.OURS, (33.0, 34.0), 0.0, 0.0) - Q.h.met.discomfort(tr)) < 1e-12

def test_cost_nondecreasing_in_penalty():
    sc = Q.TRAIN[0]
    a = Q.onoff_cost(sc, Q.OURS, (33.4, 33.6), 0.0, 0.01)
    b = Q.onoff_cost(sc, Q.OURS, (33.4, 33.6), 0.0, 0.03)
    assert b >= a

def test_tune_picks_grid_member():
    g = Q.P.grid()[:6]
    b, _ = Q.tune(Q.prop_cost, Q.TRAIN, Q.OURS, 5.0, 0.01, g)
    assert b in g
