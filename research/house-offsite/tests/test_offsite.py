from dataclasses import replace

from house_framing.model import ADVANCED_2X6, House, walls_of
from house_offsite import (SHEET, Process, compare, pack_sheets, panelise, plan_trips,
                           shell_quantities, sheathing_pieces)
from house_offsite.model import EDGE

H = House()
WALLS = walls_of(H, ADVANCED_2X6)


def test_panels_tile_each_wall_and_respect_limit():
    for w in WALLS:
        ps = panelise(w, 24 * 12)
        assert ps[0][0] == 0 and abs(ps[-1][1] - w.length_in) < 1e-9
        assert all(abs(a2 - b1) < 1e-9 for (_, b1), (a2, _) in zip(ps[:-1], ps[1:]))
        assert all(b - a <= 24 * 12 + 1e-9 for a, b in ps)


def test_no_panel_break_inside_an_opening():
    for w in WALLS:
        for _, b in panelise(w, 12 * 12)[:-1]:
            assert all(not (op.pos_in - EDGE < b < op.pos_in + op.width_in + EDGE) for op in w.openings)


def test_sheathing_area_equals_wall_area_minus_openings():
    for w in WALLS:
        holes = sum(op.width_in * (H.head_in - op.sill_in) for op in w.openings)
        got = sum(a * b for a, b in sheathing_pieces(w, H, 0, w.length_in))
        assert abs(got - (w.length_in * H.plate_height_in - holes)) < 1e-6


def test_panel_breaks_do_not_change_covered_area():
    q = shell_quantities(H, ADVANCED_2X6, 12.0)
    a = lambda ps: sum(w * h for w, h in ps)
    assert abs(a(q["site_pieces"]) - a(q["fac_pieces"])) < 1e-6


def _valid(sheets, pieces, rotate=False):
    assert sum(len(s) for s in sheets) == len(pieces)
    for s in sheets:
        for i, (x, y, w, h) in enumerate(s):
            assert x >= -1e-9 and y >= -1e-9 and x + w <= SHEET[0] + 1e-9 and y + h <= SHEET[1] + 1e-9
            for (x2, y2, w2, h2) in s[:i]:
                assert x + w <= x2 + 1e-9 or x2 + w2 <= x + 1e-9 or y + h <= y2 + 1e-9 or y2 + h2 <= y + 1e-9


def test_packings_are_valid_and_bounded_below():
    q = shell_quantities(H, ADVANCED_2X6, 24.0)
    for pieces in (q["site_pieces"], q["fac_pieces"]):
        for order, fit, keep in (("given", "first", 12), ("area", "best", 4), ("area", "first", 4)):
            sh = pack_sheets(pieces, order=order, fit=fit, min_keep=keep)
            _valid(sh, pieces)
            assert len(sh) >= q["lower_bound_sheets"] - 0 or len(sh) * SHEET[0] * SHEET[1] >= sum(w * h for w, h in pieces)


def test_too_big_piece_raises():
    try:
        pack_sheets([(60.0, 20.0)])
    except ValueError:
        return
    raise AssertionError


def test_trips_hold_every_panel_within_trailer():
    q = shell_quantities(H, ADVANCED_2X6, 24.0)
    trips = plan_trips(q["panels"])
    assert all(sum(t) <= 48.0 + 1e-9 for t in trips)
    assert sum(len(t) for t in trips) >= 1
    one = plan_trips(q["panels"], stack_max=1)
    assert len(one) >= len(trips)


def test_factory_ratio_one_and_no_overheads_gives_no_labour_saving():
    from house_offsite.model import labour_hours
    q = shell_quantities(H, ADVANCED_2X6, 24.0)
    s, f = labour_hours(q, Process(factory_ratio=1.0), 40, 40)
    assert abs(s - f) < 1e-9


def test_no_weather_site_days_equal_work_days():
    p = Process(weather_loss=0.0)
    r = compare(p, draws=5)
    q = r["q"]
    from house_offsite.model import labour_hours
    s_h, _ = labour_hours(q, p, r["site_sheets"], r["fac_sheets"])
    assert abs(r["site_days"] - s_h / (p.crew * p.hours_per_day)) < 1e-9


def test_more_weather_never_helps_site():
    a = compare(Process(weather_loss=0.05), draws=300)["site_days"]
    b = compare(Process(weather_loss=0.30), draws=300)["site_days"]
    assert b > a


def test_deterministic():
    assert compare(draws=50)["site_days"] == compare(draws=50)["site_days"]
