import math, random, unittest
from twin_evaluation import *

P = dict(mu=1.0, s=1.0, se=1.0, b=0.7, g=1.0, tau=1.0)


def mc_var(n, N, lam, reps, seed, **p):
    rng = random.Random(seed)
    ests = []
    for _ in range(reps):
        R, T = sample_pairs(n, p["mu"], p["s"], p["se"], p["b"], p["g"], p["tau"], rng)
        ex = sample_twin(N - n, p["mu"], p["s"], p["b"], p["g"], p["tau"], rng)
        ests.append(cv_estimate(R, T, ex, lam))
    m = sum(ests) / reps
    return m, sum((e - m) ** 2 for e in ests) / (reps - 1)


class M(unittest.TestCase):
    def test_t_quantile_known_values(self):
        self.assertAlmostEqual(t_quantile(0.975, 10), 2.2281, places=3)
        self.assertAlmostEqual(t_quantile(0.95, 5), 2.0150, places=3)

    def test_moments_faithful_and_noise_free(self):
        _, _, _, rho = moments(1.0, 1.0, 1.0, 1.0)
        self.assertAlmostEqual(rho, 0.5)              # faithful twin: rho = eta (context share)
        _, _, _, rho0 = moments(1.0, 1.0, 1.0, 0.0)
        self.assertAlmostEqual(rho0, math.sqrt(0.5))  # noise-free twin: rho = sqrt(eta)

    def test_estimator_unbiased_despite_twin_bias(self):
        m, _ = mc_var(20, 200, None, 4000, 1, **P)
        self.assertLess(abs(m - P["mu"]), 0.03)       # twin mean is mu + 0.7

    def test_variance_formula_known_lambda(self):
        sR, sT, cov, rho = moments(P["s"], P["se"], P["g"], P["tau"])
        lam = cov / sT ** 2
        for n, N in ((20, 20), (20, 200), (50, 500)):
            _, v = mc_var(n, N, lam, 6000, 2, **P)
            self.assertLess(abs(v / var_cv(sR, rho, n, N) - 1), 0.06)

    def test_optimal_allocation_beats_perturbations(self):
        sR, rho, cR, cT, C = 1.4, 0.8, 10.0, 1.0, 1000.0
        n, N, V = optimal_alloc(C, cR, cT, sR, rho)
        self.assertAlmostEqual(n * cR + N * cT, C, places=8)
        self.assertAlmostEqual(V, var_cv(sR, rho, n, N), places=10)
        for f in (0.8, 1.25):
            n2 = n * f
            N2 = (C - n2 * cR) / cT
            self.assertGreater(var_cv(sR, rho, n2, N2), V)

    def test_threshold_is_where_twin_stops_paying(self):
        sR, rho, cR, C = 1.0, 0.9, 1.0, 100.0
        w = worth_threshold(rho)
        _, _, V = optimal_alloc(C, cR, w * 0.999, sR, rho)
        self.assertLess(V, sR ** 2 * cR / C)
        _, _, V2 = optimal_alloc(C, cR, w * 1.001, sR, rho)
        self.assertAlmostEqual(V2, sR ** 2 * cR / C)
        # just below the threshold the optimum's variance equals the real-only variance
        self.assertAlmostEqual(_v_at(w, sR, rho, cR, C), sR ** 2 * cR / C, delta=1e-3)

    def test_interval_covers_reasonably(self):
        rng = random.Random(5)
        hit, reps = 0, 1500
        for _ in range(reps):
            R, T = sample_pairs(30, P["mu"], P["s"], P["se"], P["b"], P["g"], P["tau"], rng)
            ex = sample_twin(300, P["mu"], P["s"], P["b"], P["g"], P["tau"], rng)
            lo, hi = cv_interval(R, T, ex)
            hit += lo <= P["mu"] <= hi
        self.assertGreater(hit / reps, 0.92)


def _v_at(w, sR, rho, cR, C):
    a, b = 1 - rho * rho, rho * rho
    den = math.sqrt(a * cR) + math.sqrt(b * w * cR)
    return sR * sR * den * den / C


if __name__ == "__main__":
    unittest.main()
