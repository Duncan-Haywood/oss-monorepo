import unittest

from wagering_experts import (EqualWeights, Hedge, WageringMechanism,
                              RegimeEnvironment, make_experts, run)


def aggs(n, **kw):
    return {"equal": EqualWeights(n), "wswm": WageringMechanism(n, **kw),
            "fs": WageringMechanism(n, alpha=0.05, **kw)}


class TestSimulation(unittest.TestCase):
    def test_regimes_cycle(self):
        e = RegimeEnvironment(3, 10)
        self.assertEqual([e.regime(t) for t in (0, 9, 10, 25, 30)], [0, 0, 1, 2, 0])

    def test_wagering_beats_equal_weights(self):
        n = len(make_experts(3))
        r = run(aggs(n, fraction=0.5), rounds=2000, seed=5)
        self.assertLess(r["fs"].loss, r["equal"].loss)

    def test_fixed_share_helps_with_recurrence(self):
        n = len(make_experts(3))
        r = run(aggs(n, fraction=0.5), rounds=6000, period=200, seed=6)
        self.assertLess(r["fs"].loss, r["wswm"].loss)

    def test_deterministic(self):
        n = len(make_experts(3))
        a = run(aggs(n, fraction=0.5), rounds=300, seed=9)["fs"].loss
        b = run(aggs(n, fraction=0.5), rounds=300, seed=9)["fs"].loss
        self.assertEqual(a, b)

    def test_hedge_runs(self):
        n = len(make_experts(3))
        r = run({"h": Hedge(n, alpha=0.05)}, rounds=500, seed=1)
        self.assertGreaterEqual(r["h"].regret_per_round, -0.02)
