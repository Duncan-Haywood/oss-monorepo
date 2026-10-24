import math

from house_framing.model import ADVANCED_2X6, House, walls_of
from house_liftnails import (Nail, check_nails, dowel_bearing, nail_capacity, stud_end_nail_demand, stud_len,
                             withdrawal_side_grain, yield_modes)
from house_offsite.model import panelise
from house_panellift import Lift

H, S = House(), ADVANCED_2X6
WALLS = walls_of(H, S)


def test_dowel_bearing_spf():
    assert abs(dowel_bearing(0.42, 0.131) - 3348) < 30


def test_mode_iv_closed_form():
    n = Nail()
    fem, fes = dowel_bearing(n.g_main, n.d), dowel_bearing(n.g_side, n.d)
    re = fem / fes
    want = n.d ** 2 / n.kd * math.sqrt(2 * fem * n.fyb / (3 * (1 + re)))
    assert abs(yield_modes(n)["IV"] - want) < 1e-9


def test_capacity_is_min_mode_times_duration_factor():
    z, mode = nail_capacity(Nail(), cd=1.0)
    assert z == min(yield_modes(Nail()).values())
    assert nail_capacity(Nail(), cd=1.25)[0] == 1.25 * z


def test_capacity_in_plausible_range_for_8d_nail():
    z, _ = nail_capacity(Nail(), cd=1.0)
    assert 50 < z < 120


def test_thicker_side_member_never_weakens():
    assert nail_capacity(Nail(t_side=0.5))[0] >= 0 and nail_capacity(Nail(fyb=120000.0))[0] >= nail_capacity(Nail())[0]


def test_withdrawal_scale():
    assert abs(withdrawal_side_grain(Nail(), pen=1.0) - 1380 * 0.42 ** 2.5 * 0.131) < 1e-9


def test_denser_nailing_lowers_demand():
    w = WALLS[0]
    a, b = panelise(w, 24 * 12)[0]
    r6 = check_nails(w, a, b, H, S, Lift(), spacing_top=6.0)
    r3 = check_nails(w, a, b, H, S, Lift(), spacing_top=3.0)
    assert r3["demand_top_lb"] < r6["demand_top_lb"]


def test_closed_panel_demand_exceeds_open():
    w = WALLS[0]
    a, b = panelise(w, 24 * 12)[0]
    assert check_nails(w, a, b, H, S, Lift(closed=True))["demand_top_lb"] > check_nails(w, a, b, H, S, Lift())["demand_top_lb"]


def test_weight_below_is_less_than_total():
    w = WALLS[0]
    a, b = panelise(w, 24 * 12)[0]
    r = check_nails(w, a, b, H, S, Lift())
    assert 0 < r["below_lb"] < r["weight_lb"]


def test_end_grain_gets_no_credit():
    d, credit = stud_end_nail_demand(H, S, Lift())
    assert credit == 0.0 and d > 0 and stud_len(H, S) == H.plate_height_in - 3.0
