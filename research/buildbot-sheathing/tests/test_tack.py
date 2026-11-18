import math

import pytest

from buildbot_sheathing import asbuilt as A
from buildbot_sheathing import budget as B
from buildbot_sheathing import tack as K

MM = 1e-3
BAND = A.Band(step_deg=0.5)
H = B.joint_half(B.GAP)                       # 3.14 mm on a single 2x
PERFECT = dict(s_read=0.0, s_robot=0.0, s_edge=0.0, band=BAND, trials=20000)


def _p(half, s):
    return math.erf(half / (s * math.sqrt(2)))


def test_no_pose_error_reproduces_milestone_2():
    kw = dict(bow_mean=0.11 * B.IN, twist_mean=0.08 * B.IN, band=BAND)
    a = A.simulate(trials=20000, seed=5, **kw)[0]
    k = K.simulate(trials=20000, seed=6, **kw)["clean"]
    assert k == pytest.approx(a, abs=0.012)


def test_translation_only_matches_closed_forms():
    # straight studs, perfect sensing and tool: edge aim passes while the window exists
    # (|x| <= 2h); nominal aim passes while the design point stays inside it (|x| <= h)
    s = 2.5 * MM
    e = K.simulate(s_x=s, **PERFECT)["clean"]
    n = K.simulate(s_x=s, aim="nominal", **PERFECT)["clean"]
    assert e == pytest.approx(_p(2 * H, s), abs=0.01)
    assert n == pytest.approx(_p(H, s), abs=0.01)


def test_rotation_only_matches_closed_form():
    s = math.radians(0.15)
    e = K.simulate(s_theta=s, **PERFECT)["clean"]
    assert e == pytest.approx(_p(2 * H / K.TOP, s), abs=0.01)


def test_rehang_is_geometric_and_only_clean_hangs_are_kept():
    s = 4 * MM
    r = K.simulate(s_x=s, accept_half=1e-9, max_hangs=5, **PERFECT)
    p = _p(2 * H, s)
    assert r["hangs"] == pytest.approx(K.geometric_hangs(p, 5), abs=0.02)
    assert r["clean"] == pytest.approx(1 - (1 - p) ** 5, abs=0.01)


def _phi(v):
    return 0.5 * (1 + math.erf(v / math.sqrt(2)))


def test_sway_moves_only_the_edge_side_of_a_joint_window():
    # perfect hang and sensing, straight studs: a joint nail aimed at the window centre passes
    # when -h + sway <= tool <= h (sway moves the sheet edge, not the stud); field and plate
    # nails see the tool alone. Integrate over the sway numerically.
    s_tool, s_sway = 0.6 * MM, 0.8 * MM
    got = K.simulate(s_robot=s_tool, s_sway=s_sway, s_read=0.0, s_edge=0.0, band=BAND,
                     trials=40000)["clean"]
    n = 4001
    zs = [-8 + 16 * i / (n - 1) for i in range(n)]
    dz = zs[1] - zs[0]
    pj = sum(math.exp(-z * z / 2) / math.sqrt(2 * math.pi) * dz
             * max(0.0, _phi(H / s_tool) - _phi((-H + z * s_sway) / s_tool)) for z in zs)
    want = pj ** 34 * _p(B.FACE / 2 - B.R, s_tool) ** 14
    for h in B.plate_halves():
        want *= _p(h, s_tool)
    assert got == pytest.approx(want, abs=0.012)


def test_wider_joints_allow_a_coarser_hang():
    kw = dict(bow_mean=0.11 * B.IN, twist_mean=0.08 * B.IN, band=BAND, trials=5000)
    wide = A.Band(face=3.0 * B.IN, step_deg=0.5)
    s = math.radians(0.1)
    assert K.success(joint_band=wide, s_theta=s, **kw) > K.success(s_theta=s, **kw) + 0.3
