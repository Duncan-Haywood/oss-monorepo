"""Milestone 41: the zero-press lean and the window-width check."""
import math
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from buildbot_sheathing import stance0 as S0  # noqa: E402


def test_lean_for_zero_finds_the_edge():
    edge = 0.0317
    dx, n = S0.lean_for_zero(lambda d: d <= edge, 0.0, 0.1, tol=1e-5)
    assert abs(dx - edge) < 1e-5 and dx <= edge
    assert n < 30


def test_lean_for_zero_rejects_bad_bracket():
    with pytest.raises(ValueError):
        S0.lean_for_zero(lambda d: False, 0.0, 0.1)
    with pytest.raises(ValueError):
        S0.lean_for_zero(lambda d: True, 0.0, 0.1)


def test_covers_and_margin():
    assert S0.covers((0.0, 60.0), 0.0, 50.0)
    assert not S0.covers((6.4, 60.0), 0.0, 50.0)
    assert not S0.covers(None, 0.0, 50.0)
    assert S0.margin_above((0.0, 61.5), 50.0) == pytest.approx(11.5)
    assert S0.margin_above(None, 50.0) == -math.inf


def test_window_width_rigid_body():
    # 35 kg on a 0.2 m sole pushing at 1 m: 35 * 9.81 * 0.2 = 68.67 N; twice the height halves it
    assert S0.window_width(35.0, 0.2, 1.0) == pytest.approx(68.67)
    assert S0.window_width(35.0, 0.2, 2.0) == pytest.approx(68.67 / 2)
    assert S0.window_width(31.6, 0.2, 1.0, tool_kg=3.4) == pytest.approx(68.67)
