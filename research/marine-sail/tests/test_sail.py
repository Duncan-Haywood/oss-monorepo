import math
from marine_sail.polar import Craft, Polar
from marine_sail.route import Scene, isochrone, fly, greedy

C = Craft()


def test_head_to_wind_is_stalled():
    assert C.speed(0.0, 8.0) == 0.0


def test_best_upwind_angle_is_in_the_sailing_range():
    (vmg, a), _ = Polar(C, 8.0).best_vmg()
    assert 25 <= math.degrees(a) <= 50 and vmg > 0


def test_speed_rises_with_wind_on_a_beam_reach():
    v = [C.speed(math.radians(90), w) for w in (4, 8, 12)]
    assert v[0] < v[1] < v[2]


def test_speed_stays_near_hull_speed_scale():
    # 4 m waterline: hull speed 1.34*sqrt(13.1 ft) = 4.9 kn = 2.5 m/s; the wave term caps it near there
    assert C.speed(math.radians(90), 12.0) < 4.5


def test_upwind_time_matches_distance_over_vmg():
    s = Scene(tws=8.0, wd0=0.0)
    goal = (0.0, 30000.0)
    (vmg, _), _ = Polar(C, 8.0).best_vmg()
    t = greedy(C, s, (0.0, 0.0), goal, 0.0)
    assert abs(t - 29000.0 / vmg) / t < 0.06   # 1 km arrival radius


def test_tack_penalty_costs_time_and_aware_plan_is_no_worse():
    s = Scene(tws=4.0, wd0=0.0)
    start, goal = (0.0, 0.0), (7000.0, 38000.0)
    p0 = isochrone(C, s, start, goal, 0.0)
    pa = isochrone(C, s, start, goal, 120.0)
    t_free = fly(C, s, start, goal, p0, 0.0)
    t_ign = fly(C, s, start, goal, p0, 120.0)
    t_aw = fly(C, s, start, goal, pa, 120.0)
    assert t_ign > t_free
    assert t_aw <= t_ign
