from ratelimit_burst import *
from ratelimit_burst.analysis import two_burst_search


def test_sliding_log_never_exceeds_limit():
    assert flood_pattern_search(SlidingLog, 10, 20)[0] == 10
    assert two_burst_search(SlidingLog, 5, 8) == 5


def test_fixed_window_reaches_double():
    # last tick of one window plus first of the next: limit at each end
    assert flood_pattern_search(FixedWindow, 10, 20)[0] == 20


def test_token_bucket_and_leaky_bucket_bounded_by_limit_plus_refill():
    for cls in (TokenBucket, LeakyBucket):
        worst = flood_pattern_search(cls, 10, 20)[0]
        assert 10 < worst <= 20


def test_sliding_counter_exceeds_limit_but_not_double():
    worst = two_burst_search(SlidingCounter, 10, 20)
    assert 10 < worst < 20


def test_every_limiter_admits_limit_from_cold():
    for cls in LIMITERS:
        lim = cls(7, 14)
        assert sum(lim.allow(0) for _ in range(20)) == 7


def test_max_window_admitted():
    assert max_window_admitted([0, 1, 2, 10], 3) == 3
    assert max_window_admitted([0, 3], 3) == 1


def test_poisson_long_run_rate_near_limit():
    for cls in LIMITERS:
        per_window, _ = poisson_overload(cls, 50, 100, 3.0, windows=300)
        assert 45 <= per_window <= 52, (cls.name, per_window)
