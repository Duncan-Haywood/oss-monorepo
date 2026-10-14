import math, random, unittest
from workcell_twin import *

W, A = 64.0, 1.0


class T(unittest.TestCase):
    def test_gamma_cdf_matches_erlang_closed_form(self):
        for x in (0.4, 2.5, 9.0, 30.0):
            self.assertAlmostEqual(gamma_cdf(3, x), 1 - math.exp(-x) * (1 + x + x * x / 2), places=12)
        self.assertAlmostEqual(gamma_cdf(0.5, 0.3), math.erf(math.sqrt(0.3)), places=10)

    def test_exponential_expected_max_is_harmonic_number(self):
        for k in (2, 8, 64):
            self.assertAlmostEqual(emax(k, 1.0), sum(1 / i for i in range(1, k + 1)), places=6)

    def test_expected_max_monotone_in_k_and_in_variance(self):
        for kap in (0.5, 1, 4, 16):
            v = [emax(k, kap) for k in (1, 2, 4, 8, 16)]
            self.assertTrue(all(b > a for a, b in zip(v, v[1:])))
        for k in (2, 8, 32):
            self.assertTrue(emax(k, 1) > emax(k, 4) > emax(k, 16) > 1)

    def test_expected_max_matches_monte_carlo(self):
        rng = random.Random(1)
        for k, kap in ((8, 4.0), (8, 0.5)):
            xs = [max(rng.gammavariate(kap, 1 / kap) for _ in range(k)) for _ in range(40000)]
            m = sum(xs) / len(xs)
            se = (sum((x - m) ** 2 for x in xs) / len(xs) / len(xs)) ** 0.5
            self.assertLess(abs(m - emax(k, kap)), 4 * se)

    def test_twin_optimum_is_sqrt_W_over_a_and_real_optimum_is_larger_for_fixed_shape(self):
        kt = argmin_k(lambda k: twin_cost(k, W, A))
        self.assertEqual(kt, 8)
        for kap in (1, 4, 16):
            kr = argmin_k(lambda k: real_cost(k, W, A, kap))
            self.assertGreater(kr, kt)  # fixed-shape branches: the twin under-buys stations
        self.assertGreater(regret(kt, W, A, 1), regret(kt, W, A, 16))

    def test_twin_promise_is_missed_with_the_erlang_probability(self):
        self.assertAlmostEqual(promise_prob(8, 1.0), (1 - math.exp(-1)) ** 8, places=12)
        self.assertLess(promise_prob(8, 1.0), 0.03)
        self.assertGreater(promise_prob(8, 1e6), 0.0)  # tends to 1/2^k as the branch becomes deterministic-ish (median vs mean)
        self.assertLess(promise_prob(8, 16), promise_prob(1, 16))

    def test_no_variance_no_gap(self):
        self.assertAlmostEqual(emax(8, 1e5), 1.0, delta=0.01)
        self.assertLess(regret(8, W, A, 1e5), 1e-3)

    def test_continuous_condition_root_is_near_exact_exponential_optimum(self):
        lo, hi = 6.0, 16.0
        for _ in range(60):
            mid = (lo + hi) / 2
            (lo, hi) = (mid, hi) if continuous_condition(mid, W, A) < 0 else (lo, mid)
        kr = argmin_k(lambda k: real_cost(k, W, A, 1))
        self.assertLess(abs(lo - kr), 1.0)  # (k/k_twin)^2 = H_k - 1

    def test_chain_model_keeps_the_twin_optimum_but_not_its_promise(self):
        for c in (0.5, 1.0):
            k = argmin_k(lambda j: chain_cost(j, 64, c, A), 24)
            self.assertEqual(k, 8)
            self.assertGreater(chain_cost(8, 64, c, A), twin_cost(8, 64, A) * 1.1)

    def test_quantile_inverts_the_cdf_power(self):
        for k, kap in ((1, 1.0), (8, 4.0)):
            x = quantile_x(k, kap, 0.95)
            self.assertAlmostEqual(gamma_cdf(kap, kap * x) ** k, 0.95, places=10)
        self.assertAlmostEqual(quantile_x(8, 1.0, 0.95), -math.log(1 - 0.95 ** (1 / 8)), places=9)

    def test_table_interpolates_emax(self):
        tab = EmaxTable(kmax=8, lo=0.5, hi=64, m=24, steps=800)
        for k, kap in ((4, 1.0), (8, 5.3), (8, 30.0)):
            self.assertAlmostEqual(tab(k, kap), emax(k, kap), delta=2e-3)

    def test_fit_kappa_recovers_shape(self):
        rng = random.Random(3)
        xs = [rng.gammavariate(4, 0.25) for _ in range(20000)]
        self.assertAlmostEqual(fit_kappa(xs), 4, delta=0.2)

    def test_mc_cost_matches_exact(self):
        m, se = mc_cost(8, W, A, lambda r: r.gammavariate(4, 0.25), 20000, 5)
        self.assertLess(abs(m - real_cost(8, W, A, 4)), 4 * se)


if __name__ == "__main__":
    unittest.main()
