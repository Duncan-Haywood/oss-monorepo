import math

from house_framing.model import ADVANCED_2X6, House, Wall, walls_of
from house_offsite.model import panelise
from house_panellift import (Lift, best_picks, check_panel, hands_needed, moment_diagram, panel_weight,
                             weight_profile, wind_speed_for_swing)

H, S = House(), ADVANCED_2X6
WALLS = walls_of(H, S)


def test_moment_is_zero_at_both_free_ends():
    prof = [2.0] * 240
    ms = moment_diagram(prof, (50, 190))
    assert abs(ms[0]) < 1e-9 and abs(ms[-1]) < 1e-6


def test_two_picks_uniform_beam_matches_closed_form():
    # picks at 0.2071 L give the minimum moment w L^2 / 46.6
    L, w = 240, 2.0
    ps, m = best_picks([w] * L, 2, grid=1.0)
    assert abs(m - w * L * L / 46.6) / m < 0.02
    assert abs(ps[0] / L - 0.2071) < 0.01


def test_more_picks_never_increase_the_moment():
    prof = [2.0] * 288
    ms = [best_picks(prof, n)[1] for n in (1, 2, 3)]
    assert ms[0] > ms[1] > ms[2]


def test_closed_panels_are_heavier_and_window_weight_counts():
    w = WALLS[0]
    o = panel_weight(weight_profile(w, 0, 240, H, S, Lift(closed=False)))
    c = panel_weight(weight_profile(w, 0, 240, H, S, Lift(closed=True)))
    assert c > o
    solid = Wall(240.0, True, ())
    cs = panel_weight(weight_profile(solid, 0, 240, H, S, Lift(closed=True)))
    assert cs < c  # a glazed unit (6 lb/ft2) outweighs the sheathed wall it replaces (about 4 lb/ft2)


def test_weight_is_plausible_per_square_foot():
    w = WALLS[0]
    p = panel_weight(weight_profile(w, 0, 240, H, S, Lift())) / (240 * H.plate_height_in / 144)
    assert 2.5 < p < 6.0  # lb/ft2 of an open sheathed 2x6 wall


def test_panels_pass_plate_bending_with_two_picks():
    for wi, w in enumerate(WALLS):
        for a, b in panelise(w, 288):
            r = check_panel(w, a, b, H, S, Lift(closed=True), 2)
            assert r["ratio_bending"] < 0.5 and abs(sum([r["pick_load_lb"]] * 2) - r["weight_lb"] * 1.5) < 1e-6


def test_hands_and_wind():
    assert hands_needed(51) == 1 and hands_needed(52) == 2
    v = wind_speed_for_swing(500, 150, 10, 1.5)
    f = 0.00256 * v * v * 1.5 * 150
    assert abs(f / 500 - math.tan(math.radians(10))) < 1e-9
    assert wind_speed_for_swing(1000, 150) > v
