"""Milestone 20: the SAWS hysteresis, the CUREE history and the cyclic wall (wall_cyclic)."""
import json
import os

import numpy as np
import pytest

pytest.importorskip("scipy")

from buildbot_sheathing import wall_cyclic as C  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing import wall_push as P  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
S = C.anderson(115)


def test_curee_history_follows_w02():
    amps, prim = C.curee(1.0, max_amp=2.0)
    assert np.allclose(amps[:6], 0.05) and not prim[:6].any()
    primaries = amps[prim]
    assert np.allclose(primaries, [0.075, 0.1, 0.2, 0.3, 0.4, 0.7, 1.0, 1.5, 2.0])
    # trailing cycles: 6, 6, 3, 3, 2, 2, 2, 2, 2 at 75% of their primary
    idx = np.flatnonzero(prim)
    counts = np.diff(np.append(idx, amps.size)) - 1
    assert list(counts) == [6, 6, 3, 3, 2, 2, 2, 2, 2]
    for i, n in zip(idx, counts):
        assert np.allclose(amps[i + 1:i + 1 + n], 0.75 * amps[i])


def test_monotonic_path_follows_the_envelope():
    d = np.linspace(0, 1.5 * S.DF, 400)[1:]
    F = S.run(d)
    E, _ = S.env(d)
    live = d < S.DF
    assert np.allclose(F[live], E[live], rtol=0, atol=1e-9 * S.FU)
    assert np.all(F[~live] == 0)


def test_elastic_below_dint2_and_unloading_at_r3k0():
    small = 0.5 * S.DINT2
    F = S.run(np.array([small, 0.0, -small, 0.0]))
    assert np.allclose(F, [S.env(small)[0], 0.0, -S.env(small)[0], 0.0], atol=1e-9 * S.FU)
    d1 = 0.6 * S.Du
    F = S.run(np.array([d1, d1 - 1e-5]))
    assert F[0] - F[1] == pytest.approx(S.r3 * S.K0 * 1e-5, rel=1e-9)


def test_saws_matches_opensees_reference_trace():
    ref = json.load(open(os.path.join(HERE, "data", "saws_opensees.json")))
    F = S.run(np.array(ref["d"]))
    assert np.abs(F - np.array(ref["F"])).max() <= 1e-9 * S.FU


def test_foschi_backbone_energy_is_the_integral_of_load():
    bb = C.FoschiBackbone(S)
    d = np.linspace(1e-4, 2.5 * S.Du, 50)
    h = 1e-7
    _, _, Ep = bb._parts(d + h)
    _, _, Em = bb._parts(d - h)
    P_, _, _ = bb._parts(d)
    assert np.allclose((Ep - Em) / (2 * h), P_, rtol=1e-5, atol=1e-6 * S.FU)


def test_cyclic_wall_matches_the_radial_wall_while_elastic():
    """At a tiny drift every spring is linear at K0, so the pair and the radial spring agree."""
    w = W.weiss_wall(6.0)
    joint = S.scaled(1.2971, 1.0)
    cw = C.CyclicWall(w, None, S, joint)
    cw.orient()
    D = 1e-5
    load, res = cw.solve(D)
    pw = P.PushWall(w, None, C.FoschiBackbone(S), C.FoschiBackbone(joint))
    o = pw.pushover(d_max=D, step=D)
    assert res < 1e-6
    assert load == pytest.approx(o["curve"][0], rel=2e-3)


def test_rod_hole_lengthens_past_its_cap():
    w = W.weiss_wall(6.0)
    cw = C.CyclicWall(w, None, S, S.scaled(1.2971, 1.0), rod_gap=1e-3, rod_k=P.nds_rod_k(), rod_cap=0.5 * S.FU)
    d = np.array([5e-3, -5e-3])
    F, _, new = cw._rod(d, cw.hole)
    assert np.allclose(np.abs(F), 0.5 * S.FU)
    assert new["hi"][0] == pytest.approx(5e-3 - 0.5 * S.FU / cw.rod_k)
    assert new["lo"][1] == pytest.approx(-5e-3 + 0.5 * S.FU / cw.rod_k)
    assert new["lo"][0] == -1e-3 and new["hi"][1] == 1e-3
