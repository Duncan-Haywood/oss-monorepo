import pytest

from house_continuous.model import Beam, check as eq_check, max_span as eq_max_span
from house_spans.model import CASES, Member
from house_unequal.cli import main
from house_unequal.model import check, max_total, worst

EI = 1.4e6 * 1.5 * 9.25 ** 3 / 12


def test_equal_spans_reproduce_house_continuous_check():
    m = Member("2x10", spacing_in=16)
    for c in ("floor", "ceiling", "roof-snow30"):
        a = check(m, [14.0, 14.0], CASES[c])
        b = eq_check(m, 14.0, CASES[c], 2)
        for k in b:
            assert a[k] == pytest.approx(b[k], rel=1e-9)


def test_equal_ratio_total_is_twice_the_equal_span_limit():
    m = Member("2x8", spacing_in=16)
    tot, _ = max_total(m, CASES["ceiling"], 1.0)
    one, _ = eq_max_span(m, CASES["ceiling"], 2)
    assert tot == pytest.approx(2 * one, abs=0.03)


def test_unequal_two_span_reactions_match_three_moment_equation():
    # uniform w on spans a, b over three pin supports: M_B = -w(a^3 + b^3) / (8(a + b))
    a, b, w = 100.0, 160.0, 0.3
    bm = Beam([a, b], EI, [w, w])
    mb = w * (a ** 3 + b ** 3) / (8 * (a + b))
    assert -bm.moment(a) == pytest.approx(mb, rel=1e-9)
    assert bm.R[0] == pytest.approx(w * a / 2 - mb / a, rel=1e-9)
    assert bm.R[2] == pytest.approx(w * b / 2 - mb / b, rel=1e-9)
    assert sum(bm.R) == pytest.approx(w * (a + b), rel=1e-9)


def test_moving_the_beam_off_centre_never_lengthens_the_total_width():
    m = Member("2x10", spacing_in=16)
    totals = [max_total(m, CASES["floor"], r)[0] for r in (1.0, 0.8, 0.6, 0.5)]
    assert totals == sorted(totals, reverse=True)


def test_long_span_of_a_bending_governed_joist_grows_as_the_short_span_shrinks():
    m = Member("2x10", spacing_in=16)
    long_span = []
    for r in (1.0, 0.7, 0.5):
        tot, gov = max_total(m, CASES["floor"], r)
        assert gov == "bending"
        long_span.append(tot / (1 + r))
    assert long_span == sorted(long_span)


def test_deflection_is_checked_against_each_spans_own_length():
    m = Member("2x8", spacing_in=16)
    r = check(m, [10.0, 20.0], CASES["ceiling"])
    r_swapped = check(m, [20.0, 10.0], CASES["ceiling"])
    for k in r:
        assert r[k] == pytest.approx(r_swapped[k], rel=1e-9)  # mirror image


def test_worst_names_the_largest_ratio():
    assert worst({"a": 0.5, "b": 1.2}) == ("b", 1.2)


def test_cli_prints_every_ratio(capsys):
    main(["--size", "2x8", "--case", "ceiling"])
    out = capsys.readouterr().out
    assert out.count("  ratio ") == 6 and "governed by" in out


def test_short_span_end_lifts_off_when_live_load_is_on_the_long_span_only():
    from house_unequal.model import end_reaction_min_lb
    m = Member("2x10", spacing_in=16)
    assert end_reaction_min_lb(m, (6.0, 17.0), CASES["floor"]) < 0.0
    assert end_reaction_min_lb(m, (15.0, 15.0), CASES["floor"]) > 0.0
