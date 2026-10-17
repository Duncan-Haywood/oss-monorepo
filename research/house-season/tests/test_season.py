from dataclasses import replace

from house_schedule import Params, simulate
from house_season import CLIMATES, MONTHS, run_many_seasonal, simulate_seasonal
from house_season.model import month_at


def test_flat_climate_reproduces_house_schedule():
    # the cure stretch is 0 and the weather loss is 15% in every month, so the
    # sampling order and arithmetic must match the parent model exactly
    for s in range(20):
        for m in (0, 5, 11):
            a = simulate_seasonal(Params(), s, m, CLIMATES["flat"])
            b = simulate(Params(), s)
            assert abs(a[0] - b[0]) < 1e-9 and abs(a[1] - b[1]) < 1e-9


def test_month_at_wraps_and_advances():
    assert month_at(0, 0) == 0
    assert month_at(0, 11) == 11
    assert month_at(22, 11) == 0      # ~31 calendar days from 1 Dec is January
    assert month_at(261, 6) == 6      # a working year is ~365 calendar days


def test_cold_winter_start_is_slower_than_summer_start():
    cold = CLIMATES["cold"]
    jan = sum(run_many_seasonal(Params(), 0, cold, 400)[0])
    jun = sum(run_many_seasonal(Params(), 5, cold, 400)[0])
    assert jan > jun


def test_zero_loss_climate_has_no_season():
    calm = type(CLIMATES["flat"])("calm", (0.0,) * 12, (0.0,) * 12)
    a = run_many_seasonal(Params(), 0, calm, 50)[0]
    b = run_many_seasonal(Params(), 6, calm, 50)[0]
    assert a == b


def test_more_weather_loss_never_faster_with_same_draws():
    base = CLIMATES["mild"]
    worse = type(base)("worse", tuple(min(.9, x + .1) for x in base.loss), base.cure_extra)
    for s in range(30):
        assert simulate_seasonal(Params(), s, 0, worse)[0] >= simulate_seasonal(Params(), s, 0, base)[0] - 1e-9


def test_twelve_month_names():
    assert len(MONTHS) == 12
    assert all(len(c.loss) == 12 and len(c.cure_extra) == 12 for c in CLIMATES.values())
