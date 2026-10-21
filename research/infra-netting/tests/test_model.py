import itertools
import random
from infra_netting import *


def test_bounds_two_banks_offsetting():
    # A pays B 10 then B pays A 10: upper bound 10 (A needs 10 first), lower bound 0 (nets to zero)
    pays = [(0.1, 0, 1, 10.0), (0.2, 1, 0, 10.0)]
    ub, lb, gross = bounds(pays, 2)
    assert (ub, lb, gross) == (10.0, 0.0, 20.0)


def test_lower_never_above_upper_and_bilateral_between():
    rng = random.Random(1)
    for _ in range(20):
        pays = gen_day(rng, 8, 120, 1.0, 1.5)
        ub, lb, gross = bounds(pays, 8)
        bil = bilateral_need(pays, 8)
        assert lb <= bil + 1e-9 <= gross + 1e-9
        assert lb <= ub <= gross + 1e-9


def test_three_cycle_needs_no_liquidity_after_resolution():
    # A->B, B->C, C->A, all 5, nobody has money: FIFO gridlocks, resolution settles all three
    pays = [(0.1, 0, 1, 5.0), (0.2, 1, 2, 5.0), (0.3, 2, 0, 5.0)]
    d0, u0, _ = simulate(pays, 3, [0, 0, 0], False)
    d1, u1, alg = simulate(pays, 3, [0, 0, 0], True)
    assert u0 == 1.0 and u1 == 0.0 and alg == 1.0
    assert d1 < d0


def test_full_liquidity_means_no_delay():
    rng = random.Random(2)
    pays = gen_day(rng, 6, 80, 1.0, 1.0)
    ub, _, _ = bounds(pays, 6)
    # liquidity equal to total gross for every bank: nothing ever queues
    gross = sum(p[3] for p in pays)
    d, u, _ = simulate(pays, 6, [gross] * 6, False)
    assert d == 0.0 and u == 0.0


def test_resolution_is_maximal_prefix_vector():
    # brute force: the algorithm's prefix vector is feasible and no feasible vector dominates it
    rng = random.Random(3)
    for _ in range(40):
        n = 3
        queues = [[(rng.choice([1.0, 2.0, 3.0]), rng.choice([j for j in range(n) if j != i])) for _ in range(rng.randint(0, 3))] for i in range(n)]
        bal = [rng.choice([0.0, 1.0, 2.0]) for _ in range(n)]
        k = resolve(queues, bal)

        def feasible(kv):
            ex = list(bal)
            for i in range(n):
                for v, r in queues[i][:kv[i]]:
                    ex[i] -= v
                    ex[r] += v
            return all(e >= -1e-12 for e in ex)

        assert feasible(k)
        for kv in itertools.product(*[range(len(q) + 1) for q in queues]):
            if feasible(kv):
                assert not all(a >= b for a, b in zip(kv, k)) or tuple(kv) == tuple(k)


def test_metrics_stay_in_range():
    rng = random.Random(4)
    pays = gen_day(rng, 5, 60, 1.0, 1.0)
    # delay is between 0 and 1 and unsettled share between 0 and 1 for any liquidity
    for liq in ([0] * 5, [1] * 5, [50] * 5):
        for res in (False, True):
            d, u, a = simulate(pays, 5, liq, res)
            assert 0 <= d <= 1 + 1e-9 and 0 <= u <= 1 + 1e-9 and 0 <= a <= 1 + 1e-9


def test_resolution_never_delays_more_value_unsettled():
    rng = random.Random(5)
    for _ in range(10):
        pays = gen_day(rng, 6, 100, 1.0, 1.5)
        ub, lb, g = bounds(pays, 6)
        liq = [(lb + 0.3 * (ub - lb)) / 6] * 6
        _, u0, _ = simulate(pays, 6, liq, False)
        _, u1, _ = simulate(pays, 6, liq, True)
        assert u1 <= u0 + 1e-9
