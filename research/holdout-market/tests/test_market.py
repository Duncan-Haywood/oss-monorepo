import random
import unittest
from holdout_market import (Market, make_data, sgd, log_loss, hill_climb_attack, population_loss)


def setup(seed=0, d=10, nh=200):
    rng = random.Random(seed)
    ts = [rng.gauss(0, 1) for _ in range(d)]
    hold = make_data(ts, nh, rng)
    return rng, ts, hold


class T(unittest.TestCase):
    def test_telescoping_payout_equals_published_improvement(self):
        rng, ts, hold = setup()
        for mode in ("raw", "ladder"):
            m = Market([0.0] * 10, hold, mode=mode, eta=0.02)
            for _ in range(5):
                X, y = make_data(ts, 60, rng)
                m.submit(sgd(m.theta, X, y, epochs=3, rng=rng))
            self.assertAlmostEqual(m.paid, m.B * (m.pub0 - m.pub), places=12)
            self.assertLessEqual(m.paid, m.budget_bound())

    def test_copying_pays_nothing(self):
        _, _, hold = setup()
        m = Market([0.1] * 10, hold)
        self.assertEqual(m.submit(list(m.theta)), 0.0)

    def test_splitting_never_hurts_and_sub_eta_gains_unpaid(self):
        rng, ts, hold = setup(1)
        X, y = make_data(ts, 300, rng)
        t1 = sgd([0.0] * 10, X, y, epochs=5, rng=rng)
        steps = lambda a, b, m_: [[u + (v - u) * (i + 1) / m_ for u, v in zip(a, b)] for i in range(m_)]
        for mode, expect_equal in (("raw", True), ("ladder", False)):  # ladder: gate is vs published loss
            one = Market([0.0] * 10, hold, mode=mode, eta=0.02)
            one.submit(t1)
            many = Market([0.0] * 10, hold, mode=mode, eta=0.02)
            for th in steps([0.0] * 10, t1, 40):
                many.submit(th)
            if expect_equal:  # final published loss <= loss of the last (identical) submission
                self.assertGreaterEqual(many.paid, one.paid - 1e-12)
            else:  # ladder pays on the rounded grid: splitting changes the total by at most one rung
                self.assertLessEqual(abs(many.paid - one.paid), one.eta * one.B + 1e-12)
        tiny = Market([0.0] * 10, hold, mode="ladder", eta=0.5)  # improvements below eta are unpaid
        self.assertEqual(tiny.submit([0.02 * v for v in t1]), 0.0)

    def test_hill_climb_overfits_raw_more_than_ladder(self):
        gaps = {}
        for mode in ("raw", "ladder"):
            g = 0.0
            for seed in range(3):
                rng, ts, hold = setup(seed, d=20, nh=100)
                pop = make_data(ts, 4000, rng)
                th = sgd([0.0] * 20, *make_data(ts, 400, rng), epochs=5, rng=rng)
                m = Market(th, hold, mode=mode, eta=0.05)
                hill_climb_attack(m, 1500, 0.05, rng)
                paid_gain = m.pub0 - m.pub
                true_gain = population_loss(th, pop) - population_loss(m.theta, pop)
                g += paid_gain - true_gain
            gaps[mode] = g / 3
        self.assertGreater(gaps["raw"], 0.02)
        self.assertLess(gaps["ladder"], gaps["raw"] / 2)


    # Quality round 98 (portfolio/quality/audits/2026-11-22-holdout-market.json).
    def test_ladder_gate_refuses_gains_under_one_rung(self):
        _, _, hold = setup(2)
        theta = [0.05] * 10
        L = log_loss(theta, *hold)
        for eta in (0.013, 0.017, 0.019, 0.023, 0.029, 0.031, 0.037):
            r = round(L / eta) * eta
            if r < L:  # L sits just above a rung: publish one rung higher so pub - L is in (eta/2, eta)
                break
        m = Market([0.0] * 10, hold, mode="ladder", eta=eta)
        m.pub = r + eta
        self.assertGreater(m.pub - L, eta / 2)
        self.assertLess(m.pub - L, eta)
        self.assertEqual(m.submit(theta), 0.0)  # without the gate it would be paid one rung
        self.assertEqual(m.accepted, 0)
        m.pub = r + 2 * eta  # now the gain clears the gate and is paid on the grid
        self.assertAlmostEqual(m.submit(theta), 2 * eta, places=12)

    def test_splitting_overshoot_counterexample(self):
        """Splitting is NOT bounded by one rung when the loss dips along the path (whitepaper result 2)."""
        seed, d = 5, 5
        rng = random.Random(seed)
        ts = [rng.gauss(0, 1) for _ in range(d)]
        hold = make_data(ts, 50, rng)
        X, y = make_data(ts, 15, rng)
        t1 = sgd([0.0] * d, X, y, lr=0.5, epochs=20, rng=rng)
        one = Market([0.0] * d, hold, mode="ladder", eta=0.02)
        one.submit(t1)
        many = Market([0.0] * d, hold, mode="ladder", eta=0.02)
        for i in range(40):
            many.submit([v * (i + 1) / 40 for v in t1])
        self.assertEqual(one.paid, 0.0)
        self.assertAlmostEqual(many.paid, 0.26, places=9)


if __name__ == "__main__":
    unittest.main()
