from capture_storage import *
from capture_storage.model import CAMERAS, CARDS


def test_gb_per_hour():
    assert gb_per_hour(8.0) == 3.6


def test_day_gb_scales_linearly():
    assert day_gb(["action camera"], 2) * 2 == day_gb(["action camera"], 4)
    assert day_gb(["action camera"], 4, 0.5) * 2 == day_gb(["action camera"], 4)


def test_cards_only_holds_the_trip_with_headroom():
    p = cards_only(["360 camera"], 4, 7)
    assert p.cards * 512 >= day_gb(["360 camera"], 4) * 7 * HEADROOM
    assert (p.cards - 1) * 512 < day_gb(["360 camera"], 4) * 7 * HEADROOM
    assert p.ssds == 0 and p.exposed_gb == day_gb(["360 camera"], 4) * 7


def test_offload_meets_time_limit_and_holds_copies():
    cams = ["360 camera", "action camera"]
    p = offload(cams, 4, 7, max_offload_h=1.0)
    assert p.offload_h <= 1.0
    assert p.ssds >= 2 and p.exposed_gb == day_gb(cams, 4)


def test_offload_is_monotone_in_time_limit():
    cams = ["360 camera"] * 3
    g = [offload(cams, 4, 7, max_offload_h=h).grams for h in (1.0, 2.0, 4.0)]
    assert g[0] >= g[1] >= g[2]


def test_offload_infeasible_returns_none():
    assert offload(["mirrorless body"] * 8, 8, 7, max_offload_h=0.25) is None


def test_offload_beats_nothing_on_exposure_but_costs_grams():
    cams = ["360 camera", "action camera"]
    a, b = cards_only(cams, 4, 7), offload(cams, 4, 7)
    assert b.exposed_gb < a.exposed_gb and b.grams > a.grams


def test_offload_hours_scale_with_readers_and_copies():
    t = offload_hours(["360 camera"], 4)
    assert abs(offload_hours(["360 camera"], 4, readers=2) * 2 - t) < 1e-9
    assert abs(offload_hours(["360 camera"], 4, copies=2) - 2 * t) < 1e-9


def test_battery_far_heavier_than_card_per_hour():
    for c in CAMERAS:
        assert battery_g_per_hour(c) > 100 * storage_g_per_hour(c)
