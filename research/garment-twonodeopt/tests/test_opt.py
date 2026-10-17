import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeopt import opt
st = opt.st

def test_piecewise_toggles():
    g = opt.piecewise(opt.CLOSED, (10, 20))
    assert [g(m, 0, 0) for m in (0, 10, 19, 20, 50)] == [opt.CLOSED, opt.OPEN, opt.OPEN, opt.CLOSED, opt.CLOSED]

def test_zero_toggle_schedule_equals_fixed_state():
    a = st.discomfort(st.simulate(31.0, 24.0, opt.OURS, opt.piecewise(opt.CLOSED, ()))[1])
    b = st.discomfort(st.simulate(31.0, 24.0, opt.OURS, st.fixed(opt.CLOSED))[1])
    assert abs(a - b) < 1e-12

def test_more_toggles_never_worse():
    d = [opt.best_schedule(31.0, 24.0, opt.OURS, max_switches=k, grid=30)[0] for k in range(3)]
    assert d[0] >= d[1] - 1e-12 >= d[2] - 2e-12

def test_optimum_no_worse_than_old_oracle():
    a, b = opt.SCENARIOS["mild->hot"]
    assert opt.best_schedule(a, b, opt.OURS, max_switches=1)[0] <= st.oracle(a, b, opt.OURS)[0] + 1e-12
