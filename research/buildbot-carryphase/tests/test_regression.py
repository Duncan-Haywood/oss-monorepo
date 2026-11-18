"""Stored rows of experiments/results.json reproduce through score(), including the feasibility verdict.

Quality audit 2026-11-07, defect 1: loosening the torque threshold in `ok` (1.0 to 1.3) or flipping the
sign of the centre-of-pressure x coordinate left every test passing. These rows pin the torque ratio, the
sole margin and the verdict. Rerun ratios move by up to about 2% between MuJoCo builds, so ratio is checked
to 3% and the margin to 3 mm; every row is further than that from the thresholds it tests.
"""
import json
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "buildbot-payload" / "src"), str(Path(__file__).resolve().parents[1] / "src")]
from buildbot_payload import fetch  # noqa: E402
from buildbot_carryphase import model as C  # noqa: E402

RESULTS = json.loads((Path(__file__).resolve().parents[1] / "experiments" / "results.json").read_text())
HAND = tuple(RESULTS["hand"])
needs_robot = pytest.mark.skipif(not fetch.available("g1"), reason="needs the Menagerie clone (git + network)")


@pytest.fixture(scope="module")
def g1():
    from buildbot_payload import model as P
    r = P.load("g1")
    return C.Setup(r, P.standing(r))


# (mass, L, T): feasible and unloaded; feasible at 3 kg; over the torque limit by 8% with the CoP on the
# sole (only the torque rule rejects it); CoP off the heel at a fast unloaded step.
ROWS = [(0.0, 0.1, 1.0), (3.0, 0.2, 1.5), (4.0, 0.1, 0.6), (0.0, 0.1, 0.4)]


@needs_robot
@pytest.mark.parametrize("mass,L,T", ROWS)
def test_stored_flat_rows_reproduce(g1, mass, L, T):
    (want,) = [r for r in RESULTS["rows"] if r["robot"] == "g1" and (r["mass"], r["L"], r["T"]) == (mass, L, T)
               and r["slope"] == 0.0 and r["rise"] == 0.0]
    s, _ = C.score(g1, L, T, mass, hand=HAND)
    assert bool(s.ok) == want["ok"]
    assert s.ratio == pytest.approx(want["ratio"], rel=0.03)
    assert s.zmp_margin == pytest.approx(want["zmp"], abs=3e-3)


def test_centre_of_pressure_from_a_point_force():
    # 300 N up from the ground, acting 4 cm toward the toe and 1 cm to the left of the sole point
    import numpy as np
    r, F = np.array([0.04, 0.01, 0.0]), np.array([0.0, 0.0, 300.0])
    f = np.concatenate([F, np.cross(r, F)])
    assert C.centre_of_pressure(f) == pytest.approx((0.04, 0.01))


def test_sole_margin_on_a_lopsided_sole():
    # heel 3 cm behind the sole point, toe 12 cm ahead: a CoP 10 cm forward has 2 cm to the toe edge
    import numpy as np
    box = (-0.03, 0.12, -0.035, 0.035)
    f = np.concatenate([[0.0, 0.0, 300.0], np.cross([0.10, 0.0, 0.0], [0.0, 0.0, 300.0])])
    assert C.sole_margin(f, box) == pytest.approx(0.02)
    assert C.sole_margin(np.array([0.0, 0.0, 0.0, 0.0, 0.0, 0.0]), box) == -1.0
