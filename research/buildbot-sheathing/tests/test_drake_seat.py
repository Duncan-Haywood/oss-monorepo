"""Milestone 6: the Drake ledger seat and slide agree with the closed forms (skipped without drake)."""
import math

import numpy as np
import pytest

from buildbot_sheathing import cycle as C
from buildbot_sheathing import humanoid as HM
from buildbot_sheathing import ledger as L

D = math.radians


def test_residual_hook_zero_matches_no_ledger_error():
    # a zero residual resampled into the draw leaves the clean rate within Monte Carlo noise
    a = C.clean_cell(framing="2x2x", policy="single", trials=4000, seed=3)["clean"]
    b = C.clean_cell(framing="2x2x", policy="single", trials=4000, seed=3, residual=np.zeros(5))["clean"]
    assert abs(a - b) < 0.02


def test_residual_hook_large_residual_costs_clean_sheets():
    big = np.full(10, D(0.5))
    a = C.clean_cell(framing="2x", policy="three", trials=4000, seed=3, residual=np.zeros(1))["clean"]
    b = C.clean_cell(framing="2x", policy="three", trials=4000, seed=3, residual=big)["clean"]
    assert b < a - 0.2


DS = None
try:
    import pydrake  # noqa: F401
    from buildbot_sheathing import drake_seat as DS
except ImportError:
    pass
needs_drake = pytest.mark.skipif(DS is None, reason="drake not installed")


@needs_drake
def test_light_press_seats_and_heavy_press_sticks():
    th0 = D(1.0)
    assert abs(DS.seat(theta0=th0, mu=0.4, f_n=50.0)["theta"]) < D(0.005)
    assert DS.seat(theta0=th0, mu=0.4, f_n=400.0)["theta"] > 0.9 * th0


@needs_drake
def test_held_wrist_matches_closed_form():
    th0 = D(1.0)
    r = DS.seat(theta0=th0, mu=0.4, f_n=5.0, k_hold=30000.0)["theta"]
    assert r == pytest.approx(L.held_residual(th0, 30000.0, 0.4, 5.0), abs=D(0.01))


@needs_drake
def test_tilted_ledger_is_followed():
    r = DS.seat(theta0=D(0.5), mu=0.4, f_n=50.0, ledger_dz=1e-3)["theta"]
    assert abs(r) < D(0.01)


@needs_drake
def test_slide_tips_above_closed_form_height_only():
    hc = HM.tip_height(0.4)
    assert DS.slide(0.8 * hc)["peak_tilt"] < D(0.5)
    assert DS.slide(min(1.15 * hc, L.H - 0.05))["peak_tilt"] > D(0.5)
