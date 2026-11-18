from capture_storage import *
from capture_storage.model import CAMERAS, CARDS, card_loads, schedule_h, evening_h


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


# Added 2026-11-18 after the quality audit (portfolio/quality/audits/2026-11-17-capture-storage.json): a card is
# read by one reader at a time, so a plan never has more readers than cards, and its time is a per-card schedule.
RIGS = [["360 camera", "action camera", "phone telephoto", "mirrorless body"][: n] for n in range(1, 5)]


def test_plan_never_uses_more_readers_than_cards():
    for cams in RIGS:
        for reads in ("once", "per-copy"):
            for spare in (0, 1):
                p = offload(cams, 4, 7, max_offload_h=4.0, reads=reads, spare=spare)
                assert p is not None and p.readers <= p.cards


def test_one_card_cannot_be_split_over_readers():
    # one 360 camera, 216 GB on a single card: 216e3 MB / 90 MB/s = 0.667 h however many readers are offered
    loads = card_loads(["360 camera"], 4, card=512)
    assert loads == [216.0]
    assert abs(schedule_h(loads, 8) - 216e3 / 90 / 3600) < 1e-9
    # read once per copy: two passes of that card, 1.33 h, cannot meet 1 h
    assert offload(["360 camera"], 4, 7, reads="per-copy") is None


def test_lpt_schedule_by_hand():
    # cards 216, 180, 180, 180, 108 GB on 4 readers: the 108 GB card joins a 180 GB reader -> 288 GB -> 0.889 h
    assert abs(schedule_h([216, 180, 180, 180, 108], 4) - 288e3 / 90 / 3600) < 1e-9
    assert abs(schedule_h([216, 180, 180, 180, 108], 1) - 864e3 / 90 / 3600) < 1e-9


def test_headline_four_camera_plan_pinned():
    # by hand: 256 GB cards (360 + action + phone one each, mirrorless two of 180 GB) = 5 x 0.4 g;
    # trip 6,048 GB x 1.1 on 4 TB SSDs = 2 per copy, 4 x 75 g; 4 readers x 25 g -> 402 g, 0.889 h
    p = offload(RIGS[3], 4, 7)
    assert (p.cards, p.ssds, p.readers) == (5, 4, 4)
    assert abs(p.grams - 402.0) < 1e-9 and abs(p.offload_h - 288e3 / 90 / 3600) < 1e-9


def test_ssd_write_rate_floors_the_evening():
    # 864 GB into one SSD at 400 MB/s takes 0.6 h even with a reader per card
    loads = [10.0] * 86 + [4.0]
    assert abs(evening_h(loads, 8) - max(schedule_h(loads, 8), 864e3 / 400 / 3600)) < 1e-9
    assert evening_h(loads, 8) >= 864e3 / 400 / 3600 - 1e-9


def test_per_copy_doubles_the_evening():
    loads = card_loads(RIGS[3], 4, card=256)
    assert abs(evening_h(loads, 4, reads="per-copy") - 2 * evening_h(loads, 4)) < 1e-9
