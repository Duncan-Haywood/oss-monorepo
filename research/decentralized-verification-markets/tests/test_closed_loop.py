import unittest

from verification_markets.adaptive import brier
from verification_markets.closed_loop import fixed, proportional, run_closed_loop, threshold
from verification_markets.simulation import SimulationConfig, run_simulation


def _base(seed=1, n_adv=8, nh=14):
    return run_simulation(SimulationConfig(
        n_tasks=1500, n_honest=nh, n_lazy=0, n_colluding=0, n_adversarial=0,
        n_late_whitewash=n_adv, whitewash_prob=0.0, seed=seed))


def _adv(r):
    return [v.id for v in r.verifiers if v.strategy == "late_whitewash"]


class TestClosedLoop(unittest.TestCase):
    def test_controllers(self):
        self.assertEqual(fixed(0.3)(0.9, {}), 0.3)
        self.assertEqual(proportional(2.0, 0.2)(0.1, {}), 0.0)
        self.assertEqual(proportional(2.0, 0.2)(0.9, {}), 1.0)
        t, s = threshold(0.3, 0.8), {}
        self.assertEqual([t(0.9, s), t(0.2, s), t(0.5, s), t(0.85, s)], [1.0, 0.0, 0.0, 1.0])

    def test_zero_lie_rate_is_honest(self):
        r = _base()
        o = run_closed_loop(r, _adv(r), lambda: fixed(0.0), block_size=100)
        self.assertEqual(o.lie_rate, 0.0)
        self.assertLess(brier(o.prices, r, r.scoring_tasks), 0.003)

    def test_realised_lie_rate_tracks_fixed(self):
        r = _base()
        o = run_closed_loop(r, _adv(r), lambda: fixed(0.5), block_size=100)
        self.assertAlmostEqual(o.lie_rate, 0.5, delta=0.1)

    def test_adaptive_beats_static_at_lower_lie_rate(self):
        # Observing its own weight lets the adversary do more damage per lie
        # than a static adversary that lies about as often.
        wins = 0
        for seed in (1, 2, 3, 4):
            r = _base(seed)
            a = run_closed_loop(r, _adv(r), lambda: proportional(2.0, 0.2), block_size=100)
            f = run_closed_loop(r, _adv(r), lambda: fixed(a.lie_rate), block_size=100)
            wins += brier(a.prices, r, r.scoring_tasks) > brier(f.prices, r, r.scoring_tasks)
        self.assertGreaterEqual(wins, 3)

    def test_hidden_weights_reduce_controller_to_constant(self):
        # With the weight hidden the controller sees a constant, so a
        # proportional controller with gain*(1-w_min)>=1 always lies.
        r = _base()
        o = run_closed_loop(r, _adv(r), lambda: proportional(2.0, 0.2), block_size=100, observation_noise=None)
        self.assertAlmostEqual(o.lie_rate, 1.0, delta=0.01)

    def test_hiding_weights_beats_public_against_adaptive(self):
        wins = 0
        for seed in (1, 2, 3, 4):
            r = _base(seed)
            pub = run_closed_loop(r, _adv(r), lambda: threshold(), block_size=100)
            hid = run_closed_loop(r, _adv(r), lambda: threshold(), block_size=100, observation_noise=None)
            wins += brier(hid.prices, r, r.scoring_tasks) < brier(pub.prices, r, r.scoring_tasks)
        self.assertGreaterEqual(wins, 3)

    def test_default_args_unchanged(self):
        r = _base()
        a = run_closed_loop(r, _adv(r), lambda: fixed(0.5), block_size=100)
        b = run_closed_loop(r, _adv(r), lambda: fixed(0.5), block_size=100, observation_noise=0.0, recovery_decay=None)
        self.assertEqual(a.prices, b.prices)

    def test_does_not_mutate_base(self):
        r = _base()
        before = {i: dict(d) for i, d in r.reports.items()}
        run_closed_loop(r, _adv(r), lambda: fixed(1.0), block_size=100)
        self.assertEqual(before, r.reports)


if __name__ == "__main__":
    unittest.main()
