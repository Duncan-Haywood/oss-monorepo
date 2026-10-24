import pytest

from buildbot_mobilebase import model as M


def test_move_time_parallel_and_serial():
    a, b = (0.0, 0.0), (1.0, 0.5)
    assert M.move_time(a, b, 0.5, 0.25, 2.0, True) == pytest.approx(4.0)     # max(2, 2) + 2
    assert M.move_time(a, b, 0.5, 0.1, 0.0, True) == pytest.approx(5.0)      # lift 5 s is longer
    assert M.move_time(a, b, 0.5, 0.1, 0.0, False) == pytest.approx(7.0)     # 2 + 5


def test_best_order_picks_the_short_path():
    st = [(0.0, 0.0, {0}), (3.0, 0.0, {1}), (1.0, 0.0, {2}), (2.0, 0.0, {3})]
    order, total = M.best_order(st, lambda p, q: abs(p[0] - q[0]))
    assert total == pytest.approx(3.0)
    assert order in ([0, 2, 3, 1], [1, 3, 2, 0])


def test_best_order_matches_brute_force():
    from itertools import permutations
    st = [(0.1, 0.0, {0}), (0.9, 1.2, {1}), (0.5, 0.3, {2}), (1.1, 0.0, {3}), (0.2, 1.0, {4})]
    cost = lambda p, q: M.move_time(p, q, 0.5, 0.1, 2.0)
    _, total = M.best_order(st, cost)
    brute = min(sum(cost(st[p[i]][:2], st[p[i + 1]][:2]) for i in range(4)) for p in permutations(range(5)))
    assert total == pytest.approx(brute)


def test_one_stance_has_no_moves():
    assert M.best_order([(0.0, 0.0, {0})], lambda p, q: 99.0) == ([0], 0.0)


def test_faster_base_is_never_slower():
    st = [(0.0, 0.0, {0}), (0.8, 1.0, {1}), (0.4, 0.5, {2})]
    slow = M.best_order(st, lambda p, q: M.move_time(p, q, 0.2, 0.05, 2.0))[1]
    fast = M.best_order(st, lambda p, q: M.move_time(p, q, 1.0, 0.5, 2.0))[1]
    assert fast < slow


def test_parallel_never_slower_than_serial():
    st = [(0.0, 0.0, {0}), (0.8, 1.0, {1}), (0.4, 0.5, {2})]
    par = M.best_order(st, lambda p, q: M.move_time(p, q, 0.5, 0.1, 1.0, True))[1]
    ser = M.best_order(st, lambda p, q: M.move_time(p, q, 0.5, 0.1, 1.0, False))[1]
    assert par <= ser
