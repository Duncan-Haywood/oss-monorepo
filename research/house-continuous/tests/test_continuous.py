import math

import pytest

from house_continuous.cli import main
from house_continuous.model import Beam, check, max_span, worst
from house_spans.model import CASES, Member
from house_spans.model import check as simple_check
from house_spans.model import max_span as simple_max_span

EI = 1.4e6 * 1.5 * 9.25 ** 3 / 12


def test_two_equal_spans_match_closed_form():
    L, w = 150.0, 0.5
    b = Beam([L, L], EI, [w, w])
    assert b.R == pytest.approx([3 * w * L / 8, 10 * w * L / 8, 3 * w * L / 8], rel=1e-9)
    assert b.moment(L) == pytest.approx(-w * L * L / 8, rel=1e-9)
    mpos = max(b.moment(x) for x in b.x)
    assert mpos == pytest.approx(9 * w * L * L / 128, rel=1e-3)  # at 3L/8, a node of the 16-element grid
    assert max(abs(v) for v in b.v) == pytest.approx(0.005416 * w * L ** 4 / EI, rel=2e-3)


def test_three_equal_spans_match_closed_form():
    L, w = 120.0, 0.4
    b = Beam([L] * 3, EI, [w] * 3)
    assert b.R == pytest.approx([0.4 * w * L, 1.1 * w * L, 1.1 * w * L, 0.4 * w * L], rel=1e-9)
    assert b.moment(L) == pytest.approx(-0.1 * w * L * L, rel=1e-9)


def test_pattern_load_on_one_span_matches_three_moment_equation():
    # two equal spans, load on span 1 only: M_B = -w L^2 / 16 and R_A = 7 w L / 16
    L, w = 100.0, 0.7
    b = Beam([L, L], EI, [w, 0.0])
    assert b.moment(L) == pytest.approx(-w * L * L / 16, rel=1e-9)
    assert b.R[0] == pytest.approx(7 * w * L / 16, rel=1e-9)



def test_equilibrium():
    b = Beam([100.0, 140.0, 90.0], EI, [0.3, 0.5, 0.2])
    assert sum(b.R) == pytest.approx(0.3 * 100 + 0.5 * 140 + 0.2 * 90, rel=1e-9)
    assert abs(b.moment(330.0)) < 1e-6  # free end of the statics sum is zero moment


def test_fe_converges_for_a_simple_span():
    b = Beam([144.0], EI, [0.5])
    assert max(abs(v) for v in b.v) == pytest.approx(5 * 0.5 * 144 ** 4 / (384 * EI), rel=1e-6)


def test_one_span_check_reduces_to_house_spans():
    # with a single span the continuous solver must reproduce the simple-span check (creep off)
    m = Member("2x10")
    for key in ("bending", "deflection live", "deflection total", "bearing"):
        assert check(m, 12.0, CASES["floor"], 1)[key] == pytest.approx(simple_check(m, 12.0, CASES["floor"])[key], rel=1e-5)
    # shear: the simple-span check takes V at d from the face, the same as the continuous one
    assert check(m, 12.0, CASES["floor"], 1)["shear"] == pytest.approx(simple_check(m, 12.0, CASES["floor"])["shear"], rel=1e-5)


def test_bending_does_not_improve_for_two_spans_under_full_uniform_load():
    # M_support = wL^2/8, the same as a simple span: continuity cannot lengthen a bending-governed joist
    m = Member("2x10")
    r2 = check(m, 15.0, CASES["floor"], 2)["bending"]
    r1 = simple_check(m, 15.0, CASES["floor"])["bending"]
    assert r2 == pytest.approx(r1, rel=1e-6)


def test_deflection_improves_and_ceiling_gains_most():
    m = Member("2x8")
    s, sg = simple_max_span(m, CASES["ceiling"])
    c, cg = max_span(m, CASES["ceiling"], 2)
    assert sg.startswith("deflection") and c > s


def test_middle_bearing_governs_more_than_end_bearing():
    m = Member("2x10", bearing_in=1.5)
    r = check(m, 14.0, CASES["floor"], 2, interior_bearing_in=1.5)
    assert r["bearing"] == pytest.approx(1.25 / 0.5 * simple_check(m, 14.0, CASES["floor"])["bearing"], rel=1e-6)
    assert check(m, 14.0, CASES["floor"], 2)["bearing"] < r["bearing"]  # 3.5 in default lowers it


def test_max_span_is_at_capacity_and_monotone():
    m = Member("2x8")
    ft, gov = max_span(m, CASES["floor"], 2)
    assert worst(check(m, ft, CASES["floor"], 2))[1] <= 1.0 < worst(check(m, ft + 0.02, CASES["floor"], 2))[1]


def test_cli_runs(capsys):
    main(["compare", "--size", "2x8", "--case", "ceiling"])
    out = capsys.readouterr().out
    assert "simple span" in out and "2-span continuous" in out
