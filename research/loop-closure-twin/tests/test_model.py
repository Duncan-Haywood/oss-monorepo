import math, unittest
from loop_closure_twin import *

T, M = 0.25, 1.0
G = chi2_1_quantile(0.99)


class Tests(unittest.TestCase):
    def test_chi2_quantiles(self):
        self.assertAlmostEqual(chi2_1_quantile(0.95), 3.841458820694124, places=6)
        self.assertAlmostEqual(chi2_1_quantile(0.99), 6.634896601021213, places=6)

    def test_riccati_is_fixed_point_of_predict_update(self):
        x = twin_riccati(T, M)
        post = x * M * M / (x + M * M)
        self.assertAlmostEqual(post + T, x, places=12)
        claim, K = twin_claim(T, M)
        self.assertAlmostEqual(claim, post, places=12)
        self.assertAlmostEqual(K, x / (x + M * M), places=12)

    def test_correct_twin_claim_is_exact(self):
        self.assertAlmostEqual(ungated_real_var(T, T, M), twin_claim(T, M)[0], places=12)
        self.assertAlmostEqual(accept_prob_gaussian(T, T, M, G), 0.99, places=9)

    def test_real_variance_and_rejection_increase_with_drift(self):
        vs = [ungated_real_var(T, r * r * T, M) for r in (1, 1.5, 2, 3)]
        ps = [accept_prob_gaussian(T, r * r * T, M, G) for r in (1, 1.5, 2, 3)]
        self.assertTrue(all(b > a for a, b in zip(vs, vs[1:])))
        self.assertTrue(all(b < a for a, b in zip(ps, ps[1:])))

    def test_ungated_variance_matches_simulation(self):
        for rho in (1.0, 2.0):
            R = rho * rho * T
            r = run_chains(T, R, M, 1e12, chains=300, cycles=300, seed=7)
            self.assertLess(abs(r["mse"] / ungated_real_var(T, R, M) - 1), 0.05)

    def test_gate_locks_out_an_overconfident_twin_but_not_a_correct_one(self):
        ok = run_chains(T, T, M, G, chains=100, cycles=200, seed=1)
        bad = run_chains(T, 9 * T, M, G, chains=100, cycles=200, seed=1)
        ungated = run_chains(T, 9 * T, M, 1e12, chains=100, cycles=200, seed=1)
        self.assertGreater(ok["acc_genuine"], 0.98)
        self.assertGreater(bad["mse"], 20 * ungated["mse"])

    def test_gate_helps_against_aliasing_when_the_twin_is_correct(self):
        on = run_chains(T, T, M, G, pi=0.1, D=6.0, chains=200, cycles=200, seed=2)
        off = run_chains(T, T, M, 1e12, pi=0.1, D=6.0, chains=200, cycles=200, seed=2)
        self.assertLess(on["mse"], off["mse"])
        self.assertLess(on["acc_alias"], 0.5)

    def test_deterministic_and_fit(self):
        a = run_chains(T, T, M, G, chains=20, cycles=50, burn=10, seed=3)
        b = run_chains(T, T, M, G, chains=20, cycles=50, burn=10, seed=3)
        self.assertEqual((a["mse"], a["claim"], a["acc_genuine"]), (b["mse"], b["claim"], b["acc_genuine"]))
        self.assertAlmostEqual(fit_drift([1.0, -1.0, 2.0]), 2.0)


if __name__ == "__main__":
    unittest.main()
