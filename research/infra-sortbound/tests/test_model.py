import os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))
from dataclasses import replace
from infra_sortbound import Config, load_items, arrivals, online, optimum, brute_force

ITEMS = load_items()


def tiny(rng, n):
    t, jobs = 0.0, []
    for _ in range(n):
        t += rng.expovariate(2.0)
        jobs.append({"in": t, "out": t + 2.0, "val": rng.choice([0.15, 0.3, 1.0, 4.0]),
                     "dur": 0.5 + rng.random()})
    return jobs


def test_table_is_taco():
    assert len(ITEMS) == 4784


def test_dp_matches_brute_force_over_all_orders():
    # Agreeable deadlines: the best of all subsets in all orders equals the arrival-order DP.
    rng = random.Random(3)
    for _ in range(25):
        jobs = tiny(rng, rng.randint(3, 7))
        lo, hi = optimum(jobs, eps=0.001)
        bf = brute_force(jobs)
        assert lo - 1e-9 <= bf <= hi + 1e-9
        assert hi - lo < 0.5     # grid steps this fine nearly close the bracket


def test_bounds_bracket_and_dominate_every_online_policy():
    c = Config(horizon=300)
    for k in range(5):
        jobs = arrivals(c, ITEMS, random.Random(k))
        lo, hi = optimum(jobs)
        assert lo <= hi
        for p in ("fifo", "value", "density"):
            assert online(jobs, p) <= hi + 1e-9


def test_light_load_every_policy_reaches_the_optimum():
    c = Config(speed=0.05, density=1.0, arm_speed=50.0, t_base=0.01, horizon=3000)
    jobs = arrivals(c, ITEMS, random.Random(2))
    lo, hi = optimum(jobs)
    for p in ("fifo", "value", "density"):
        assert abs(online(jobs, p) - lo) < 0.01 * lo


def test_grid_refinement_tightens_the_bracket():
    jobs = arrivals(Config(horizon=300), ITEMS, random.Random(7))
    g1 = optimum(jobs, eps=0.1)
    g2 = optimum(jobs, eps=0.01)
    assert g2[1] - g2[0] <= g1[1] - g1[0] + 1e-9
    assert g1[0] - 1e-9 <= g2[1] and g2[0] - 1e-9 <= g1[1]


def test_deterministic():
    a = arrivals(Config(horizon=200), ITEMS, random.Random(1))
    b = arrivals(Config(horizon=200), ITEMS, random.Random(1))
    assert a == b and optimum(a) == optimum(b)


def test_rolling_sits_between_queue_only_and_optimum():
    c = Config()
    from infra_sortbound import run_many, rolling
    for s in run_many(c, ITEMS, 4, seed=7):
        lo, hi = optimum(s, 0.005)
        full = rolling(s, 5.0)
        assert rolling(s, 0.0) <= hi + 1e-9
        assert full <= hi + 1e-9
        assert full >= 0.97 * lo
        assert full >= rolling(s, 0.0) - 1e-9


def test_rolling_with_full_view_matches_optimum_on_tiny_instances():
    from infra_sortbound import rolling
    rng = random.Random(5)
    for _ in range(25):
        jobs = tiny(rng, rng.randint(3, 7))
        assert abs(rolling(jobs, 1e9, eps=0.001) - brute_force(jobs)) < 0.5
