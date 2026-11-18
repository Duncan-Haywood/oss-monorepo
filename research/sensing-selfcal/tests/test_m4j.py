"""Milestone 4j: the TUM units' corners load, the 8x6 board is wired through selfcal, and the
milestone-4i twin works unchanged on a 48-corner board."""
import importlib.util, os, sys
import numpy as np
import pytest

HERE = os.path.dirname(__file__)
EXP = os.path.join(HERE, "..", "experiments", "m4j_tum")
sys.path.insert(0, EXP)
import tumunit as tu  # noqa: E402
import prepare  # noqa: E402

_spec = importlib.util.spec_from_file_location("m4j", os.path.join(EXP, "analyse.py"))
m4j = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(m4j)
twin = m4j.twin


def test_corners_load_as_13_views_of_48():
    for unit in tu.UNITS:
        obs, size, names = tu.load(unit)
        assert obs.shape == (13, 48, 2) and size == (640, 480) and len(set(names)) == 13
        # rule 2 of prepare.py: every view's first row points right
        assert np.all(obs[:, 7, 0] > obs[:, 0, 0])
        # rule 3: no view under 15 px between neighbouring corners
        assert min(prepare.spacing(o) for o in obs) >= 15.0


def test_orient_and_tilt():
    g = np.mgrid[0:6, 0:8][::-1].transpose(1, 2, 0).reshape(-1, 2).astype(float) * 20 + 100
    assert np.allclose(prepare.orient(g[::-1].copy()), g)
    assert prepare.tilt(g) == pytest.approx(0.0)
    assert prepare.spacing(g) == pytest.approx(20.0)


def test_patched_board_defaults():
    assert tu.sc.board_points().shape == (48, 3)
    X = tu.sc.board_points().astype(float)
    assert tu.sc.planarity(X)["rms"] == pytest.approx(0.0, abs=1e-12)


@pytest.fixture(scope="module")
def fr3():
    obs, size, _ = tu.load("fr3")
    f0 = tu.f0("fr3")
    return twin.fit_all(obs, size, f0), obs, size, f0


def test_twin_on_48_corners_matches_the_solver(fr3):
    tw, obs, size, f0 = fr3
    assert twin.NPT == 48
    s = tu.sc.selfcal_fixed_best(obs, size, f0, nk=1, refs=(0, 6))
    assert abs(tw["intr"][0] - s["f"]) < 1e-6 * s["f"]
    assert np.allclose(twin.project(tw, tuple(range(13))) - obs, tw["resid"])
    v = (1, 3, 6, 9, 12)
    clean = twin.project(tw, v)
    eps = np.random.default_rng(7).standard_normal(clean.size) * 0.03
    s = tu.sc.selfcal_fixed_best(clean + eps.reshape(clean.shape), size, f0, nk=1, refs=(0, 2))
    lin = twin.gain(tw, v) @ eps
    assert abs((s["f"] - tw["intr"][0]) - lin) < 0.03 * abs(lin) + 2e-3
