"""Guards on the wiring from the CoP sweep into buildbot_carryphase's scorer, and on stored sweep rows.

The orbit tests in test_model.py check lipm_x_ramp alone. These check that cop_ramp/score hand that orbit
to carryphase with c0 at heel strike and c1 at toe-off (quality audit 2026-11-07, defect 0: passing
(c0, c0), or reversing the sweep, passed every test), and that stored rows of experiments/results.json
reproduce. Rerun ratios move by up to about 2%, so ratio is checked to 3% and the sole margin to 3 mm.
"""
import json
import sys
from pathlib import Path

import numpy as np
import pytest

ROOT = Path(__file__).resolve().parents[2]
sys.path[:0] = [str(ROOT / "buildbot-payload" / "src"), str(ROOT / "buildbot-carryphase" / "src"),
                str(Path(__file__).resolve().parents[1] / "src")]
from buildbot_payload import fetch  # noqa: E402
from buildbot_carryphase import model as C  # noqa: E402
from buildbot_carryramp import model as M  # noqa: E402

RESULTS = json.loads((Path(__file__).resolve().parents[1] / "experiments" / "results.json").read_text())
needs_robot = pytest.mark.skipif(not fetch.available("g1"), reason="needs the Menagerie clone (git + network)")
HAND = (0.3, 0.6)


def stored(robot, mass, ramp, L, T):
    (row,) = [r for r in RESULTS["rows"]
              if (r["robot"], r["mass"], tuple(r["ramp"]), r["L"], r["T"]) == (robot, mass, ramp, L, T)]
    return row


@pytest.mark.parametrize("c0,c1", [(-0.06, 0.06), (0.03, -0.03)])
def test_cop_ramp_hands_carryphase_the_sweep_orbit(c0, c1):
    t = np.linspace(0, 0.9, 7)
    with M.cop_ramp(c0, c1):
        x = C.lipm_x(0.2, 0.9, 0.7, t)
    assert np.allclose(x, M.lipm_x_ramp(0.2, 0.9, 0.7, t, c0, c1), atol=1e-12)


def test_score_runs_carryphase_inside_the_sweep_in_order(monkeypatch):
    seen = {}

    def fake(su, L, T, mass, **kw):
        seen["x"] = C.lipm_x(L, T, 0.7, np.array([0.2, 0.6]))
        return "s", None

    monkeypatch.setattr(C, "score", fake)
    M.score(None, 0.2, 0.8, 3.0, -0.06, 0.06, hand=HAND)
    assert np.allclose(seen["x"], M.lipm_x_ramp(0.2, 0.8, 0.7, np.array([0.2, 0.6]), -0.06, 0.06), atol=1e-12)
    assert not np.allclose(seen["x"], M.lipm_x_ramp(0.2, 0.8, 0.7, np.array([0.2, 0.6]), 0.06, -0.06), atol=1e-6)


@pytest.fixture(scope="module")
def g1():
    from buildbot_payload import model as P
    r = P.load("g1")
    return C.Setup(r, P.standing(r))


# G1 4 kg at the headline gait: heel-to-toe sweeps that are feasible, the constant -6 cm CoP, and the
# reversed +3 > -3 cm sweep that fails on torque.
@needs_robot
@pytest.mark.parametrize("ramp", [(-0.06, 0.06), (-0.03, 0.03), (0.03, -0.03), (-0.06, -0.06)])
def test_stored_rows_reproduce(g1, ramp):
    want = stored("g1", 4.0, ramp, 0.2, 1.5)
    s, _ = M.score(g1, 0.2, 1.5, 4.0, *ramp, hand=HAND)
    assert s.ratio == pytest.approx(want["ratio"], rel=0.03)
    assert s.zmp_margin == pytest.approx(want["zmp"], abs=3e-3)
    if abs(want["ratio"] - 1.0) > 0.03:  # the -3 > +3 cm row sits 0.4% under the limit: its verdict is not stable
        assert bool(s.ok) == want["ok"]
