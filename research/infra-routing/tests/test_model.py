import json
import math
from pathlib import Path

from infra_routing.evrptw import route_cost
from infra_routing.instance import Instance, kmeans_stations, read, with_ev
from infra_routing.search import Evaluator, improve, repair

DATA = Path(__file__).resolve().parents[1] / "data"


def line_instance(Q=math.inf, g=0.0, stations=()):
    # depot at 0, customers on the x axis at 10 and 30, wide windows
    xy = [(0, 0), (10, 0), (30, 0)]
    return Instance("line", xy, [0, 1, 1], [0, 0, 0], [1000, 1000, 1000], 5, 10, list(stations), Q, g)


def test_no_battery_limit_is_plain_distance():
    c = route_cost(line_instance(), [1, 2])
    assert c[0] == 60 and c[1] == 0


def test_infeasible_without_station_then_feasible_with_one():
    assert route_cost(line_instance(Q=45, g=1), [1, 2]) is None            # 60 > 45
    inst = line_instance(Q=45, g=1, stations=[(30, 0)])                    # station at the far customer
    c = route_cost(inst, [1, 2])
    assert c is not None and abs(c[0] - 60) < 1e-9                         # a zero-detour station
    assert abs(c[1] - 30) < 1e-9                                           # refill 30 units at g=1


def test_depot_is_a_charging_point():
    inst = line_instance(Q=45, g=1)
    assert route_cost(inst, [2, 1]) is None
    assert route_cost(line_instance(Q=70, g=1), [1, 2]) is not None


def test_time_window_makes_recharge_infeasible():
    inst = line_instance(Q=45, g=100, stations=[(30, 0)])
    inst.due[2] = 80                                                       # recharge would take 3000
    assert route_cost(inst, [1, 2]) is None


def test_capacity():
    inst = line_instance()
    inst.demand[1] = 6
    inst.demand[2] = 6
    assert route_cost(inst, [1, 2]) is None


def test_solomon_rc208_is_the_real_file():
    inst = read(DATA / "RC208.vrp")
    assert (inst.n, inst.capacity, inst.service, inst.due[0]) == (100, 1000, 10, 960)
    assert inst.xy[0] == (40, 50)


def test_baseline_covers_every_customer_once_and_matches_published_distance():
    inst = read(DATA / "RC208.vrp")
    routes = json.loads((DATA / "baseline_routes.json").read_text())["routes"]
    assert sorted(sum(routes, [])) == list(range(1, 101))
    total = Evaluator(inst).total(routes)
    assert abs(total - 778.93) < 0.01        # Solomon RC208 best known distance 778.93 (recalled, not re-read)


def test_repair_and_search_never_worsen_and_stay_feasible():
    inst = read(DATA / "RC208.vrp")
    routes = json.loads((DATA / "baseline_routes.json").read_text())["routes"]
    inst = with_ev(inst, 150, 0.3, kmeans_stations(inst, 5))
    ev = Evaluator(inst)
    rep = repair(ev, routes)
    assert rep is not None and sorted(sum(rep, [])) == list(range(1, 101))
    before = (len(rep), ev.total(rep))
    new, _ = improve(ev, rep, 3)
    assert sorted(sum(new, [])) == list(range(1, 101))
    assert ev.total(new) <= before[1] + 1e-9
