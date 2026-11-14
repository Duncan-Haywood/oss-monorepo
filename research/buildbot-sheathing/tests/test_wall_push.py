"""Milestone 19: the wall pushover (wall_push) against the wall LP and milestone 16's sheet."""
import numpy as np
import pytest

pytest.importorskip("scipy")

from buildbot_sheathing import frame_lp as L  # noqa: E402
from buildbot_sheathing import racking as R  # noqa: E402
from buildbot_sheathing import softnail as S  # noqa: E402
from buildbot_sheathing import wall_lp as W  # noqa: E402
from buildbot_sheathing import wall_push as P  # noqa: E402
from buildbot_sheathing.budget import IN  # noqa: E402

MM = 1e-3
FP = 972.0
XZ, FR = R.layout()


def test_epp_springs_reach_the_lp_capacity():
    w = W.weiss_wall(6.0)
    keep = W.decay_mask(w.xz)
    epp = S.Backbone.elastic_plastic(FP, 0.1 * MM)
    jb = S.Backbone.elastic_plastic(0.47 * 1.2971 * FP, 0.1 * MM)
    for cap in (0.0, 2.55):
        pw = P.PushWall(w, keep, epp, jb, rod_k=FP / (0.1 * MM), rod_cap=cap * FP)
        o = pw.pushover(d_max=0.06, step=3 * MM)
        assert o["final"] / FP == pytest.approx(w.capacity(keep, lat=0.47 * 1.2971, hd_shear=cap), rel=0.01)


def test_pinned_sheet_matches_milestone_16():
    bb = S.Backbone.from_tests(FP, 12 * MM, 496e3, 28.7 * MM)
    # pins on the edge-nail lines: milestone 16's parallelogram exactly (pins on the stud centre lines also move
    # the edge nails vertically, about 1.3% stiffer)
    studs = np.array([0.375 * IN, L.STUDS[1], L.STUDS[2], R.WIDTH - 0.375 * IN])
    one = W.Wall([(XZ, FR)], studs=studs, nails=np.ones(4), width=R.WIDTH)
    mk = XZ[:, 1] >= 12 * IN - 1e-9
    o = P.PushWall(one, mk, bb, None).pushover(d_max=0.08, step=2 * MM)
    ref = S.pushover(mk[None], XZ, FR, bb, d_max=0.08, step=2 * MM)
    assert o["peak"] == pytest.approx(float(ref["peak"][0]), rel=1e-5)


def test_energy_gradient_matches_finite_differences():
    w = W.weiss_wall(6.0)
    bb = S.Backbone.from_tests(FP, 12 * MM, 496e3, 28.7 * MM)
    jb = S.Backbone(1.3 * FP, 6 * MM, bb.n, 14 * MM)
    pw = P.PushWall(w, W.decay_mask(w.xz), bb, jb, rod_gap=1.6 * MM, rod_k=4e7, rod_cap=2.5 * FP)
    rng = np.random.default_rng(3)
    q = rng.normal(0, 3 * MM, pw.nq)
    q[2::3] *= 0.01
    E, g, H = pw.state(q)
    h = 1e-8
    for k in rng.choice(pw.nq, 8, replace=False):
        dq = np.zeros(pw.nq)
        dq[k] = h
        num = (pw.state(q + dq)[0] - pw.state(q - dq)[0]) / (2 * h)
        assert num == pytest.approx(g[k], rel=1e-4, abs=1e-3)


def test_rod_gap_carries_nothing_until_closed():
    w = W.weiss_wall(6.0)
    bb = S.Backbone.from_tests(FP, 12 * MM, 496e3, 28.7 * MM)
    pw = P.PushWall(w, None, bb, bb, rod_gap=2 * MM, rod_k=4e7, rod_cap=1e5)
    Pg, dP, E, _ = pw._rod(np.array([1.9 * MM, -1.0 * MM, 2.5 * MM, 1.0]))
    assert Pg[0] == 0 and Pg[1] == 0 and Pg[2] == pytest.approx(4e7 * 0.5 * MM) and Pg[3] == 1e5


def test_more_slack_never_adds_strength():
    w = W.weiss_wall(6.0)
    keep = W.decay_mask(w.xz)
    bb = S.Backbone.from_tests(FP, 12 * MM, 496e3, 28.7 * MM)
    jb = S.Backbone(0.6 * FP, 12 * MM, bb.n, 28.7 * MM)
    peaks = [P.PushWall(w, keep, bb, jb, rod_gap=g * IN, rod_k=P.nds_rod_k(), rod_cap=2.55 * FP)
             .pushover(d_max=0.08, step=2 * MM)["peak"] for g in (0.0, 0.25)]
    assert peaks[1] <= peaks[0] * (1 + 1e-6)


def test_nds_rod_modulus():
    # 2 x 270,000 x 0.625^1.5 = 266,800 lb/in = 46.7 kN/mm
    assert P.nds_rod_k(0.625) == pytest.approx(46.72e6, rel=2e-3)
