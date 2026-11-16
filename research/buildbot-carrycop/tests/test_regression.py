"""Guards on the wiring from the CoP offset into buildbot_carryphase's scorer, and on stored sweep rows.

The orbit tests in test_model.py check lipm_x_cop alone. These check that cop_offset/score actually hand
that orbit to carryphase with the right sign (quality audit 2026-11-07, defect 0: a sign flip in the
wiring passed every test), and that three rows of experiments/results.json reproduce. Tolerances: rerun
ratios move by up to about 2% between MuJoCo builds (buildbot-carryramp audit), so ratio is checked to 3%
and the sole margin to 3 mm; the chosen rows sit further than that from every threshold.
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
from buildbot_carrycop import model as M  # noqa: E402

RESULTS = json.loads((Path(__file__).resolve().parents[1] / "experiments" / "results.json").read_text())
HAND = tuple(RESULTS["hand"])
needs_robot = pytest.mark.skipif(not fetch.available("g1"), reason="needs the Menagerie clone (git + network)")


def stored(robot, mass, c, L, T):
    (row,) = [r for r in RESULTS["rows"]
              if (r["robot"], r["mass"], r["c"], r["L"], r["T"]) == (robot, mass, c, L, T)]
    return row


@pytest.mark.parametrize("c", [-0.06, 0.03])
def test_cop_offset_hands_carryphase_the_offset_orbit(c):
    t = np.linspace(0, 0.9, 7)
    with M.cop_offset(c):
        x = C.lipm_x(0.2, 0.9, 0.7, t)
    assert np.allclose(x, M.lipm_x_cop(0.2, 0.9, 0.7, t, c), atol=1e-12)


def test_score_runs_carryphase_inside_the_offset(monkeypatch):
    seen = {}

    def fake(su, L, T, mass, **kw):
        seen["x"] = C.lipm_x(L, T, 0.7, np.array([T / 2]))[0]
        seen["kw"] = kw
        return "s", None

    monkeypatch.setattr(C, "score", fake)
    assert M.score(None, 0.2, 0.8, 3.0, 0.05, hand=HAND) == ("s", None)
    assert seen["x"] == pytest.approx(M.lipm_x_cop(0.2, 0.8, 0.7, np.array([0.4]), 0.05)[0], abs=1e-12)
    assert seen["kw"] == {"hand": HAND}


@pytest.fixture(scope="module")
def g1():
    from buildbot_payload import model as P
    r = P.load("g1")
    return C.Setup(r, P.standing(r))


# The 4 kg headline cell (feasible only with the CoP 6 cm back), its mirror (+6 cm, CoP off the sole),
# and the offset-0 cell, which fails on torque alone.
@needs_robot
@pytest.mark.parametrize("c", [-0.06, 0.06, 0.0])
def test_stored_rows_reproduce(g1, c):
    want = stored("g1", 4.0, c, 0.2, 1.5)
    s, _ = M.score(g1, 0.2, 1.5, 4.0, c, hand=HAND)
    assert bool(s.ok) == want["ok"]
    assert s.ratio == pytest.approx(want["ratio"], rel=0.03)
    assert s.zmp_margin == pytest.approx(want["zmp"], abs=3e-3)
    assert s.ik_res < 5e-3
