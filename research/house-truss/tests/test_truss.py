import math

import pytest

from house_spans.model import CASES, Member, board_feet_per_sf, size_member
from house_truss.cli import main
from house_truss.model import Truss, bf_per_sf, board_feet, checks, geometry, lightest, passes, solve, stick_frame, T, DEPTH, SPF2


def _areas(t):
    return [T * DEPTH[{"top": t.top, "bottom": t.bottom, "web": t.web}[k]] for _, _, k in geometry(t)[1]]


def test_geometry_is_determinate_and_symmetric():
    nodes, members = geometry(Truss())
    assert 2 * len(nodes) == len(members) + 3
    assert nodes[2] == pytest.approx((144, 48))  # 24 ft span, 4/12: apex 4 ft up
    assert nodes[1][1] == pytest.approx(nodes[3][1])


def test_apex_load_matches_statics():
    # A load P at the apex: reaction P/2 each side. At the heel, the top chord alone resists the vertical
    # reaction (F sin(theta) = P/2) and the horizontal bottom chord the rest (F cos(theta)).
    t = Truss()
    nodes, members = geometry(t)
    P = 1000.0
    forces, _ = solve(nodes, members, _areas(t), SPF2["E"], {2: (0.0, -P)})
    theta = math.atan(4 / 12)
    assert forces[0] == pytest.approx(-P / (2 * math.sin(theta)), rel=1e-9)
    assert forces[4] == pytest.approx(P / (2 * math.tan(theta)), rel=1e-9)


def test_joint_equilibrium_under_service_load():
    t = Truss()
    nodes, members = geometry(t)
    _, detail = checks(t)
    F = detail["D+snow"]
    # horizontal equilibrium at the heel joint: top chord and bottom chord horizontal components cancel
    (_, j0, _), (_, j4, _) = members[0], members[4]
    c = (nodes[1][0] - nodes[0][0]) / math.hypot(nodes[1][0] - nodes[0][0], nodes[1][1] - nodes[0][1])
    assert F[0] * c + F[4] == pytest.approx(0.0, abs=1e-6)


def test_hand_checked_heel_force():
    # 24 ft, 24 in o.c., 45 psf on top and 5 psf on the ceiling: total 2400 lb... see README: top heel
    # force = (R - heel load) / sin(theta) with R = 1200 lb
    t = Truss()
    _, detail = checks(t)
    S, sp = 288.0, 2.0
    total = 45 * sp * 24 + 5 * sp * 24
    heel = 45 * sp * S / 8 / 12 + 5 * sp * (S / 6) / 12
    expected = (total / 2 - heel) / math.sin(math.atan(4 / 12))
    assert -detail["D+snow"][0] == pytest.approx(expected, rel=1e-9)


def test_2x4_truss_fails_at_24ft_but_a_heavier_one_passes():
    assert not passes(Truss())
    best = lightest(24.0)
    assert best is not None and passes(best[0])
    assert board_feet(best[0]) < board_feet(Truss(top="2x8", bottom="2x8"))


def test_lumber_grows_with_span():
    spans = (16.0, 20.0, 24.0, 28.0)
    bf = [lightest(s)[1] for s in spans]
    assert bf == sorted(bf)


def test_bf_per_sf_is_board_feet_over_plan_area():
    t = Truss(top="2x6", bottom="2x6")
    assert bf_per_sf(t) == pytest.approx(board_feet(t) / (24 * 2))


def test_stick_frame_agrees_with_house_spans():
    s = stick_frame(24.0)
    assert s["rafter"] == size_member(12.0, CASES["roof-snow30"], "SPF", 16.0, 1, ("2x6", "2x8", "2x10", "2x12"), 4.0)[0]
    cos = 1 / math.sqrt(1 + (4 / 12) ** 2)
    expect = board_feet_per_sf(Member(s["rafter"], 1, "SPF", 16.0)) / cos + board_feet_per_sf(Member(s["joist"], 1, "SPF", 16.0))
    assert s["bf_per_sf"] == pytest.approx(expect)


def test_cli(capsys):
    main(["size", "--span", "24"])
    assert "truss:" in capsys.readouterr().out
    main(["check", "--span", "24", "--top", "2x6", "--bottom", "2x6"])
    assert "top chord" in capsys.readouterr().out
