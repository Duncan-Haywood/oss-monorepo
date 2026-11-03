import math
from marine_dr.dr import analytic_rate, run_straight, distance_to_bound


def test_scale_only():
    e, _ = run_straight(5000, scale=0.002)
    assert abs(e - 10.0) < 0.05          # 0.2% of 5 km


def test_bias_only_matches_chord():
    b = math.radians(0.5)
    e, _ = run_straight(5000, bias_rad=b)
    assert abs(e - 5000 * 2 * math.sin(b / 2)) / e < 1e-6


def test_combined_matches_analytic_rate():
    b, s = math.radians(0.3), 0.002
    e, _ = run_straight(8000, scale=s, bias_rad=b)
    # the along-track part is s*L and cross-track is L*sin(b), chord vs sin differ at O(b^2)
    assert abs(e - 8000 * analytic_rate(s, b)) / e < 0.01


def test_fix_resets_error():
    e_free, _ = run_straight(10000, scale=0.002)
    _, m = run_straight(10000, scale=0.002, fix_every_m=1000, fix_sigma_m=0.0)
    assert m < e_free / 5


def test_bound_distance():
    d = distance_to_bound(10.0, 0.002, 0.0)
    assert abs(d - 5000) < 1
