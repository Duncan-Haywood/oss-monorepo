import math, random, unittest
from twin_audit import *

a = 0.9


class T(unittest.TestCase):
    def test_e_process_has_mean_one_under_h0(self):
        # short horizon and a narrow prior keep the sampling distribution of E light-tailed enough for a Monte Carlo mean
        rng = random.Random(1)
        tot, n = 0.0, 40000
        for _ in range(n):
            S = R = 0.0
            for _ in range(5):
                u = rng.gauss(0, 1)
                S += u * u
                R += u * rng.gauss(0, 1)
            tot += math.exp(log_e(S, R, 0.1))
        self.assertAlmostEqual(tot / n, 1.0, delta=0.03)

    def test_ville_false_alarm_below_alpha_and_peeking_z_test_is_not(self):
        rng = random.Random(2)
        e = sum(audit_run(a, 1.0, 1.0, rng, horizon=1500) is not None for _ in range(400)) / 400
        z = sum(peeking_z_alarm(rng, 1500) for _ in range(400)) / 400
        self.assertLess(e, 0.05)
        self.assertGreater(z, 0.3)

    def test_information_rate_matches_simulation(self):
        rng = random.Random(3)
        b, k, v = 1.2, optimal_gain(a, 1.0), 0.5
        x, s, n = 0.0, 0.0, 200000
        for _ in range(n):
            u = -k * x + math.sqrt(v) * rng.gauss(0, 1)
            s += u * u
            x = a * x + b * u + rng.gauss(0, 1)
        self.assertAlmostEqual(s / n / info_rate(a, b, k, v), 1.0, delta=0.03)

    def test_delay_matches_prediction_within_20_percent(self):
        rng = random.Random(4)
        k = optimal_gain(a, 1.0)
        for db in (0.3, -0.3):
            d = [audit_run(a, 1 + db, 1.0, rng, horizon=5000) for _ in range(120)]
            self.assertTrue(all(d))
            pred = predicted_delay(db, info_rate(a, 1 + db, k))
            self.assertAlmostEqual(sum(d) / len(d) / pred, 1.0, delta=0.2)

    def test_regret_times_delay_nearly_gap_free_but_regret_is_not(self):
        k = optimal_gain(a, 1.0)
        prod = [regret(a, 1 + db, k) * predicted_delay(db, info_rate(a, 1 + db, k)) for db in (0.05, 0.1, 0.2, 0.3)]
        self.assertLess(max(prod) / min(prod), 1.4)
        self.assertGreater(regret(a, 1.3, k) / regret(a, 1.05, k), 30)

    def test_cautious_control_hides_the_gap(self):
        u = [info_rate(a, 1.2, optimal_gain(a, 1.0, r=r)) for r in (0.01, 0.1, 1.0, 10.0)]
        self.assertTrue(all(x > y for x, y in zip(u, u[1:])))
        self.assertGreater(u[0] / u[-1], 10)

    def test_dither_rule_is_linear_in_v_and_pays_only_for_gross_gaps(self):
        k = optimal_gain(a, 1.0)
        for b in (0.9, 1.5):
            r0 = regret(a, b, k)
            U = lambda v: info_rate(a, b, k, v)
            C = lambda v: r0 + dither_cost_rate(a, b, k, v=v)
            slope_u = (U(2) - U(0)) / 2
            self.assertAlmostEqual(U(1) - U(0), slope_u, places=9)
            rho_u, price = dither_payoff_threshold(a, b, 1.0)
            self.assertEqual(C(1) / U(1) < C(0) / U(0), rho_u > price)
        self.assertLess(*dither_payoff_threshold(a, 1.2, 1.0))
        self.assertGreater(*dither_payoff_threshold(a, 0.2, 1.0))


if __name__ == "__main__":
    unittest.main()
