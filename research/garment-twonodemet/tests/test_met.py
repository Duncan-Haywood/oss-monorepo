import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodemet import met as mt
from garment_twonodeoptics import flex
from garment_twonodeswitch import switch as sw

@pytest.mark.parametrize("opts", [mt.OURS, mt.REF])
def test_constant_met_fn_matches_plain_run(opts):
    a = flex.run(1.2, 0.5, 24.0, 50, v=0.1, opts=opts, minutes=60, tau=0.8)
    b = flex.run(1.2, 0.5, 24.0, 50, v=0.1, opts=opts, minutes=60, tau=0.8, met_fn=lambda m: 1.2)
    assert all(abs(a[k] - b[k]) < 1e-9 for k in a)

def test_walking_raises_core_heat_before_vs_after():
    _, rest = mt.simulate(24.0, 1.0, 1.0, mt.OURS, mt.fixed(mt.CLOSED))
    _, step = mt.simulate(24.0, 1.0, 2.0, mt.OURS, mt.fixed(mt.CLOSED))
    assert step[10][2] == rest[10][2] and step[10][3] == rest[10][3]    # identical before the step
    assert step[-1][3] > rest[-1][3]                                     # core warmer after

def test_oracle_no_worse_than_fixed_states():
    for sc in mt.SCENARIOS.values():
        d, _, _ = mt.oracle(*sc, mt.OURS)
        for tau in (mt.CLOSED, mt.OPEN):
            assert d <= mt.discomfort(mt.simulate(*sc, mt.OURS, mt.fixed(tau))[1]) + 1e-12

def test_discomfort_zero_at_neutral():
    assert mt.discomfort([(0, 0.15, 33.7, 36.8)] * 3) == 0.0
