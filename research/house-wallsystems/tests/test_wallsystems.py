from house_framing.model import House
from house_wallsystems import SYSTEMS, Climate, evaluate, heat_loss_cost, monte_carlo, net_wall_area, pareto, sample
import random


def test_net_area_less_than_gross():
    h = House()
    gross = 2 * (h.width_ft + h.length_ft) * h.plate_height_in / 12
    assert 0.8 * gross < net_wall_area(h) < gross


def test_more_windows_less_net_area():
    assert net_wall_area(House(windows_long=5)) < net_wall_area(House(windows_long=1))


def test_ranges_are_ordered():
    for s in SYSTEMS:
        for v in (s.cost, s.carbon, s.r):
            assert v[0] <= v[1] <= v[2]


def test_heat_loss_falls_with_r_and_rises_with_hdd():
    assert heat_loss_cost(900, 20) < heat_loss_cost(900, 10)
    assert heat_loss_cost(900, 10, Climate(hdd=8000)) > heat_loss_cost(900, 10, Climate(hdd=2000))


def test_heat_loss_hand_check():
    # 1000 sf at R10, 5000 HDD: 1000/10*5000*24/3412 = 3517 kWh thermal, /3 COP, x $0.15, x annuity(30y,5%)=15.372
    c = Climate()
    assert abs(heat_loss_cost(1000, 10, c) - 1000 / 10 * 5000 * 24 / 3412 / 3 * 0.15 * 15.3725) < 1


def test_evaluate_scales_with_area():
    a = evaluate(SYSTEMS[0], 500)
    b = evaluate(SYSTEMS[0], 1000)
    assert abs(b["cost"] - 2 * a["cost"]) < 1e-9 and abs(b["carbon"] - 2 * a["carbon"]) < 1e-9


def test_samples_stay_in_range():
    rng = random.Random(0)
    for s in SYSTEMS:
        for _ in range(200):
            c, k, r = sample(s, rng)
            assert s.cost[0] <= c <= s.cost[2] and s.carbon[0] <= k <= s.carbon[2] and s.r[0] <= r <= s.r[2]


def test_win_shares_sum_to_one_and_are_deterministic():
    a = monte_carlo(900, n=500, seed=3)
    assert a == monte_carlo(900, n=500, seed=3)
    for m in ("cost", "carbon", "total"):
        assert abs(sum(v[m] for v in a["wins"].values()) - 1) < 1e-9


def test_pareto_drops_dominated():
    assert pareto({"a": (1, 1, 10), "b": (2, 2, 5), "c": (3, 0.5, 5)}) == ["a", "c"]


def test_wood_is_cheapest_at_midpoints():
    cost = {s.name: s.cost[1] for s in SYSTEMS}
    assert min(cost, key=cost.get) == SYSTEMS[0].name
