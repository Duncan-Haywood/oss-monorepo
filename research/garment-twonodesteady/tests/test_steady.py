import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodesteady import steady

CASES = [(1.2, 0.5, 16, 50, 0.1), (1.2, 0.5, 28, 50, 0.1), (1.6, 0.5, 32, 40, 1.0)]

def test_default_minutes_unchanged():
    from garment_twonodeoptics import flex
    a = flex.run(1.2, 0.5, 28, 50)
    b = flex.run(1.2, 0.5, 28, 50, minutes=60)
    assert a == b

@pytest.mark.parametrize("opts", [steady.OURS, steady.REF])
@pytest.mark.parametrize("case", CASES)
def test_reaches_steady_state(case, opts):
    assert steady.converged(*case, opts=opts)

def test_one_hour_is_not_steady_in_cool_room():
    h = steady.run(1.2, 0.5, 16, 50, minutes=60)
    s = steady.run(1.2, 0.5, 16, 50)
    assert h["tsk"] - s["tsk"] > 0.3

def test_optics_signs_at_steady_state():
    base = steady.run(1.2, 0.5, 26, 50, tr=34)
    gated = steady.run(1.2, 0.5, 26, 50, tr=34, tau=0.8)
    assert gated["dry"] > base["dry"]   # skin loses more when it sees the 34 C walls than the cooler cloth surface
