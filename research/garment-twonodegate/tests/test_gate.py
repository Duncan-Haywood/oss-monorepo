import os, sys, pytest
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from garment_twonodegate import gate

OPTS = [gate.OURS, gate.REF]

@pytest.mark.parametrize("room", list(gate.ROOMS))
@pytest.mark.parametrize("opts", OPTS)
def test_steady_by_1440(room, opts):
    for tau in (gate.CLOSED, gate.OPEN):
        a, b = gate.state(room, tau, opts, gate.STEADY), gate.state(room, tau, opts, gate.CHECK)
        assert max(abs(a[k] - b[k]) for k in ("tsk", "tcr", "dry", "evap")) < 0.01

@pytest.mark.parametrize("room", list(gate.ROOMS))
@pytest.mark.parametrize("opts", OPTS)
def test_open_gate_cools_skin_and_loses_more_dry_heat(room, opts):
    for m in (gate.THREE_H, gate.STEADY):
        e = gate.gate_effect(room, opts, m)
        assert e["tsk"] < 0 and e["dry"] > 0

def test_cool_room_effect_larger_than_hot_room_on_skin():
    e_hot = gate.gate_effect("hot room 31 C / 50%", gate.OURS, gate.STEADY)
    e_cool = gate.gate_effect("cool room 16 C / 50%", gate.OURS, gate.STEADY)
    assert abs(e_cool["tsk"]) > 3 * abs(e_hot["tsk"])

def test_matches_garment_thermal_skin_temperatures_under_ours():
    # garment-thermal README, section E (same fabric/environment, its own model): 27.0 and 25.6 C at 16 C
    c = gate.state("cool room 16 C / 50%", gate.CLOSED, gate.OURS, gate.THREE_H)["tsk"]
    o = gate.state("cool room 16 C / 50%", gate.OPEN, gate.OURS, gate.THREE_H)["tsk"]
    assert abs(c - 27.0) < 0.1 and abs(o - 25.6) < 0.1
