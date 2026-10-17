"""Closed (tau 0.15) and open (tau 0.8) states of an infrared-gating textile in garment-twonodeoptics'
switchable two-node model, at 3 h and at steady state. No switching dynamics. The model lives in
../garment-twonodeoptics."""
import os, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "..", "garment-twonodeoptics", "src"))
from garment_twonodeoptics import flex  # noqa: E402

OURS, REF = flex.OURS, flex.REF
CLOSED, OPEN = 0.15, 0.8
THREE_H, STEADY, CHECK = 180, 1440, 2880
ROOMS = {"hot room 31 C / 50%": 31.0, "cool room 16 C / 50%": 16.0}


def state(room, tau, opts, minutes):
    """Two-node end state at 1.2 met, 0.5 clo, 50% rh, v 0.1 m/s, radiant = air temperature."""
    return flex.run(1.2, 0.5, ROOMS[room], 50, v=0.1, opts=opts, tau=tau, minutes=minutes)


def gate_effect(room, opts, minutes):
    """Open minus closed, for tsk, tcr (C) and dry, evap (W/m2)."""
    c, o = state(room, CLOSED, opts, minutes), state(room, OPEN, opts, minutes)
    return {k: o[k] - c[k] for k in ("tsk", "tcr", "dry", "evap")}
