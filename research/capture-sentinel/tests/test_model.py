import math

from capture_sentinel.model import (Detector, ZoneDetector, bessel_ratio, best_sentinel, expected_miss, miss_all,
                                    miss_all_independent, miss_at, ring_angles, rig_energy_wh, simulate_miss)

D = Detector()


def test_miss_at_limits():
    assert abs(miss_at(D, 0.0) - D.miss_front) < 1e-12
    assert abs(miss_at(D, math.pi) - D.miss_back) < 1e-12


def test_bessel_ratio_known_values():
    assert bessel_ratio(0.0) == 0.0
    assert abs(bessel_ratio(1.0) - 0.4463899658) < 1e-6      # I1(1)/I0(1)
    assert 0.98 < bessel_ratio(50.0) < 1.0


def test_uniform_facing_makes_every_ring_position_equal():
    ms = [expected_miss(D, c, 0.0) for c in ring_angles(6)]
    assert max(ms) - min(ms) < 1e-12
    assert abs(ms[0] - (D.miss_front + D.miss_back) / 2) < 1e-12


def test_best_sentinel_faces_the_favourite_direction():
    i, m = best_sentinel(D, ring_angles(4), 2.0)
    assert i == 0 and m < expected_miss(D, 180.0, 2.0)


def test_closed_form_matches_simulation():
    for c in (0.0, 90.0, 180.0):
        sim = simulate_miss(D, [c], 2.0, 40000, 1)
        assert abs(sim - expected_miss(D, c, 2.0)) < 0.01


def test_any_of_n_miss_matches_simulation():
    cams = ring_angles(4)
    sim = simulate_miss(D, cams, 2.0, 40000, 2, mode="any")
    assert abs(sim - miss_all(D, cams, 2.0)) < 0.005


def test_spread_ring_misses_are_negatively_correlated():
    # a subject facing away from one camera faces towards another, so all-miss is rarer than independence says
    cams = ring_angles(4)
    assert miss_all(D, cams, 2.0) < miss_all_independent(D, cams, 2.0)


def test_clustered_cameras_misses_are_positively_correlated():
    cams = [0.0, 10.0, 20.0, 30.0]
    assert miss_all(D, cams, 2.0) > miss_all_independent(D, cams, 2.0)


def test_shared_miss_equals_independent_when_one_camera():
    assert abs(miss_all(D, [0.0], 2.0) - expected_miss(D, 0.0, 2.0)) < 1e-6


def test_more_detectors_cost_more_false_alarm_energy():
    assert rig_energy_wh(4, 4, 0.99) > rig_energy_wh(4, 1, 0.9)
    assert rig_energy_wh(4, 1, 0.9) < 4 * 5.0 * 16


def test_zone_detector_steps_and_wraps():
    z = ZoneDetector(0.05, 0.4, 1.0, front_deg=45.0, away_deg=120.0)
    assert miss_at(z, 0.0) == 0.05 and miss_at(z, math.radians(44)) == 0.05
    assert miss_at(z, math.radians(90)) == 0.4 and miss_at(z, math.radians(-90)) == 0.4
    assert miss_at(z, math.radians(180)) == 1.0 and miss_at(z, math.radians(-350)) == 0.05


def test_zone_detector_uniform_facing_is_the_arc_weighted_mean():
    z = ZoneDetector(0.05, 0.4, 1.0, front_deg=45.0, away_deg=120.0)
    want = (90 * 0.05 + 150 * 0.4 + 120 * 1.0) / 360
    assert abs(expected_miss(z, 0.0, 0.0) - want) < 2e-3


def test_zone_closed_form_matches_simulation_and_best_sentinel_faces_favourite():
    z = ZoneDetector(0.05, 0.4, 0.4)
    for c in (0.0, 90.0, 180.0):
        assert abs(simulate_miss(z, [c], 2.0, 40000, 3) - expected_miss(z, c, 2.0)) < 0.01
    assert best_sentinel(z, ring_angles(4), 2.0)[0] == 0
