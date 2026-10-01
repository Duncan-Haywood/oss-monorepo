import math, random, unittest
from odometry_twin import *

S1, NU, G = 0.02, 0.05, 3.0


class T(unittest.TestCase):
    def test_phi_inverse(self):
        for p in (0.01, 0.3, 0.975, 0.9986):
            self.assertAlmostEqual(Phi(Phi_inv(p)), p, places=10)
        self.assertAlmostEqual(Phi_inv(0.975), 1.959964, places=5)

    def test_one_step_statistics_do_not_identify_the_bias(self):
        for rho in (0.0, 0.3, 1.0):
            self.assertAlmostEqual(var_real(1, S1, rho), var_twin(1, S1), places=15)
            self.assertAlmostEqual(var_real(50, S1, rho) / var_twin(50, S1), ratio(50, rho), places=12)
        self.assertAlmostEqual(ratio(100, 1.0), 100.0)

    def test_variance_matches_simulation(self):
        rng = random.Random(3)
        T_, rho = 40, 0.1
        es = [sample_error(T_, S1, rho, rng) for _ in range(30000)]
        v = sum(e * e for e in es) / len(es)
        self.assertLess(abs(v / var_real(T_, S1, rho) - 1), 0.03)
        self.assertAlmostEqual(fit_ratio(es, T_, S1), ratio(T_, rho), delta=0.15 * ratio(T_, rho))

    def test_intervals_hit_their_target_exactly(self):
        for rho in (0.0, 0.05, 0.5):
            Tr = interval_real(0.5, S1, rho, 0.05)
            self.assertAlmostEqual(miss_prob(var_real(Tr, S1, rho), 0.5), 0.05, places=9)
        Tt = interval_twin(0.5, S1, 0.05)
        self.assertAlmostEqual(miss_prob(var_twin(Tt, S1), 0.5), 0.05, places=9)
        self.assertAlmostEqual(interval_real(0.5, S1, 0.0, 0.05), Tt, places=9)
        self.assertLess(interval_real(0.5, S1, 0.05, 0.05), Tt)

    def test_twin_recall_is_nominal_only_when_noise_is_white(self):
        nominal = 2 * Phi(G) - 1
        for Tn in (10, 100, 1000):
            self.assertAlmostEqual(recall(Tn, S1, 0.0, NU, G, "twin"), nominal, places=12)
            self.assertAlmostEqual(recall(Tn, S1, 0.2, NU, G, "real"), nominal, places=12)
        r = [recall(Tn, S1, 0.05, NU, G, "twin") for Tn in (10, 50, 200, 1000, 10000)]
        self.assertTrue(all(b < a for a, b in zip(r, r[1:])))
        self.assertLess(r[-1], 0.15)  # decays like 2Phi(G/sqrt(rho T))-1
        self.assertTrue(recall(100, S1, 0.01, NU, G) > recall(100, S1, 0.05, NU, G) > recall(100, S1, 0.3, NU, G))

    def test_recall_and_false_accept_match_monte_carlo(self):
        rng = random.Random(5)
        T_, rho, d = 60, 0.05, 0.8
        sb, sw = S1 * math.sqrt(rho), S1 * math.sqrt(1 - rho)
        n, a, f = 60000, 0, 0
        h = G * math.sqrt(var_twin(T_, S1) + NU ** 2)
        for _ in range(n):
            r = T_ * rng.gauss(0, sb) + math.sqrt(T_) * rng.gauss(0, sw) + rng.gauss(0, NU)
            a += abs(r) <= h
            f += abs(r + d) <= h
        self.assertAlmostEqual(a / n, recall(T_, S1, rho, NU, G), delta=0.006)
        self.assertAlmostEqual(f / n, false_accept(T_, S1, rho, NU, G, d), delta=0.006)

    def test_calibrated_gate_never_worse_recall_but_accepts_more_aliases(self):
        for Tn in (50, 200):
            self.assertGreater(recall(Tn, S1, 0.05, NU, G, "real"), recall(Tn, S1, 0.05, NU, G, "twin"))
            self.assertGreater(false_accept(Tn, S1, 0.05, NU, G, 1.0, "real"), false_accept(Tn, S1, 0.05, NU, G, 1.0, "twin"))

    def test_chain_recall_matches_exact_when_gate_is_open_loop_first_segment(self):
        rng = random.Random(9)
        # calibrated model, no aliasing: accepted fraction of true closures near the nominal coverage
        res = simulate_chain(100, S1, 0.05, NU, G, 0.0, 0.0, 0.5, "real", rng, segments=6000)
        self.assertGreater(res[2], 0.97)

    def test_chain_deterministic_and_calibrated_beats_twin_on_error(self):
        a = simulate_chain(200, S1, 0.05, NU, G, 0.0, 0.0, 0.5, "twin", random.Random(1), segments=3000)
        b = simulate_chain(200, S1, 0.05, NU, G, 0.0, 0.0, 0.5, "twin", random.Random(1), segments=3000)
        c = simulate_chain(200, S1, 0.05, NU, G, 0.0, 0.0, 0.5, "real", random.Random(1), segments=3000)
        self.assertEqual(a, b)
        self.assertLess(c[1], a[1])

    def test_fit_repair_improves_with_n(self):
        rng = random.Random(7)
        r = [recall_with_estimate(200, S1, 0.05, NU, G, n, rng, reps=1500)[0] for n in (2, 10, 100)]
        nominal = 2 * Phi(G) - 1
        self.assertGreater(r[1], recall(200, S1, 0.05, NU, G))
        self.assertLess(abs(r[2] - nominal), abs(r[0] - nominal))


if __name__ == "__main__":
    unittest.main()
