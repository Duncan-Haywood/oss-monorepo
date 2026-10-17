import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodeswitch import switch as sw

OPTS = [sw.OURS, sw.REF]

def test_gate_hysteresis_and_lag():
    g = sw.Gate(33.0, 34.0)
    assert g(0, 33.5, 37) == sw.CLOSED          # inside the band: keeps its state
    assert g(1, 34.5, 37) == sw.OPEN
    assert g(2, 33.5, 37) == sw.OPEN            # inside the band: still open
    assert g(3, 32.5, 37) == sw.CLOSED
    s = sw.Gate(33.0, 34.0, lag=10)
    v = s(0, 35.0, 37)
    assert sw.CLOSED < v < sw.OPEN and abs(v - (sw.CLOSED + (sw.OPEN - sw.CLOSED) / 10)) < 1e-12

@pytest.mark.parametrize("opts", OPTS)
@pytest.mark.parametrize("room", list(sw.ROOMS))
def test_gate_never_opened_equals_fixed_closed(room, opts):
    a, _ = sw.run(room, opts, tau=sw.CLOSED)
    b, tr = sw.run(room, opts, gate=sw.Gate(60.0, 61.0))     # thresholds never reached
    assert all(abs(a[k] - b[k]) < 1e-9 for k in a) and sw.open_fraction(tr) == 0.0

@pytest.mark.parametrize("opts", OPTS)
def test_always_open_gate_equals_fixed_open(opts):
    a, _ = sw.run("hot 31 C", opts, tau=sw.OPEN)
    b, _ = sw.run("hot 31 C", opts, gate=sw.Gate(-10.0, -9.0, start=sw.OPEN))   # command is open from minute 0
    assert all(abs(a[k] - b[k]) < 1e-9 for k in a)

def test_hot_room_gate_lies_between_fixed_states():
    c, _ = sw.run("hot 31 C", sw.OURS, tau=sw.CLOSED)
    o, _ = sw.run("hot 31 C", sw.OURS, tau=sw.OPEN)
    g, tr = sw.run("hot 31 C", sw.OURS, gate=sw.Gate(33.0, 34.0, 10))
    assert o["tsk"] - 1e-9 <= g["tsk"] <= c["tsk"] + 1e-9 and sw.open_fraction(tr) > 0.5

def test_hook_does_not_change_default_run():
    r1, _ = sw.run("cool 16 C", sw.OURS, tau=sw.CLOSED)
    assert abs(r1["tsk"] - 27.00) < 0.01          # skin temperature of garment-thermal / twonodegate
