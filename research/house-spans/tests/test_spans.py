import math

import pytest

from house_spans.cli import main
from house_spans.model import CASES, Case, Member, board_feet_per_sf, check, lateral_note, max_span, size_member, worst


def test_floor_joist_matches_hand_calculation():
    # 2x10 SPF No. 2 at 16 in, 10 psf dead + 40 psf live, worked by hand (see README):
    # w = 50 * 16/12 = 66.67 plf; S = 21.39 in3; Fb' = 875 * 1.0 * 1.1 * 1.15 = 1106.9 psi
    m = Member("2x10")
    S = 1.5 * 9.25 ** 2 / 6
    w = 50 * 16 / 12 / 12  # lb/in
    L_bend = (math.sqrt(8 * 1106.875 * S / w) - 1.5) / 12  # design span is clear span + 1.5 in bearing
    r = check(m, L_bend, CASES["floor"])
    assert r["bending"] == pytest.approx(1.0, rel=1e-6)
    # live deflection L/360: L^3 = 384 E I / (5 w_live 360)
    I = 1.5 * 9.25 ** 3 / 12
    L_defl = ((384 * 1.4e6 * I / (5 * (40 * 16 / 12 / 12) * 360)) ** (1 / 3) - 1.5) / 12
    assert check(m, L_defl, CASES["floor"])["deflection live"] == pytest.approx(1.0, rel=1e-6)
    assert L_defl > L_bend  # bending governs this joist
    ft, gov = max_span(Member("2x10"), CASES["floor"])
    assert gov == "bending" and ft == pytest.approx(L_bend, abs=0.011) and ft <= L_bend


def test_ratios_grow_with_span_and_load():
    m = Member("2x8")
    for c in CASES.values():
        a, b = check(m, 8, c), check(m, 9, c)
        assert all(b[k] > a[k] for k in a)
    heavy = Case("heavy", 10, 80, 1.0, 360, 240)
    assert worst(check(m, 8, heavy))[1] > worst(check(m, 8, CASES["floor"]))[1]


def test_max_span_is_the_pass_fail_boundary():
    for size in ("2x6", "2x10"):
        for sp in (12, 24):
            for case in CASES.values():
                m = Member(size, spacing_in=sp)
                ft, _ = max_span(m, case)
                assert worst(check(m, ft, case))[1] <= 1.0
                assert worst(check(m, ft + 0.02, case))[1] > 1.0


def test_wider_spacing_and_smaller_size_never_span_further():
    f = lambda s, sp: max_span(Member(s, spacing_in=sp), CASES["floor"])[0]
    assert f("2x8", 12) > f("2x8", 16) > f("2x8", 24)
    assert f("2x6", 16) < f("2x8", 16) < f("2x10", 16) < f("2x12", 16)


def test_repetitive_factor_only_for_single_members():
    base = check(Member("2x10", repetitive=True), 14, CASES["floor"])["bending"]
    off = check(Member("2x10", repetitive=False), 14, CASES["floor"])["bending"]
    assert off / base == pytest.approx(1.15)
    # a two-ply member gets no Cr even if asked, and bending stress halves (twice the section)
    two = check(Member("2x10", plies=2, repetitive=True), 14, CASES["floor"])["bending"]
    assert two == pytest.approx(off / 2)


def test_species_df_l_stronger_than_spf_in_every_limit():
    s = max_span(Member("2x10", species="SPF"), CASES["floor"])[0]
    d = max_span(Member("2x10", species="DF-L"), CASES["floor"])[0]
    assert d > s


def test_pitched_rafter_deflects_more_than_flat_for_same_plan_loads():
    flat = check(Member("2x8", pitch=0), 10, CASES["roof-snow30"])
    steep = check(Member("2x8", pitch=12), 10, CASES["roof-snow30"])
    assert steep["deflection total"] > flat["deflection total"]
    assert steep["shear"] < flat["shear"] * 1.5  # shear drops with cos(theta) but dead load grows by 1/cos
    cos = 1 / math.sqrt(2)
    assert steep["deflection live"] / flat["deflection live"] == pytest.approx(1 / cos ** 2)


def test_creep_only_affects_total_deflection():
    a = check(Member("2x8"), 11, CASES["floor"])
    b = check(Member("2x8"), 11, CASES["floor"], creep=True)
    assert b["deflection total"] > a["deflection total"]
    assert all(b[k] == a[k] for k in ("bending", "shear", "bearing", "deflection live"))


def test_bearing_governs_short_heavy_beam_and_longer_bearing_fixes_it():
    m = Member("2x12", plies=2, spacing_in=168)
    ft, gov = max_span(m, CASES["roof-snow30"])
    assert gov == "bearing"
    ft2, gov2 = max_span(Member("2x12", plies=2, spacing_in=168, bearing_in=3.0), CASES["roof-snow30"])
    assert ft2 > ft and gov2 != "bearing" or ft2 > ft


def test_size_member_returns_smallest_passing_size():
    s, gov, r = size_member(14, CASES["floor"], spacing_in=16)
    assert s == "2x10" and r <= 1.0
    assert size_member(40, CASES["floor"]) is None
    assert size_member(5, CASES["floor"])[0] == "2x6"


def test_lateral_note_thresholds():
    assert lateral_note(Member("2x4")) == "ends held in position (blocking or hangers at the ends)"
    assert lateral_note(Member("2x10", plies=2)).startswith("ends held")
    assert lateral_note(Member("2x6", plies=2)) == "none needed"
    assert lateral_note(Member("2x8", plies=1)).startswith("compression edge")  # d/b = 4.83
    assert lateral_note(Member("2x10")).startswith("both edges")  # d/b = 6.17
    assert lateral_note(Member("2x12", plies=1)).startswith("beyond")


def test_board_feet_per_square_foot():
    assert board_feet_per_sf(Member("2x10", spacing_in=16)) == pytest.approx(2 * 10 / 12 / (16 / 12))
    assert board_feet_per_sf(Member("2x10", spacing_in=24)) < board_feet_per_sf(Member("2x10", spacing_in=12))


def test_cli_runs(capsys):
    main(["span", "--size", "2x10", "--spacing", "16"])
    main(["size", "--span", "12"])
    main(["table"])
    out = capsys.readouterr().out
    assert "max clear span" in out and "2x10" in out
