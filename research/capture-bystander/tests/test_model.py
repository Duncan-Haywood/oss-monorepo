import math
import random

from capture_bystander.model import (CAMERAS, FOV, angular_size_deg, crowd_leak, distance_at, face_px,
                                     identifiable_in_frame, identifiable_range, leak_at, markov_misses,
                                     recall, track_leaks)


def test_recall_is_half_at_midpoint_and_monotone():
    assert recall(20, 20) == 0.5
    assert recall(10, 20) < recall(20, 20) < recall(40, 20) < 1
    assert recall(0, 20) == 0


def test_face_pixels_scale_with_resolution_and_inverse_distance():
    ppr = CAMERAS["360 8K"]
    assert math.isclose(face_px(5, ppr) * 5, face_px(10, ppr) * 10)
    assert math.isclose(face_px(5, 2 * ppr), 2 * face_px(5, ppr))
    assert math.isclose(ppr, 7680 / (2 * math.pi))


def test_body_detector_leaks_less_than_face_detector_far_away():
    ppr = CAMERAS["360 8K"]
    assert leak_at(15, ppr, "body") < leak_at(15, ppr, "face")
    assert leak_at(15, ppr, "both") <= leak_at(15, ppr, "body")


def test_leak_share_is_scale_free_but_range_is_not():
    a, b = CAMERAS["360 8K"], CAMERAS["4K 85mm-eq 24deg"]
    assert math.isclose(crowd_leak(a, "face"), crowd_leak(b, "face"), abs_tol=2e-3)
    assert identifiable_range(b, 32) > 5 * identifiable_range(a, 32)


def test_leak_falls_with_smaller_identifiable_size_threshold_reversed():
    ppr = CAMERAS["360 8K"]
    assert crowd_leak(ppr, "face", ident_px=64) < crowd_leak(ppr, "face", ident_px=16)
    assert crowd_leak(ppr, "face", face_mid=10) < crowd_leak(ppr, "face", face_mid=30)


def test_no_identifiable_people_inside_minimum_distance():
    assert crowd_leak(100.0, "face", ident_px=32) == 0.0
    assert identifiable_in_frame("360 5.7K", 0.05, ident_px=10000) == 0.0


def test_identifiable_count_scales_with_density_and_fov():
    assert math.isclose(identifiable_in_frame("360 8K", 0.1), 2 * identifiable_in_frame("360 8K", 0.05))
    assert set(FOV) == set(CAMERAS)


def test_markov_miss_rate_matches_marginal_and_run_length():
    rng = random.Random(1)
    m = markov_misses(0.2, 10, 200000, rng)
    assert abs(sum(m) / len(m) - 0.2) < 0.02
    runs = [len(r) for r in "".join("1" if x else "0" for x in m).split("0") if r]
    assert 8 < sum(runs) / len(runs) < 12
    assert markov_misses(0.0, 5, 10, rng) == [False] * 10 and markov_misses(1.0, 5, 10, rng) == [True] * 10


def test_correlated_misses_reduce_any_frame_leak_but_not_frame_share():
    fs1, af1, _ = track_leaks(0.13, 1, 150, 400, seed=3)
    fs2, af2, _ = track_leaks(0.13, 150, 150, 400, seed=3)
    assert af1 > af2 and abs(fs1 - fs2) < 0.04


def test_offline_track_hold_leaks_at_most_per_frame_any():
    fs, af, off = track_leaks(0.3, 5, 60, 500, seed=2)
    assert off <= af


def test_angular_size_roundtrip():
    assert math.isclose(angular_size_deg(1.0, distance_at(1.0, 2.0)), 2.0)
