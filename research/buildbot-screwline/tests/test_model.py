import math

import pytest

from buildbot_screwline import model as M

MM = 1e-3


def test_counts():
    assert M.screws_per_member(16) == 7 and M.screws_per_member(12) == 9
    assert sum(map(len, M.schedule(16).values())) == 28 and sum(map(len, M.schedule(12).values())) == 36


def test_window_widths():
    assert M.band("edge") * 1000 == pytest.approx((0.75 * 25.4 - 0.138 * 25.4 / 2 - 0.375 * 25.4) / 2)
    assert M.band("field") > M.band("edge") * 4


def test_no_robot_noise_matches_closed_form():
    # one shared error per member: only the narrowest window per member binds; edge members dominate
    s = 1.5 * MM
    want = math.erf(M.band("edge") / (s * math.sqrt(2))) ** 2 * math.erf(M.band("field") / (s * math.sqrt(2))) ** 2
    got = M.simulate(16, s, 0.0, trials=120000)[0]
    assert got == pytest.approx(want, abs=0.01)


def test_more_misses_allowed_never_hurts_and_ceiling_is_harder():
    a = M.simulate(16, 2 * MM, 0.9 * MM, max_miss=0)[0]
    b = M.simulate(16, 2 * MM, 0.9 * MM, max_miss=3)[0]
    assert b >= a
    assert M.simulate(12, 2 * MM, 0.9 * MM, trials=40000)[0] <= M.simulate(16, 2 * MM, 0.9 * MM, trials=40000)[0] + 0.01


def test_servo_is_worse_than_shared():
    assert M.simulate(16, 1.5 * MM, 0.0, policy="servo", trials=40000)[0] < M.simulate(16, 1.5 * MM, 0.0, trials=40000)[0]


def test_averaging_allows_root_n():
    one = M.required_meas(16, 0.9 * MM, trials=8000)
    four = M.required_meas(16, 0.9 * MM, n_read=4, trials=8000)
    assert four / one == pytest.approx(2.0, rel=0.15)
