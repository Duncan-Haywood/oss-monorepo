import math
from dataclasses import replace

import pytest

from house_framing.model import (ADVANCED_2X6, CONVENTIONAL_2X4, CONVENTIONAL_2X6, OVE_MEASURES, SPF2, T, House,
                                 Loads, Opening, Wall, apply, column_stability, frame_wall, header_check,
                                 size_header, stud_check, stud_length, takeoff)


def test_plain_wall_stud_count_and_plates():
    # a 16 ft wall at 16 in: layout 0, 16, ..., 176 plus the end stud at 190.5
    w = Wall(192.0, True)
    m = frame_wall(w, House(), CONVENTIONAL_2X6, Loads())
    assert sum(1 for k, *_ in m if k == "stud") == 13
    assert sum(1 for k, *_ in m if k == "plate") == 3


def test_opening_members():
    w = Wall(192.0, True, (Opening(60.0, 36.0, 33.0),))
    m = frame_wall(w, House(), CONVENTIONAL_2X6, Loads())
    kinds = [k for k, *_ in m]
    assert kinds.count("king") == 2 and kinds.count("jack") == 2 and kinds.count("sill") == 1
    assert kinds.count("header") == 2
    # layout studs at 64 and 80 fall inside the 60-96 opening and become cripples below the sill
    assert kinds.count("cripple") == 2
    # kings and jacks span 57 to 99, which removes the layout studs at 64, 80 and 96
    assert kinds.count("stud") == 10


def test_euler_and_column_stability_bounds():
    Cp, FcE = column_stability(1000.0, SPF2["Emin"], 92.625, 5.5)
    assert 0 < Cp < 1
    assert FcE == pytest.approx(0.822 * 510e3 / (92.625 / 5.5) ** 2)
    # a very stocky column approaches Cp = 1
    assert column_stability(1000.0, SPF2["Emin"], 5.0, 5.5)[0] > 0.97


def test_stud_ratio_monotone_in_snow_and_spacing():
    sl = 92.625
    r = [stud_check("2x6", 24, sl, Loads(snow_psf=s)) for s in (0, 30, 60)]
    assert r[0] < r[1] < r[2]
    assert stud_check("2x6", 16, sl, Loads()) < stud_check("2x6", 24, sl, Loads())
    assert stud_check("2x6", 24, sl, Loads()) < stud_check("2x4", 24, sl, Loads())


def test_stud_hand_calc_axial_only():
    # D+S on a 2x6 @24, 28 ft span, 1 ft overhang: (15+30)*15 plf * 2 ft = 1350 lb
    sl = 94.125
    d, A = 5.5, 1.5 * 5.5
    Fc_star = 1150 * 1.15 * 1.1
    Cp, _ = column_stability(Fc_star, 510e3, sl, d)
    expected = (1350 / A / (Fc_star * Cp)) ** 2
    assert stud_check("2x6", 24, sl, Loads()) == pytest.approx(max(expected, 1350 / (1.5 * d) / 425))


def test_header_sizing_grows_with_span_and_load():
    order = ["2x6", "2x8", "2x10", "2x12"]
    sizes = [size_header(span, 675.0, ADVANCED_2X6) for span in (36, 60, 80)]
    assert [order.index(s) for s in sizes] == sorted(order.index(s) for s in sizes)
    assert size_header(36, 2000.0, ADVANCED_2X6) != "2x6"
    assert size_header(200, 2000.0, ADVANCED_2X6) is None
    assert header_check("2x12", 38, 675.0) < header_check("2x6", 38, 675.0)


def test_advanced_uses_less_lumber_and_insulates_better():
    c = takeoff(House(), CONVENTIONAL_2X6)
    a = takeoff(House(), ADVANCED_2X6)
    assert a["board_feet"] < c["board_feet"] and a["pieces"] < c["pieces"]
    assert a["framing_factor"] < c["framing_factor"]
    assert a["r_effective"] > c["r_effective"]
    assert a["stud_ratio"] < 1 and c["stud_ratio"] < 1
    assert a["hangers"] > 0 and c["hangers"] == 0


def test_every_measure_is_harmless_alone():
    base = takeoff(House(), CONVENTIONAL_2X6)
    for m in OVE_MEASURES:
        r = takeoff(House(), apply(CONVENTIONAL_2X6, [m]))
        assert r["board_feet"] <= base["board_feet"] + 1e-9, m
        assert r["ua_walls"] <= base["ua_walls"] + 1e-9, m


def test_all_measures_rebuild_advanced():
    a = apply(CONVENTIONAL_2X6, list(OVE_MEASURES), ADVANCED_2X6.name)
    assert a == ADVANCED_2X6


def test_2x4_r_value_matches_parallel_path_by_hand():
    r = takeoff(House(), CONVENTIONAL_2X4)
    films = 0.68 + 0.45 + 0.62 + 0.17
    ff = r["framing_factor"]
    u_lo = (1 - ff) / (films + 13) + ff / (films + 1.25 * 3.5)
    assert 1 / r["r_effective"] == pytest.approx(u_lo)  # no insulated headers: all wood is one path


def test_bad_opening_rejected():
    with pytest.raises(ValueError):
        frame_wall(Wall(96.0, True, (Opening(80.0, 36.0),)), House(), CONVENTIONAL_2X6, Loads())
